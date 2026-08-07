"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileDown, Plus, Search, Car } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { Vehicle, PaginatedResponse, VehicleStatus } from "@/types";
import { toast } from "sonner";

const statusBadges: Record<VehicleStatus, { bg: string; text: string; label: string }> = {
  available: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Disponible" },
  in_mission: { bg: "bg-blue-50", text: "text-blue-700", label: "En mission" },
  in_maintenance: { bg: "bg-amber-50", text: "text-amber-700", label: "En maintenance" },
  out_of_service: { bg: "bg-rose-50", text: "text-rose-700", label: "Hors service" },
};

function escapeCsv(value: unknown) {
  const str = String(value ?? "").replace(/"/g, '""');
  return str.includes(",") || str.includes("\n") ? `"${str}"` : str;
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
    v.vehicle_type,
    v.energy,
    v.year ?? "",
    v.vin ?? "",
    v.mileage,
    statusBadges[v.status]?.label ?? v.status,
    v.first_registration_date ?? "",
    v.purchase_price ?? "",
    v.notes ?? "",
  ]);
  const csv = [headers.map(escapeCsv).join(";"), ...rows.map((r) => r.map(escapeCsv).join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flottauto-vehicules-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  async function loadVehicles() {
    setLoading(true);
    try {
      const res = await api.get<PaginatedResponse<Vehicle>>(`/vehicles?q=${encodeURIComponent(q)}`);
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

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Flotte</h1>
            <p className="mt-1 text-sm text-muted-foreground">{total} véhicule(s) enregistrés</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => exportVehiclesCsv(vehicles)}
              disabled={!vehicles.length}
              className="h-10 gap-2 rounded-xl border-border/60 px-4"
            >
              <FileDown className="h-4 w-4" />
              Exporter
            </Button>
            <Link href="/vehicles/new">
              <Button className="h-10 gap-2 rounded-xl px-5 shadow-md shadow-primary/20">
                <Plus className="h-4 w-4" />
                Nouveau véhicule
              </Button>
            </Link>
          </div>
        </div>

        <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg font-semibold">Liste des véhicules</CardTitle>
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher un véhicule..."
                className="h-10 w-full rounded-xl border-border/60 bg-muted/50 pl-9 text-sm focus-visible:bg-background"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : vehicles.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                Aucun véhicule trouvé.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {vehicles.map((vehicle) => (
                    <Link key={vehicle.id} href={`/vehicles/${vehicle.id}`} className="block">
                      <Card className="group cursor-pointer overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm shadow-black/5 transition-all hover:-translate-y-1 hover:shadow-lg">
                        <div className="relative h-40 overflow-hidden bg-gradient-to-br from-muted to-muted/60">
                          {vehicle.photo_url ? (
                            <img
                              src={vehicle.photo_url.startsWith("http") ? vehicle.photo_url : `${(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1").replace("/api/v1", "")}${vehicle.photo_url}`}
                              alt={`${vehicle.brand} ${vehicle.model}`}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <Car className="h-12 w-12 opacity-40" />
                            </div>
                          )}
                          <Badge
                            className={cn(
                              "absolute top-3 right-3 rounded-lg border-0 px-2.5 py-0.5 font-medium",
                              statusBadges[vehicle.status].bg,
                              statusBadges[vehicle.status].text,
                            )}
                          >
                            {statusBadges[vehicle.status].label}
                          </Badge>
                        </div>
                        <CardContent className="space-y-2 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="font-semibold">{vehicle.brand} {vehicle.model}</h3>
                              <p className="text-sm text-muted-foreground">{vehicle.registration}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <span className="capitalize">{vehicle.vehicle_type}</span>
                            <span>{vehicle.mileage.toLocaleString()} km</span>
                          </div>
                          {vehicle.year && (
                            <p className="text-xs text-muted-foreground">Année : {vehicle.year}</p>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
