"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Calendar, Camera, CheckCircle2, Clock, FileText, Save, Trash2, Truck, Wrench, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { cn } from "@/lib/utils";
import { api, deleteWorkOrder, deleteWorkOrderPhoto, getVehicle, updateWorkOrder, uploadWorkOrderPhoto } from "@/lib/api";
import { toast } from "sonner";
import type { Vehicle, WorkOrder } from "@/types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1").replace("/api/v1", "");

const statusBadges: Record<string, { bg: string; text: string; label: string }> = {
  opened: { bg: "bg-slate-100", text: "text-slate-700", label: "Ouvert" },
  diagnosed: { bg: "bg-violet-50", text: "text-violet-700", label: "Diagnostiqué" },
  in_progress: { bg: "bg-blue-50", text: "text-blue-700", label: "En cours" },
  done: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Terminé" },
  validated: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Validé" },
};

const typeLabels: Record<string, string> = {
  preventive: "Préventif",
  curative: "Curatif",
};

const statusFlow = ["opened", "diagnosed", "in_progress", "done", "validated"];

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
      setWorkOrder((prev) =>
        prev ? { ...prev, photos: prev.photos?.filter((p) => p.id !== photoId) || [] } : null
      );
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
      const updated = await updateWorkOrder(
        workOrder.id,
        {
          status: status as WorkOrder["status"],
          title,
          total_cost: totalCost ? Number(totalCost) : null,
          description,
          external_garage: externalGarage || null,
          completed_at:
            status === "validated" && !workOrder.completed_at
              ? new Date().toISOString()
              : workOrder.completed_at,
        } as Partial<WorkOrder>
      );
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
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  const statusBadge = statusBadges[workOrder.status] ?? statusBadges.opened;
  const currentStatusIndex = statusFlow.indexOf(workOrder.status);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/maintenance">
              <Button variant="ghost" size="icon" className="rounded-xl">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{workOrder.title}</h1>
              <p className="text-sm text-muted-foreground">
                {typeLabels[workOrder.type]} · {new Date(workOrder.created_at).toLocaleDateString("fr-FR")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={cn("rounded-lg border-0 px-3 py-1 font-medium", statusBadge.bg, statusBadge.text)}>
              {statusBadge.label}
            </Badge>
            <Button variant="outline" size="icon" onClick={remove} className="rounded-xl border-border/60 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2 rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Suivi d&apos;intervention</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="relative flex justify-between">
                {statusFlow.map((step, idx) => {
                  const stepIndex = idx;
                  const active = stepIndex <= currentStatusIndex;
                  return (
                    <div key={step} className="relative flex flex-1 flex-col items-center">
                      <div
                        className={cn(
                          "z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted bg-card text-muted-foreground"
                        )}
                      >
                        {stepIndex < currentStatusIndex ? <CheckCircle2 className="h-5 w-5" /> : idx + 1}
                      </div>
                      <span className={cn("mt-2 text-xs font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                        {statusBadges[step].label}
                      </span>
                      {idx < statusFlow.length - 1 && (
                        <div
                          className={cn(
                            "absolute top-5 left-1/2 h-0.5 w-full -translate-y-1/2",
                            stepIndex < currentStatusIndex ? "bg-primary" : "bg-muted"
                          )}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Titre</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de l'intervention" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="status">Statut</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v || "")}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusFlow.map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusBadges[s].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cost">Coût total (FCFA)</Label>
                  <Input
                    id="cost"
                    type="number"
                    value={totalCost}
                    onChange={(e) => setTotalCost(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="garage">Garage / Technicien externe</Label>
                <Input
                  id="garage"
                  value={externalGarage}
                  onChange={(e) => setExternalGarage(e.target.value)}
                  placeholder="Nom du garage ou technicien"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Notes / Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                  rows={5}
                  placeholder="Détails de l'intervention, pièces remplacées..."
                />
              </div>

              <div className="space-y-4 rounded-2xl border border-border/60 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <Camera className="h-4 w-4" />
                  Photos
                </h3>
                <form onSubmit={handlePhotoUpload} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="photo">Ajouter des photos</Label>
                    <Input id="photo" name="file" type="file" accept="image/*" multiple />
                  </div>
                  <div className="flex-[2] space-y-2">
                    <Label htmlFor="caption">Légende</Label>
                    <Input
                      id="caption"
                      value={photoCaption}
                      onChange={(e) => setPhotoCaption(e.target.value)}
                      placeholder="Vue moteur, pièce remplacée..."
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={photoUploading}
                    className="h-11 gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 px-5 shadow-lg shadow-primary/25"
                  >
                    <Camera className="h-4 w-4" />
                    {photoUploading ? "Envoi..." : "Ajouter"}
                  </Button>
                </form>
                {(workOrder.photos?.length || 0) > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {workOrder.photos?.map((photo) => (
                      <div key={photo.id} className="group relative overflow-hidden rounded-xl border border-border/60">
                        <img
                          src={photo.file_url.startsWith("http") ? photo.file_url : `${API_BASE_URL}${photo.file_url}`}
                          alt={photo.caption || "Photo"}
                          className="aspect-square w-full object-cover"
                        />
                        {photo.caption && (
                          <p className="absolute bottom-0 left-0 right-0 truncate bg-black/50 px-2 py-1 text-xs text-white">
                            {photo.caption}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => deletePhoto(photo.id)}
                          className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                    Aucune photo.
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3">
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
                  <Truck className="h-5 w-5 text-primary" />
                  Véhicule
                </CardTitle>
              </CardHeader>
              <CardContent>
                {vehicle ? (
                  <div className="space-y-3">
                    <p className="text-lg font-semibold">
                      {vehicle.brand} {vehicle.model}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      {vehicle.registration}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {vehicle.mileage.toLocaleString("fr-FR")} km
                    </div>
                    <Link href={`/vehicles/${vehicle.id}`}>
                      <Button variant="outline" className="mt-2 w-full rounded-xl">
                        Voir la fiche
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Véhicule #{workOrder.vehicle_id}</p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Calendar className="h-5 w-5 text-primary" />
                  Dates
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Création</span>
                  <span className="font-medium">{new Date(workOrder.created_at).toLocaleDateString("fr-FR")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Début</span>
                  <span className="font-medium">
                    {workOrder.started_at ? new Date(workOrder.started_at).toLocaleDateString("fr-FR") : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Clôture</span>
                  <span className="font-medium">
                    {workOrder.completed_at ? new Date(workOrder.completed_at).toLocaleDateString("fr-FR") : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Kilométrage constaté</span>
                  <span className="font-medium">
                    {workOrder.mileage_at_creation ? `${Number(workOrder.mileage_at_creation).toLocaleString("fr-FR")} km` : "—"}
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
