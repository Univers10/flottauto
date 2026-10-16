"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Save, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FormSection, PageHeader, Panel } from "@/components/app/primitives";
import { api, uploadVehiclePhoto } from "@/lib/api";
import { energyLabels, vehicleStatus, vehicleTypeLabels } from "@/lib/labels";
import { fullName } from "@/lib/format";
import { toast } from "sonner";
import type { Driver, Vehicle, VehicleStatus } from "@/types";

const statusItems = Object.fromEntries(
  (Object.keys(vehicleStatus) as VehicleStatus[]).map((s) => [s, vehicleStatus[s].label])
) as Record<string, string>;

export default function NewVehiclePage() {
  const router = useRouter();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
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
      .get<Driver[]>("/drivers?size=100")
      .then(setDrivers)
      .catch(() => toast.error("Erreur de chargement des chauffeurs"));
  }, []);

  const driverItems = useMemo(
    () => ({ "": "Aucun chauffeur", ...Object.fromEntries(drivers.map((d) => [String(d.id), fullName(d)])) }),
    [drivers]
  );

  function update(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null);
    setPhotoPreview(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await api.post<Vehicle>("/vehicles", {
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
      if (photo) {
        const formData = new FormData();
        formData.set("file", photo);
        await uploadVehiclePhoto(created.id, formData);
      }
      toast.success("Véhicule créé avec succès");
      router.push(`/vehicles/${created.id}`);
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Nouveau véhicule"
          description="Renseignez les informations du véhicule à ajouter à la flotte."
          breadcrumb={[{ label: "Véhicules", href: "/vehicles" }, { label: "Nouveau véhicule" }]}
        />

        <form onSubmit={handleSubmit}>
          <Panel>
            <div className="divide-y">
              <FormSection title="Identification" description="Plaque, marque et modèle sont obligatoires.">
                <Field label="Immatriculation" htmlFor="registration" required>
                  <Input
                    id="registration"
                    required
                    placeholder="AB-123-CD"
                    className="font-mono uppercase"
                    value={form.registration}
                    onChange={(e) => update("registration", e.target.value)}
                  />
                </Field>
                <Field label="VIN" htmlFor="vin" hint="Numéro de série à 17 caractères.">
                  <Input id="vin" className="font-mono" value={form.vin} onChange={(e) => update("vin", e.target.value)} />
                </Field>
                <Field label="Marque" htmlFor="brand" required>
                  <Input id="brand" required value={form.brand} onChange={(e) => update("brand", e.target.value)} />
                </Field>
                <Field label="Modèle" htmlFor="model" required>
                  <Input id="model" required value={form.model} onChange={(e) => update("model", e.target.value)} />
                </Field>
                <Field label="Année" htmlFor="year">
                  <Input id="year" type="number" value={form.year} onChange={(e) => update("year", e.target.value)} />
                </Field>
                <Field label="Date de 1ʳᵉ mise en circulation" htmlFor="first_registration_date">
                  <Input
                    id="first_registration_date"
                    type="date"
                    value={form.first_registration_date}
                    onChange={(e) => update("first_registration_date", e.target.value)}
                  />
                </Field>
              </FormSection>

              <FormSection title="Caractéristiques" description="Type, motorisation et état actuel du véhicule.">
                <Field label="Type de véhicule">
                  <Select
                    items={vehicleTypeLabels}
                    value={form.vehicle_type}
                    onValueChange={(v) => {
                      if (v) update("vehicle_type", v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(vehicleTypeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Énergie">
                  <Select
                    items={energyLabels}
                    value={form.energy}
                    onValueChange={(v) => {
                      if (v) update("energy", v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(energyLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Kilométrage" htmlFor="mileage">
                  <div className="relative">
                    <Input
                      id="mileage"
                      type="number"
                      className="pr-10 tabular"
                      value={form.mileage}
                      onChange={(e) => update("mileage", e.target.value)}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-subtle-foreground">km</span>
                  </div>
                </Field>
                <Field label="Statut">
                  <Select
                    items={statusItems}
                    value={form.status}
                    onValueChange={(v) => {
                      if (v) update("status", v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusItems).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FormSection>

              <FormSection title="Affectation et achat" description="Chauffeur attitré et valeur d'acquisition.">
                <Field label="Chauffeur affecté">
                  <Select items={driverItems} value={form.driver_id} onValueChange={(v) => update("driver_id", v || "")}>
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
                </Field>
                <Field label="Prix d'achat" htmlFor="purchase_price">
                  <div className="relative">
                    <Input
                      id="purchase_price"
                      type="number"
                      className="pr-14 tabular"
                      value={form.purchase_price}
                      onChange={(e) => update("purchase_price", e.target.value)}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-subtle-foreground">FCFA</span>
                  </div>
                </Field>
              </FormSection>

              <FormSection title="Photo et notes" description="Une photo aide à identifier le véhicule dans la flotte.">
                <Field label="Photo du véhicule" className="sm:col-span-2">
                  {photoPreview ? (
                    <div className="relative h-52 overflow-hidden rounded-lg border bg-surface-sunken">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoPreview} alt="Aperçu" className="size-full object-cover" />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={removePhoto}
                        className="absolute top-3 right-3 bg-card hover:text-danger"
                        title="Retirer la photo"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface-sunken text-muted-foreground transition-colors hover:border-primary hover:bg-accent">
                      <span className="flex size-10 items-center justify-center rounded-lg border bg-card text-muted-foreground shadow-xs">
                        {photo ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                      </span>
                      <span className="text-sm font-medium text-foreground">Choisir une photo</span>
                      <span className="text-xs">JPG, PNG ou WebP</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                    </label>
                  )}
                </Field>
                <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
                  <Textarea
                    id="notes"
                    placeholder="Équipements, particularités, historique…"
                    value={form.notes}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update("notes", e.target.value)}
                  />
                </Field>
              </FormSection>
            </div>

            <div className="-mx-5 mt-6 -mb-5 flex justify-end gap-2 border-t bg-surface-sunken px-5 py-4">
              <Link href="/vehicles" className={buttonVariants({ variant: "outline" })}>
                Annuler
              </Link>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </Panel>
        </form>
      </div>
    </AppShell>
  );
}
