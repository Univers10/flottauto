"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { Vehicle } from "@/types";

const statusLabels: Record<string, string> = {
  opened: "Ouvert",
  diagnosed: "Diagnostiqué",
  in_progress: "En cours",
  done: "Terminé",
  validated: "Validé",
};

export default function NewWorkOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedVehicleId = searchParams.get("vehicle_id") || "";
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [saving, setSaving] = useState(false);
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
      if (form.status !== "opened" || form.total_cost) {
        await api.put(`/maintenance/work-orders/${(created as { id: number }).id}`, {
          status: form.status,
          total_cost: form.total_cost ? Number(form.total_cost) : undefined,
        });
      }
      toast.success("Ordre de travail créé");
      router.push("/maintenance");
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
            onClick={() => router.push("/maintenance")}
            className="rounded-xl"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Nouvel ordre de travail</h1>
            <p className="text-sm text-muted-foreground">Planifiez une intervention sur un véhicule</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Détails de l&apos;intervention</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vehicle">Véhicule *</Label>
                  <Select value={form.vehicle_id} onValueChange={(v) => { if (v) update("vehicle_id", v); }}>
                    <SelectTrigger id="vehicle">
                      <SelectValue placeholder="Sélectionner un véhicule" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.registration} — {v.brand} {v.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => { if (v) update("type", v); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="curative">Curatif</SelectItem>
                      <SelectItem value="preventive">Préventif</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">Titre *</Label>
                  <Input
                    id="title"
                    required
                    value={form.title}
                    onChange={(e) => update("title", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Statut</Label>
                  <Select value={form.status} onValueChange={(v) => { if (v) update("status", v); }}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mileage">Kilométrage lors de l&apos;ouverture</Label>
                  <Input
                    id="mileage"
                    type="number"
                    value={form.mileage_at_creation}
                    onChange={(e) => update("mileage_at_creation", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="total_cost">Coût total (FCFA)</Label>
                  <Input
                    id="total_cost"
                    type="number"
                    value={form.total_cost}
                    onChange={(e) => update("total_cost", e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="external_garage">Garage externe</Label>
                  <Input
                    id="external_garage"
                    value={form.external_garage}
                    onChange={(e) => update("external_garage", e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => router.push("/maintenance")}
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
