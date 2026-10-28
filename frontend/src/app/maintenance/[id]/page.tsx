"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Car, Check, ImageIcon, ImagePlus, Save, Trash2 } from "lucide-react";
import { AppShell, useCurrentUser } from "@/components/layout/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DetailList, EmptyState, Field, PageHeader, Panel, Plate, StatusBadge } from "@/components/app/primitives";
import { canDeleteWorkOrders } from "@/lib/roles";
import { api, assetUrl, deleteWorkOrder, deleteWorkOrderPhoto, getVehicle, updateWorkOrder, uploadWorkOrderPhoto } from "@/lib/api";
import { workOrderStatus, workOrderType } from "@/lib/labels";
import { formatDate, formatMoney, formatNumber, fullName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Vehicle, WorkOrder } from "@/types";

const statusFlow: WorkOrder["status"][] = ["opened", "diagnosed", "in_progress", "done", "validated"];

const statusItems: Record<string, string> = Object.fromEntries(statusFlow.map((s) => [s, workOrderStatus[s].label]));

// Rendu sous AppShell pour accéder à l'utilisateur connecté.
function DeleteWorkOrderButton({ onClick }: { onClick: () => void }) {
  const currentUser = useCurrentUser();
  if (!currentUser || !canDeleteWorkOrders(currentUser.role)) return null;
  return (
    <Button variant="destructive" onClick={onClick}>
      <Trash2 className="size-4" />
      Supprimer
    </Button>
  );
}

