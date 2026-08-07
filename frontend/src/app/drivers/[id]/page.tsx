"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Mail, Phone, IdCard, Calendar, Save, Trash2, Car, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api, getDriver, updateDriver, deleteDriver, listVehicles } from "@/lib/api";
import { toast } from "sonner";
import type { Driver, Vehicle } from "@/types";

export default function DriverProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const driverId = Number(params.id);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseCategories, setLicenseCategories] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [medicalCheckDate, setMedicalCheckDate] = useState("");
  const [isActive, setIsActive] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const d = await getDriver(driverId);
      setDriver(d);
      setFirstName(d.first_name);
      setLastName(d.last_name);
      setEmail(d.email || "");
      setPhone(d.phone || "");
      setLicenseNumber(d.license_number || "");
      setLicenseCategories(d.license_categories || "");
      setLicenseExpiry(d.license_expiry ? d.license_expiry.slice(0, 10) : "");
      setMedicalCheckDate(d.medical_check_date ? d.medical_check_date.slice(0, 10) : "");
      setIsActive(d.is_active);

      const vehiclesRes = await listVehicles();
      const assigned = vehiclesRes.items.find((v) => v.driver_id === driverId);
      setVehicle(assigned || null);
    } catch (err: any) {
      toast.error(err.message || "Erreur de chargement");
      router.push("/drivers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [driverId]);

  async function save() {
    if (!driver) return;
    setSaving(true);
    try {
      const updated = await updateDriver(driver.id, {
        first_name: firstName,
        last_name: lastName,
        email: email || null,
        phone: phone || null,
        license_number: licenseNumber || null,
        license_categories: licenseCategories || null,
        license_expiry: licenseExpiry || null,
        medical_check_date: medicalCheckDate || null,
        is_active: isActive,
      } as Partial<Driver>);
      setDriver(updated);
      toast.success("Conducteur mis à jour");
    } catch (err: any) {
      toast.error(err.message || "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!driver) return;
    if (!confirm(`Supprimer ${driver.first_name} ${driver.last_name} ?`)) return;
    try {
      await deleteDriver(driver.id);
      toast.success("Conducteur supprimé");
      router.push("/drivers");
    } catch (err: any) {
      toast.error(err.message || "Erreur de suppression");
    }
  }

  if (loading || !driver) {
    return (
      <AppShell>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  const licenseExpired = driver.license_expiry && new Date(driver.license_expiry) < new Date();
  const licenseExpiringSoon =
    driver.license_expiry &&
    !licenseExpired &&
    new Date(driver.license_expiry) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/drivers">
              <Button variant="ghost" size="icon" className="rounded-xl">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {driver.first_name} {driver.last_name}
              </h1>
              <p className="text-sm text-muted-foreground">{driver.email || "Aucun email"}</p>
            </div>
          </div>
          <Badge className={cn("rounded-lg border-0 px-3 py-1 font-medium", isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
            {isActive ? "Actif" : "Inactif"}
          </Badge>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="overflow-hidden rounded-2xl border-none bg-card shadow-sm shadow-black/5 lg:col-span-2">
            <div className="relative h-32 bg-gradient-to-br from-primary to-blue-600">
              <div className="absolute -bottom-10 left-6 flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-card bg-card text-2xl font-bold text-primary shadow-lg">
                {driver.first_name[0]}{driver.last_name[0]}
              </div>
            </div>
            <CardContent className="pt-14">
              <CardTitle className="mb-4 text-lg font-semibold">Informations</CardTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Prénom</Label>
                  <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Nom</Label>
                  <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Téléphone</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license">Numéro de permis</Label>
                  <Input id="license" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="categories">Catégories</Label>
                  <Input id="categories" value={licenseCategories} onChange={(e) => setLicenseCategories(e.target.value)} placeholder="B, C, D..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="licenseExpiry">Expiration du permis</Label>
                  <Input
                    id="licenseExpiry"
                    type="date"
                    value={licenseExpiry}
                    onChange={(e) => setLicenseExpiry(e.target.value)}
                    className={cn(licenseExpired && "border-rose-400 text-rose-600", licenseExpiringSoon && "border-amber-400 text-amber-600")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="medical">Visite médicale</Label>
                  <Input id="medical" type="date" value={medicalCheckDate} onChange={(e) => setMedicalCheckDate(e.target.value)} />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between rounded-xl bg-muted/40 p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Conducteur actif</span>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <Button variant="destructive" onClick={remove} className="h-11 gap-2 rounded-xl px-5">
                  <Trash2 className="h-4 w-4" />
                  Supprimer
                </Button>
                <Button onClick={save} disabled={saving} className="h-11 gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 px-5 shadow-lg shadow-primary/25">
                  <Save className="h-4 w-4" />
                  {saving ? "Sauvegarde..." : "Enregistrer"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Car className="h-5 w-5 text-primary" />
                  Véhicule affecté
                </CardTitle>
              </CardHeader>
              <CardContent>
                {vehicle ? (
                  <div className="space-y-3">
                    <p className="text-lg font-semibold">
                      {vehicle.brand} {vehicle.model}
                    </p>
                    <p className="text-sm text-muted-foreground">{vehicle.registration}</p>
                    <Link href={`/vehicles/${vehicle.id}`}>
                      <Button variant="outline" className="mt-2 w-full rounded-xl">
                        Voir la fiche véhicule
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="flex h-24 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                    Aucun véhicule affecté.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Calendar className="h-5 w-5 text-primary" />
                  Échéances
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <IdCard className="h-4 w-4" />
                    Permis
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      licenseExpired && "text-rose-600",
                      licenseExpiringSoon && "text-amber-600"
                    )}
                  >
                    {driver.license_expiry ? new Date(driver.license_expiry).toLocaleDateString("fr-FR") : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" />
                    Visite médicale
                  </span>
                  <span className="text-sm font-semibold">
                    {driver.medical_check_date ? new Date(driver.medical_check_date).toLocaleDateString("fr-FR") : "—"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
