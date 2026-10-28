"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ImagePlus, Save, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FormSection, PageHeader, Panel } from "@/components/app/primitives";
import { api, uploadWorkOrderPhoto } from "@/lib/api";
import { workOrderStatus, workOrderType } from "@/lib/labels";
import { toast } from "sonner";
import type { Vehicle, WorkOrder } from "@/types";

const statusItems: Record<string, string> = Object.fromEntries(
  (Object.keys(workOrderStatus) as WorkOrder["status"][]).map((s) => [s, workOrderStatus[s].label])
);

export default function NewWorkOrderPage() {
  return (
    <Suspense fallback={null}>
      <NewWorkOrderPageInner />
    </Suspense>
  );
}

function NewWorkOrderPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedVehicleId = searchParams.get("vehicle_id") || "";
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [photoCaption, setPhotoCaption] = useState("");
  const [form, setForm] = useState({
    vehicle_id: preselectedVehicleId,
    type: "curative",
    title: "",
    description: "",
    mileage_at_creation: "",
    external_garage: "",
    status: "opened",
    total_cost: "",
  });

  useEffect(() => {
    api
      .get<{ items: Vehicle[] }>("/vehicles?size=100")
      .then((res) => {
        setVehicles(res.items);
        if (preselectedVehicleId) {
          const preselected = res.items.find((v) => String(v.id) === preselectedVehicleId);
          if (preselected) {
            setForm((prev) => ({
              ...prev,
              vehicle_id: String(preselected.id),
              mileage_at_creation: prev.mileage_at_creation || String(preselected.mileage ?? ""),
            }));
          }
        }
      })
      .catch(() => toast.error("Erreur de chargement des véhicules"));
  }, [preselectedVehicleId]);

  function update(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const added = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPhotos((prev) => [...prev, ...added]);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.preview);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vehicle_id) {
      toast.error("Veuillez sélectionner un véhicule");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        vehicle_id: Number(form.vehicle_id),
        type: form.type,
        title: form.title,
        description: form.description || undefined,
        mileage_at_creation: form.mileage_at_creation ? Number(form.mileage_at_creation) : undefined,
        external_garage: form.external_garage || undefined,
      };
      const created = await api.post("/maintenance/work-orders", body);
      const createdId = (created as { id: number }).id;
      if (form.status !== "opened" || form.total_cost) {
        await api.put(`/maintenance/work-orders/${createdId}`, {
          status: form.status,
          total_cost: form.total_cost ? Number(form.total_cost) : undefined,
        });
      }
      let uploadError = false;
      for (const photo of photos) {
        try {
          const formData = new FormData();
          formData.set("file", photo.file);
          if (photoCaption) formData.set("caption", photoCaption);
          await uploadWorkOrderPhoto(createdId, formData);
        } catch {
          uploadError = true;
        }
      }
      if (uploadError) {
        toast.warning("Ordre de travail créé mais certaines photos n'ont pas pu être téléversées");
      } else {
        toast.success("Ordre de travail créé");
      }
      router.push("/maintenance");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  }

  const vehicleItems: Record<string, string> = Object.fromEntries(
    vehicles.map((v) => [String(v.id), `${v.registration} — ${v.brand} ${v.model}`])
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Nouvel ordre de travail"
          description="Planifiez une intervention sur un véhicule de la flotte."
          breadcrumb={[{ label: "Maintenance", href: "/maintenance" }, { label: "Nouvel ordre" }]}
        />

        <form onSubmit={handleSubmit}>
          <Panel>
            <div className="divide-y">
              <FormSection title="Intervention" description="Véhicule concerné, nature et intitulé de l'intervention.">
                <Field label="Véhicule" htmlFor="vehicle" required>
                  <Select items={vehicleItems} value={form.vehicle_id} onValueChange={(v) => { if (v) update("vehicle_id", v); }}>
                    <SelectTrigger id="vehicle">
                      <SelectValue placeholder="Sélectionner un véhicule" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          <span className="font-mono text-xs font-semibold tracking-wider uppercase">{v.registration}</span>
                          <span className="text-muted-foreground">
                            {v.brand} {v.model}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Type" htmlFor="type">
                  <Select items={workOrderType} value={form.type} onValueChange={(v) => { if (v) update("type", v); }}>
                    <SelectTrigger id="type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="curative">{workOrderType.curative}</SelectItem>
                      <SelectItem value="preventive">{workOrderType.preventive}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Titre" htmlFor="title" required className="sm:col-span-2">
                  <Input
                    id="title"
                    required
                    value={form.title}
                    onChange={(e) => update("title", e.target.value)}
                    placeholder="Vidange, remplacement plaquettes…"
                  />
                </Field>
                <Field label="Description" htmlFor="description" className="sm:col-span-2">
                  <Textarea
                    id="description"
                    rows={3}
                    value={form.description}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update("description", e.target.value)}
                    placeholder="Symptômes constatés, travaux prévus…"
                  />
                </Field>
              </FormSection>

              <FormSection title="Suivi" description="État d'avancement, prestataire et éléments chiffrés.">
                <Field label="Statut" htmlFor="status">
                  <Select items={statusItems} value={form.status} onValueChange={(v) => { if (v) update("status", v); }}>
                    <SelectTrigger id="status">
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
                <Field label="Garage externe" htmlFor="external_garage">
                  <Input
                    id="external_garage"
                    value={form.external_garage}
                    onChange={(e) => update("external_garage", e.target.value)}
                    placeholder="Nom du garage ou technicien"
                  />
                </Field>
                <Field label="Kilométrage à l'ouverture" htmlFor="mileage" hint="Prérempli avec le kilométrage du véhicule.">
                  <Input
                    id="mileage"
                    type="number"
                    className="tabular"
                    value={form.mileage_at_creation}
                    onChange={(e) => update("mileage_at_creation", e.target.value)}
                  />
                </Field>
                <Field label="Coût total (FCFA)" htmlFor="total_cost">
                  <Input
                    id="total_cost"
                    type="number"
                    className="tabular"
                    value={form.total_cost}
                    onChange={(e) => update("total_cost", e.target.value)}
                    placeholder="0"
                  />
                </Field>
              </FormSection>

              <FormSection title="Photos" description="Photos du véhicule ou des pièces, téléversées après la création.">
                <Field label="Ajouter des photos" htmlFor="photo">
                  <Input id="photo" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => addPhotos(e.target.files)} />
                </Field>
                <Field label="Légende" htmlFor="caption" hint="Appliquée à toutes les photos.">
                  <Input
                    id="caption"
                    value={photoCaption}
                    onChange={(e) => setPhotoCaption(e.target.value)}
                    placeholder="Vue moteur, pièce remplacée…"
                  />
                </Field>
                <div className="sm:col-span-2">
                  {photos.length > 0 ? (
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                      {photos.map((photo, index) => (
                        <div key={photo.preview} className="group relative overflow-hidden rounded-lg border bg-surface-sunken">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo.preview} alt={`Photo ${index + 1}`} className="aspect-square w-full object-cover" />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={() => removePhoto(index)}
                            className="absolute top-1.5 right-1.5 bg-card"
                            aria-label="Retirer la photo"
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-24 items-center justify-center gap-2 rounded-lg border border-dashed bg-surface-sunken text-sm text-muted-foreground">
                      <ImagePlus className="size-4 text-subtle-foreground" />
                      Aucune photo sélectionnée
                    </div>
                  )}
                </div>
              </FormSection>
            </div>

            <div className="-mx-5 mt-6 -mb-5 flex justify-end gap-2 border-t bg-surface-sunken px-5 py-4">
              <Link href="/maintenance" className={buttonVariants({ variant: "outline" })}>
                Annuler
              </Link>
              <Button type="submit" disabled={saving}>
                <Save className="size-4" />
                {saving ? "Enregistrement…" : "Créer l'ordre"}
              </Button>
            </div>
          </Panel>
        </form>
      </div>
    </AppShell>
  );
}
