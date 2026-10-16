"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Car, ChevronRight, FileDown, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, Panel, Plate, SegmentButton, StatusBadge, Toolbar } from "@/components/app/primitives";
import { api, assetUrl } from "@/lib/api";
import { energyLabels, vehicleStatus, vehicleTypeLabels } from "@/lib/labels";
import { formatNumber } from "@/lib/format";
import type { PaginatedResponse, Vehicle, VehicleStatus } from "@/types";
import { toast } from "sonner";

function escapeCsv(value: unknown) {
  const str = String(value ?? "").replace(/"/g, '""');
  return str.includes(";") || str.includes(",") || str.includes("\n") ? `"${str}"` : str;
}

function exportVehiclesCsv(vehicles: Vehicle[]) {
  const headers = [
    "ID",
    "Immatriculation",
    "Marque",
    "Modèle",
    "Type",
    "Énergie",
    "Année",
    "VIN",
    "Kilométrage",
    "Statut",
    "Date 1ère mise en circulation",
    "Prix d'achat",
    "Notes",
  ];
  const rows = vehicles.map((v) => [
    v.id,
    v.registration,
    v.brand,
    v.model,
    vehicleTypeLabels[v.vehicle_type] ?? v.vehicle_type,
    energyLabels[v.energy] ?? v.energy,
    v.year ?? "",
    v.vin ?? "",
    v.mileage,
    vehicleStatus[v.status]?.label ?? v.status,
    v.first_registration_date ?? "",
    v.purchase_price ?? "",
    v.notes ?? "",
  ]);
  const csv = [headers.map(escapeCsv).join(";"), ...rows.map((r) => r.map(escapeCsv).join(";"))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flottauto-vehicules-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type StatusFilter = VehicleStatus | "all";

export default function VehiclesPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  async function loadVehicles() {
    setLoading(true);
    try {
      const res = await api.get<PaginatedResponse<Vehicle>>(`/vehicles?size=100&q=${encodeURIComponent(q)}`);
      setVehicles(res.items);
      setTotal(res.total);
    } catch (err: any) {
      toast.error(err.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVehicles();
  }, [q]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: vehicles.length, available: 0, in_mission: 0, in_maintenance: 0, out_of_service: 0 };
    vehicles.forEach((v) => (c[v.status] += 1));
    return c;
  }, [vehicles]);

  const visible = status === "all" ? vehicles : vehicles.filter((v) => v.status === status);
  const filters: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "Tous" },
    ...(Object.keys(vehicleStatus) as VehicleStatus[]).map((s) => ({ value: s, label: vehicleStatus[s].label })),
  ];

  return (
    <AppShell>
      <PageHeader
        title="Véhicules"
        description={`${total} véhicule(s) dans votre flotte`}
        actions={
          <>
            <Button variant="outline" onClick={() => exportVehiclesCsv(visible)} disabled={!visible.length}>
              <FileDown className="size-4" />
              Exporter
            </Button>
            <Link href="/vehicles/new" className={buttonVariants()}>
              <Plus className="size-4" />
              Nouveau véhicule
            </Link>
          </>
        }
      />

      <Panel flush>
        <Toolbar className="justify-between">
          <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
            {filters.map((f) => (
              <SegmentButton key={f.value} active={status === f.value} onClick={() => setStatus(f.value)} count={counts[f.value]}>
                {f.label}
              </SegmentButton>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
            <Input placeholder="Immatriculation, marque, modèle…" className="h-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </Toolbar>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Car}
            title={q || status !== "all" ? "Aucun véhicule ne correspond" : "Aucun véhicule"}
            description={q || status !== "all" ? "Modifiez la recherche ou le filtre." : "Ajoutez votre premier véhicule pour commencer."}
            action={
              !q && status === "all" ? (
                <Link href="/vehicles/new" className={buttonVariants()}>
                  <Plus className="size-4" />
                  Nouveau véhicule
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Véhicule</TableHead>
                <TableHead className="hidden sm:table-cell">Immatriculation</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">Énergie</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Kilométrage</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((v) => {
                const photo = assetUrl(v.photo_url);
                return (
                  <TableRow key={v.id} className="group cursor-pointer" onClick={() => router.push(`/vehicles/${v.id}`)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-surface-sunken text-subtle-foreground">
                          {photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={photo} alt="" className="size-full object-cover" />
                          ) : (
                            <Car className="size-4" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <Link href={`/vehicles/${v.id}`} className="block truncate font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                            {v.brand} {v.model}
                          </Link>
                          <p className="hidden text-xs text-muted-foreground sm:block">{v.year ?? "Année inconnue"}</p>
                          <Plate value={v.registration} size="sm" className="mt-1 sm:hidden" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Plate value={v.registration} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{vehicleTypeLabels[v.vehicle_type] ?? v.vehicle_type}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{energyLabels[v.energy] ?? v.energy}</TableCell>
                    <TableCell className="hidden text-right font-medium sm:table-cell">{formatNumber(v.mileage, "km")}</TableCell>
                    <TableCell>
                      <StatusBadge tone={vehicleStatus[v.status].tone}>{vehicleStatus[v.status].label}</StatusBadge>
                    </TableCell>
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
