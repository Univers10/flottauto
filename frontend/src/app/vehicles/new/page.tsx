"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { Driver } from "@/types";

const vehicleTypes = [
  { value: "car", label: "Voiture" },
  { value: "van", label: "Camionnette" },
  { value: "truck", label: "Camion" },
  { value: "bus", label: "Bus" },
  { value: "motorcycle", label: "Moto" },
  { value: "other", label: "Autre" },
];

const energyTypes = [
  { value: "diesel", label: "Diesel" },
  { value: "petrol", label: "Essence" },
  { value: "electric", label: "Électrique" },
  { value: "hybrid", label: "Hybride" },
  { value: "lpg", label: "GPL" },
  { value: "other", label: "Autre" },
];

const statusTypes = [
  { value: "available", label: "Disponible" },
  { value: "in_mission", label: "En mission" },
  { value: "in_maintenance", label: "En maintenance" },
  { value: "out_of_service", label: "Hors service" },
];

export default function NewVehiclePage() {
  const router = useRouter();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    registration: "",
    vin: "",
    brand: "",
    model: "",
    year: "",
    vehicle_type: "car",
    energy: "diesel",
    mileage: "",
    status: "available",
    first_registration_date: "",
    purchase_price: "",
    notes: "",
    driver_id: "",
  });

  useEffect(() => {
    api
      .get<{ items: Driver[] }>("/drivers?size=100")
      .then((res) => setDrivers(res.items))
      .catch(() => toast.error("Erreur de chargement des chauffeurs"));
  }, []);

  function update(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/vehicles", {
        registration: form.registration,
        vin: form.vin || undefined,
        brand: form.brand,
        model: form.model,
        year: form.year ? Number(form.year) : undefined,
        vehicle_type: form.vehicle_type,
        energy: form.energy,
        mileage: Number(form.mileage || 0),
        status: form.status,
        first_registration_date: form.first_registration_date || undefined,
        purchase_price: form.purchase_price ? Number(form.purchase_price) : undefined,
        notes: form.notes || undefined,
        driver_id: form.driver_id ? Number(form.driver_id) : undefined,
      });
      toast.success("Véhicule créé avec succès");
      router.push("/vehicles");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/vehicles")}
            className="rounded-xl"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Nouveau véhicule</h1>
            <p className="text-sm text-muted-foreground">Renseignez les informations du véhicule</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Informations générales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="registration">Immatriculation *</Label>
                  <Input
                    id="registration"
                    required
                    value={form.registration}
                    onChange={(e) => update("registration", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vin">VIN</Label>
                  <Input id="vin" value={form.vin} onChange={(e) => update("vin", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brand">Marque *</Label>
                  <Input
                    id="brand"
                    required
                    value={form.brand}
                    onChange={(e) => update("brand", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Modèle *</Label>
                  <Input
                    id="model"
                    required
                    value={form.model}
                    onChange={(e) => update("model", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="year">Année</Label>
                  <Input
                    id="year"
                    type="number"
                    value={form.year}
                    onChange={(e) => update("year", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type de véhicule</Label>
                  <Select value={form.vehicle_type} onValueChange={(v) => { if (v) update("vehicle_type", v); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicleTypes.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Énergie</Label>
                  <Select value={form.energy} onValueChange={(v) => { if (v) update("energy", v); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {energyTypes.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mileage">Kilométrage</Label>
                  <Input
                    id="mileage"
                    type="number"
                    value={form.mileage}
                    onChange={(e) => update("mileage", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Statut</Label>
                  <Select value={form.status} onValueChange={(v) => { if (v) update("status", v); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusTypes.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="first_registration_date">Date de 1ère mise en circulation</Label>
                  <Input
                    id="first_registration_date"
                    type="date"
                    value={form.first_registration_date}
                    onChange={(e) => update("first_registration_date", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="purchase_price">Prix d&apos;achat (FCFA)</Label>
                  <Input
                    id="purchase_price"
                    type="number"
                    value={form.purchase_price}
                    onChange={(e) => update("purchase_price", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Chauffeur affecté</Label>
                  <Select value={form.driver_id} onValueChange={(v) => update("driver_id", v || "")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Aucun chauffeur" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Aucun</SelectItem>
                      {drivers.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {d.first_name} {d.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update("notes", e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => router.push("/vehicles")}
                  className="h-11 rounded-xl border-border/60 px-5"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="h-11 gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 px-5 shadow-lg shadow-primary/25"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </AppShell>
  );
}
