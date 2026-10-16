"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, CircleDollarSign, FileDown, Plus, Search, Timer, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, Panel, Plate, StatCard, StatusBadge, Toolbar } from "@/components/app/primitives";
import { api, listVehicles } from "@/lib/api";
import { workOrderStatus, workOrderType } from "@/lib/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Vehicle, WorkOrder } from "@/types";
import { toast } from "sonner";

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
      workOrderType[wo.type],
      workOrderStatus[wo.status]?.label ?? wo.status,
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
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flottauto-maintenance-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const ALL = "__all__";

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
      const [orders, vehiclesRes] = await Promise.all([api.get<WorkOrder[]>("/maintenance/work-orders"), listVehicles()]);
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

  /** Ordres filtrés par recherche, type et véhicule (sans le statut) : sert aux compteurs des onglets. */
  const baseFiltered = useMemo(() => {
    return workOrders.filter((wo) => {
      const matchesSearch =
        !search ||
        wo.title.toLowerCase().includes(search.toLowerCase()) ||
        wo.description?.toLowerCase().includes(search.toLowerCase()) ||
        false;
      const matchesType = !typeFilter || wo.type === typeFilter;
      const matchesVehicle = !vehicleFilter || wo.vehicle_id === Number(vehicleFilter);
      return matchesSearch && matchesType && matchesVehicle;
    });
  }, [workOrders, search, typeFilter, vehicleFilter]);

  const filteredWorkOrders = useMemo(
    () => (statusFilter ? baseFiltered.filter((wo) => wo.status === statusFilter) : baseFiltered),
    [baseFiltered, statusFilter]
  );

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { "": baseFiltered.length };
    baseFiltered.forEach((wo) => (c[wo.status] = (c[wo.status] ?? 0) + 1));
    return c;
  }, [baseFiltered]);

  const totalCost = useMemo(() => workOrders.reduce((sum, wo) => sum + Number(wo.total_cost || 0), 0), [workOrders]);

  const openCount = useMemo(() => workOrders.filter((wo) => wo.status !== "validated").length, [workOrders]);

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

  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  const statusTabs: { value: string; label: string }[] = [
    { value: "", label: "Tous" },
    ...(Object.keys(workOrderStatus) as WorkOrder["status"][]).map((s) => ({ value: s, label: workOrderStatus[s].label })),
  ];

  const typeItems: Record<string, string> = { [ALL]: "Tous les types", ...workOrderType };
  const vehicleItems: Record<string, string> = {
    [ALL]: "Tous les véhicules",
    ...Object.fromEntries(vehicles.map((v) => [String(v.id), `${v.registration} — ${v.brand} ${v.model}`])),
  };

  const hasFilters = !!(search || statusFilter || typeFilter || vehicleFilter);

  return (
    <AppShell>
      <PageHeader
        title="Maintenance"
        description={`${workOrders.length} ordre(s) de travail`}
        actions={
          <>
            <Button variant="outline" onClick={() => exportWorkOrdersCsv(filteredWorkOrders, vehicles)} disabled={!filteredWorkOrders.length}>
              <FileDown className="size-4" />
              Exporter
            </Button>
            <Link href="/maintenance/new" className={buttonVariants()}>
              <Plus className="size-4" />
              Nouvel ordre
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total des ordres" value={loading ? "—" : workOrders.length} icon={Wrench} />
        <StatCard label="Ouverts / en cours" value={loading ? "—" : openCount} hint="Non encore validés" icon={Timer} tone="warning" />
        <StatCard label="Clôturés ce mois" value={loading ? "—" : doneThisMonth} icon={CheckCircle2} tone="success" />
        <StatCard label="Coût total" value={loading ? "—" : formatMoney(totalCost)} icon={CircleDollarSign} />
      </div>

      <Panel flush className="mt-6">
        <Toolbar className="flex-wrap justify-between">
          <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
            {statusTabs.map((f) => (
              <button
                key={f.value || "all"}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                  statusFilter === f.value ? "bg-secondary text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {f.label}
                <span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground tabular">{statusCounts[f.value] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Select items={typeItems} value={typeFilter || ALL} onValueChange={(v) => setTypeFilter(!v || v === ALL ? "" : v)}>
              <SelectTrigger className="h-9 sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(typeItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select items={vehicleItems} value={vehicleFilter || ALL} onValueChange={(v) => setVehicleFilter(!v || v === ALL ? "" : v)}>
              <SelectTrigger className="h-9 sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous les véhicules</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.registration} — {v.brand} {v.model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative w-full sm:w-60">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
              <Input placeholder="Titre, description…" className="h-9 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </Toolbar>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredWorkOrders.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title={hasFilters ? "Aucun ordre ne correspond" : "Aucun ordre de travail"}
            description={hasFilters ? "Modifiez la recherche ou les filtres." : "Créez un ordre de travail pour suivre une intervention."}
            action={
              !hasFilters ? (
                <Link href="/maintenance/new" className={buttonVariants()}>
                  <Plus className="size-4" />
                  Nouvel ordre
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Intervention</TableHead>
                <TableHead>Véhicule</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="hidden lg:table-cell">Garage</TableHead>
                <TableHead className="hidden md:table-cell">Créé le</TableHead>
                <TableHead className="text-right">Coût</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWorkOrders.map((wo) => {
                const status = workOrderStatus[wo.status] ?? workOrderStatus.opened;
                const vehicle = vehicleById.get(wo.vehicle_id);
                return (
                  <TableRow key={wo.id} className="group cursor-pointer" onClick={() => router.push(`/maintenance/${wo.id}`)}>
                    <TableCell className="max-w-72">
                      <Link
                        href={`/maintenance/${wo.id}`}
                        className="block truncate font-medium hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {wo.title}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{workOrderType[wo.type]}</p>
                    </TableCell>
                    <TableCell>
                      {vehicle ? (
                        <div className="flex items-center gap-2.5">
                          <Plate value={vehicle.registration} size="sm" />
                          <span className="hidden truncate text-muted-foreground xl:inline">
                            {vehicle.brand} {vehicle.model}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Véhicule #{wo.vehicle_id}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{wo.external_garage || "—"}</TableCell>
                    <TableCell className="hidden text-muted-foreground tabular md:table-cell">{formatDate(wo.created_at)}</TableCell>
                    <TableCell className="text-right font-medium tabular">{wo.total_cost ? formatMoney(wo.total_cost) : "—"}</TableCell>
                    <TableCell className="pr-4">
                      <ChevronRight className="size-4 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </AppShell>
  );
}