function StatusStepper({ current }: { current: WorkOrder["status"] }) {
  const currentIndex = statusFlow.indexOf(current);
  return (
    <ol className="flex items-start" aria-label="Avancement de l'intervention">
      {statusFlow.map((step, idx) => {
        const done = idx < currentIndex;
        const active = idx === currentIndex;
        return (
          <Fragment key={step}>
            <li className="flex w-20 shrink-0 flex-col items-center gap-2 text-center sm:w-24" aria-current={active ? "step" : undefined}>
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border text-xs font-semibold tabular transition-colors",
                  done && "border-primary bg-primary-subtle text-primary",
                  active && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15",
                  !done && !active && "border-border bg-card text-subtle-foreground"
                )}
              >
                {done ? <Check className="size-4" /> : idx + 1}
              </span>
              <span
                className={cn(
                  "text-xs leading-tight",
                  active ? "font-semibold text-foreground" : done ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {workOrderStatus[step].label}
              </span>
            </li>
            {idx < statusFlow.length - 1 && (
              <li aria-hidden className={cn("mt-4 h-px min-w-4 flex-1 -translate-y-px", idx < currentIndex ? "bg-primary" : "bg-border")} />
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const workOrderId = Number(params.id);
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [totalCost, setTotalCost] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [externalGarage, setExternalGarage] = useState<string>("");
  const [photoCaption, setPhotoCaption] = useState<string>("");
  const [photoUploading, setPhotoUploading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const wo = await api.get<WorkOrder>(`/maintenance/work-orders/${workOrderId}`);
      setWorkOrder(wo);
      setStatus(wo.status);
      setTitle(wo.title);
      setTotalCost(wo.total_cost ? String(wo.total_cost) : "");
      setDescription(wo.description || "");
      setExternalGarage(wo.external_garage || "");
      const v = await getVehicle(wo.vehicle_id);
      setVehicle(v);
    } catch (err: any) {
      toast.error(err.message || "Erreur de chargement");
      router.push("/maintenance");
    } finally {
      setLoading(false);
    }
  }

  async function handlePhotoUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const files = fileInput?.files ? Array.from(fileInput.files) : [];
    if (files.length === 0) {
      toast.error("Veuillez sélectionner au moins une photo");
      return;
    }
    setPhotoUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("caption", photoCaption);
        await uploadWorkOrderPhoto(workOrderId, formData);
      }
      toast.success(files.length > 1 ? `${files.length} photos ajoutées` : "Photo ajoutée");
      setPhotoCaption("");
      form.reset();
      const wo = await api.get<WorkOrder>(`/maintenance/work-orders/${workOrderId}`);
      setWorkOrder(wo);
    } catch (err: any) {
      toast.error(err.message || "Erreur d'upload");
    } finally {
      setPhotoUploading(false);
    }
  }

  async function deletePhoto(photoId: number) {
    if (!confirm("Supprimer cette photo ?")) return;
    try {
      await deleteWorkOrderPhoto(workOrderId, photoId);
      setWorkOrder((prev) => (prev ? { ...prev, photos: prev.photos?.filter((p) => p.id !== photoId) || [] } : null));
      toast.success("Photo supprimée");
    } catch (err: any) {
      toast.error(err.message || "Erreur de suppression");
    }
  }

  useEffect(() => {
    load();
  }, [workOrderId]);

  async function save() {
    if (!workOrder) return;
    setSaving(true);
    try {
      const updated = await updateWorkOrder(workOrder.id, {
        status: status as WorkOrder["status"],
        title,
        total_cost: totalCost ? Number(totalCost) : null,
        description,
        external_garage: externalGarage || null,
        completed_at: status === "validated" && !workOrder.completed_at ? new Date().toISOString() : workOrder.completed_at,
      } as Partial<WorkOrder>);
      setWorkOrder(updated);
      toast.success("Ordre de travail mis à jour");
    } catch (err: any) {
      toast.error(err.message || "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!workOrder) return;
    if (!confirm(`Supprimer l'intervention "${workOrder.title}" ?`)) return;
    try {
      await deleteWorkOrder(workOrder.id);
      toast.success("Ordre de travail supprimé");
      router.push("/maintenance");
    } catch (err: any) {
      toast.error(err.message || "Erreur de suppression");
    }
  }

  if (loading || !workOrder) {
    return (
      <AppShell>
        <div className="space-y-2 pb-6">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-72" />
        </div>
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        </div>
      </AppShell>
    );
  }

  const statusDef = workOrderStatus[workOrder.status] ?? workOrderStatus.opened;
  const photos = workOrder.photos ?? [];

  return (
    <AppShell>
      <PageHeader
        breadcrumb={[{ label: "Maintenance", href: "/maintenance" }, { label: workOrder.title }]}
        title={workOrder.title}
        description={`${workOrderType[workOrder.type]} · ouvert le ${formatDate(workOrder.created_at, "long")}`}
        actions={
          <>
            <StatusBadge tone={statusDef.tone}>{statusDef.label}</StatusBadge>
            <DeleteWorkOrderButton onClick={remove} />
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Panel title="Avancement" description="Étape enregistrée de l'intervention.">
            <div className="scrollbar-thin overflow-x-auto pb-1">
              <StatusStepper current={workOrder.status} />
            </div>
          </Panel>

          <Panel title="Détails de l'intervention" description="Modifiez le statut, le coût et les notes, puis enregistrez.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Titre" htmlFor="title" className="sm:col-span-2">
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de l'intervention" />
              </Field>
              <Field label="Statut" htmlFor="status">
                <Select items={statusItems} value={status} onValueChange={(v) => setStatus(v || "")}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusFlow.map((s) => (
                      <SelectItem key={s} value={s}>
                        {workOrderStatus[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Coût total (FCFA)" htmlFor="cost">
                <Input
                  id="cost"
                  type="number"
                  className="tabular"
                  value={totalCost}
                  onChange={(e) => setTotalCost(e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Garage / technicien externe" htmlFor="garage" className="sm:col-span-2">
                <Input
                  id="garage"
                  value={externalGarage}
                  onChange={(e) => setExternalGarage(e.target.value)}
                  placeholder="Nom du garage ou technicien"
                />
              </Field>
              <Field label="Notes / description" htmlFor="description" className="sm:col-span-2">
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                  rows={5}
                  placeholder="Détails de l'intervention, pièces remplacées…"
                />
              </Field>
            </div>
            <div className="-mx-5 mt-6 -mb-5 flex justify-end gap-2 border-t bg-surface-sunken px-5 py-4">
              <Button onClick={save} disabled={saving}>
                <Save className="size-4" />
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </Panel>

          <Panel
            title="Photos"
            description={photos.length ? `${photos.length} photo(s) jointe(s)` : "Aucune photo jointe pour le moment."}
          >
            <form onSubmit={handlePhotoUpload} className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
              <Field label="Fichiers" htmlFor="photo">
                <Input id="photo" name="file" type="file" accept="image/jpeg,image/png,image/webp" multiple />
              </Field>
              <Field label="Légende" htmlFor="caption">
                <Input
                  id="caption"
                  value={photoCaption}
                  onChange={(e) => setPhotoCaption(e.target.value)}
                  placeholder="Vue moteur, pièce remplacée…"
                />
              </Field>
              <Button type="submit" variant="outline" disabled={photoUploading} className="h-10">
                <ImagePlus className="size-4" />
                {photoUploading ? "Envoi…" : "Ajouter"}
              </Button>
            </form>

            {photos.length > 0 ? (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {photos.map((photo) => (
                  <figure key={photo.id} className="group overflow-hidden rounded-lg border bg-card">
                    <div className="relative bg-surface-sunken">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={assetUrl(photo.file_url) ?? ""} alt={photo.caption || "Photo"} className="aspect-square w-full object-cover" />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => deletePhoto(photo.id)}
                        aria-label="Supprimer la photo"
                        className="absolute top-1.5 right-1.5 bg-card text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {photo.caption && (
                      <figcaption className="truncate border-t px-2.5 py-1.5 text-xs text-muted-foreground">{photo.caption}</figcaption>
                    )}
                  </figure>
                ))}
              </div>
            ) : (
              <EmptyState icon={ImageIcon} title="Aucune photo" description="Ajoutez des photos du véhicule ou des pièces." className="mt-5 rounded-lg border border-dashed bg-surface-sunken py-8" />
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Véhicule">
            {vehicle ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-surface-sunken text-subtle-foreground">
                    <Car className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {vehicle.brand} {vehicle.model}
                    </p>
                    <p className="text-xs text-muted-foreground tabular">{formatNumber(vehicle.mileage, "km")}</p>
                  </div>
                </div>
                <Plate value={vehicle.registration} size="lg" />
                <Link href={`/vehicles/${vehicle.id}`} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                  Voir la fiche véhicule
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Véhicule #{workOrder.vehicle_id}</p>
            )}
          </Panel>

          <Panel title="Informations">
            <DetailList
              items={[
                { label: "Type", value: workOrderType[workOrder.type] },
                { label: "Création", value: formatDate(workOrder.created_at) },
                { label: "Saisi par", value: workOrder.created_by ? fullName(workOrder.created_by) : "—" },
                { label: "Début", value: formatDate(workOrder.started_at) },
                { label: "Clôture", value: formatDate(workOrder.completed_at) },
                { label: "Kilométrage constaté", value: formatNumber(workOrder.mileage_at_creation || null, "km") },
              ]}
            />
          </Panel>

          <Panel title="Coûts">
            <p className="text-[13px] font-medium text-muted-foreground">Coût total enregistré</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular">{formatMoney(workOrder.total_cost)}</p>
            <DetailList className="mt-4 border-t pt-3" items={[{ label: "Garage", value: workOrder.external_garage || "—" }]} />
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
