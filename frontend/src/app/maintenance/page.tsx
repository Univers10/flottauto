"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Euro, FileDown, Plus, Search, SlidersHorizontal, Truck, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api, listVehicles } from "@/lib/api";
import type { Vehicle, WorkOrder } from "@/types";
import { toast } from "sonner";

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

function escapeCsv(value: unknown) {
  const str = String(value ?? "").replace(/"/g, '""');
  return str.includes(",") || str.includes("\n") ? `"${str}"` : str;
}

function exportWorkOrdersCsv(workOrders: WorkOrder[], vehicles: Vehicle[]) {
  const headers = ["ID", "Titre", "Type", "Statut", "Véhicule", "Immatriculation", "Garage", "Coût total", "Kilométrage", "Date de création", "Description"];
  const rows = workOrders.map((wo) => {
    const vehicle = vehicles.find((v) => v.id === wo.vehicle_id);
    return [
      wo.id,
      wo.title,
      typeLabels[wo.type],
      statusBadges[wo.status]?.label ?? wo.status,
      vehicle ? `${vehicle.brand} ${vehicle.model}` : `Véhicule #${wo.vehicle_id}`,
      vehicle?.registration ?? "",
      wo.external_garage ?? "",
      wo.total_cost ?? "",
      wo.mileage_at_creation ?? "",
      new Date(wo.created_at).toLocaleDateString("fr-FR"),
      wo.description ?? "",
    ];
  });
  const csv = [headers.map(escapeCsv).join(";"), ...rows.map((r) => r.map(escapeCsv).join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flottauto-maintenance-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function MaintenancePage() {
  const router = useRouter();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [vehicleFilter, setVehicleFilter] = useState<string>("");

  async function loadWorkOrders() {
    setLoading(true);
    try {
      const [orders, vehiclesRes] = await Promise.all([
        api.get<WorkOrder[]>("/maintenance/work-orders"),
        listVehicles(),
      ]);
      setWorkOrders(orders);
      setVehicles(vehiclesRes.items);
    } catch (err: any) {
      toast.error(err.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkOrders();
  }, []);

  const filteredWorkOrders = useMemo(() => {
    return workOrders.filter((wo) => {
      const matchesSearch =
        !search ||
        wo.title.toLowerCase().includes(search.toLowerCase()) ||
        wo.description?.toLowerCase().includes(search.toLowerCase()) ||
        false;
      const matchesStatus = !statusFilter || wo.status === statusFilter;
      const matchesType = !typeFilter || wo.type === typeFilter;
      const matchesVehicle = !vehicleFilter || wo.vehicle_id === Number(vehicleFilter);
      return matchesSearch && matchesStatus && matchesType && matchesVehicle;
    });
  }, [workOrders, search, statusFilter, typeFilter, vehicleFilter]);

  const totalCost = useMemo(
    () => workOrders.reduce((sum, wo) => sum + Number(wo.total_cost || 0), 0),
    [workOrders]
  );

  const openCount = useMemo(
    () => workOrders.filter((wo) => wo.status !== "validated").length,
    [workOrders]
  );

  const doneThisMonth = useMemo(
    () =>
      workOrders.filter((wo) => {
        const completed = wo.completed_at || wo.updated_at;
        if (!completed) return false;
        const d = new Date(completed);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length,
    [workOrders]
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Maintenance</h1>
            <p className="mt-1 text-sm text-muted-foreground">{workOrders.length} ordre(s) de travail</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => exportWorkOrdersCsv(filteredWorkOrders, vehicles)}
              disabled={!filteredWorkOrders.length}
              className="h-10 gap-2 rounded-xl border-border/60 px-4"
            >
              <FileDown className="h-4 w-4" />
              Exporter
            </Button>
            <Link href="/maintenance/new">
              <Button className="h-10 gap-2 rounded-xl px-5 shadow-md shadow-primary/20">
                <Plus className="h-4 w-4" />
                Nouvel ordre
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Wrench className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total ordres</p>
                <p className="text-2xl font-bold">{workOrders.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50">
                <SlidersHorizontal className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">En cours / ouverts</p>
                <p className="text-2xl font-bold">{openCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                <Wrench className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Clôturés ce mois</p>
                <p className="text-2xl font-bold">{doneThisMonth}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                <Euro className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Coût total</p>
                <p className="text-2xl font-bold">{totalCost.toLocaleString("fr-FR")} FCFA</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Ordres de travail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un ordre..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-11 rounded-xl pl-10"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || "")}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Tous les statuts</SelectItem>
                    {Object.entries(statusBadges).map(([value, s]) => (
                      <SelectItem key={value} value={value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v || "")}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Tous les types</SelectItem>
                    <SelectItem value="preventive">Préventif</SelectItem>
                    <SelectItem value="curative">Curatif</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={vehicleFilter} onValueChange={(v) => setVehicleFilter(v || "")}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Véhicule" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Tous les véhicules</SelectItem>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.brand} {v.model} - {v.registration}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : filteredWorkOrders.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                Aucun ordre de travail trouvé.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Titre</th>
                      <th className="pb-3 font-medium">Type</th>
                      <th className="pb-3 font-medium">Statut</th>
                      <th className="pb-3 font-medium">Véhicule</th>
                      <th className="pb-3 font-medium">Garage</th>
                      <th className="pb-3 font-medium text-right">Coût</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWorkOrders.map((wo) => {
                      const status = statusBadges[wo.status] ?? statusBadges.opened;
                      const vehicle = vehicles.find((v) => v.id === wo.vehicle_id);
                      return (
                        <tr
                          key={wo.id}
                          onClick={() => router.push(`/maintenance/${wo.id}`)}
                          className="cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/40"
                        >
                          <td className="py-4 font-semibold">{wo.title}</td>
                          <td className="py-4 text-muted-foreground">{typeLabels[wo.type]}</td>
                          <td className="py-4">
                            <Badge className={cn("rounded-lg border-0 px-2.5 py-0.5 font-medium", status.bg, status.text)}>
                              {status.label}
                            </Badge>
                          </td>
                          <td className="py-4">
                            <div className="flex items-center gap-2">
                              <Truck className="h-4 w-4 text-muted-foreground" />
                              {vehicle ? `${vehicle.brand} ${vehicle.model}` : `Véhicule #${wo.vehicle_id}`}
                            </div>
                          </td>
                          <td className="py-4 text-muted-foreground">{wo.external_garage || "—"}</td>
                          <td className="py-4 text-right font-medium">
                            {wo.total_cost ? `${Number(wo.total_cost).toLocaleString("fr-FR")} FCFA` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
