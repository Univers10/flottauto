"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Search, Users } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, Panel, Plate, StatusBadge, Toolbar, toneText } from "@/components/app/primitives";
import { api, listVehicles } from "@/lib/api";
import { formatDate, formatRelativeDays, fullName, initials, expiryTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Driver, Vehicle } from "@/types";
import { toast } from "sonner";

type ActiveFilter = "all" | "active" | "inactive";

/** Ton d'une échéance : expirée = danger, moins de 30 jours = warning. */
export default function DriversPage() {
  const router = useRouter();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [active, setActive] = useState<ActiveFilter>("all");

  async function loadDrivers() {
    setLoading(true);
    try {
      const [res, vehiclesRes] = await Promise.all([
        api.get<Driver[]>("/drivers"),
        // Véhicules affectés : information complémentaire, un échec ne bloque pas la liste.
        listVehicles({ size: 100 }).catch(() => null),
      ]);
      setDrivers(res);
      setVehicles(vehiclesRes?.items ?? []);
    } catch (err: any) {
      toast.error(err.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDrivers();
  }, []);

  const vehicleByDriver = useMemo(() => {
    const map = new Map<number, Vehicle>();
    vehicles.forEach((v) => {
      if (v.driver_id != null && !map.has(v.driver_id)) map.set(v.driver_id, v);
    });
    return map;
  }, [vehicles]);

  const searched = drivers.filter((d) =>
    `${d.first_name} ${d.last_name} ${d.email ?? ""} ${d.phone ?? ""} ${d.license_number ?? ""}`.toLowerCase().includes(q.toLowerCase())
  );
  const counts: Record<ActiveFilter, number> = {
    all: searched.length,
    active: searched.filter((d) => d.is_active).length,
    inactive: searched.filter((d) => !d.is_active).length,
  };
  const visible = active === "all" ? searched : searched.filter((d) => (active === "active" ? d.is_active : !d.is_active));
  const filters: { value: ActiveFilter; label: string }[] = [
    { value: "all", label: "Tous" },
    { value: "active", label: "Actifs" },
    { value: "inactive", label: "Inactifs" },
  ];
  const filtering = q !== "" || active !== "all";

  return (
    <AppShell>
      <PageHeader
        title="Conducteurs"
        description={`${drivers.length} conducteur(s) enregistré(s)`}
        actions={
          <Link href="/drivers/new" className={buttonVariants()}>
            <Plus className="size-4" />
            Nouveau conducteur
          </Link>
        }
      />

      <Panel flush>
        <Toolbar className="justify-between">
          <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setActive(f.value)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                  active === f.value ? "bg-secondary text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {f.label}
                <span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground tabular">{counts[f.value]}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
            <Input placeholder="Nom, email, téléphone, permis…" className="h-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
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
            icon={Users}
            title={filtering ? "Aucun conducteur ne correspond" : "Aucun conducteur"}
            description={filtering ? "Modifiez la recherche ou le filtre." : "Ajoutez votre premier conducteur pour commencer."}
            action={
              !filtering ? (
                <Link href="/drivers/new" className={buttonVariants()}>
                  <Plus className="size-4" />
                  Nouveau conducteur
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conducteur</TableHead>
                <TableHead className="hidden md:table-cell">Contact</TableHead>
                <TableHead className="hidden lg:table-cell">Permis</TableHead>
                <TableHead>Expiration permis</TableHead>
                <TableHead className="hidden md:table-cell">Véhicule</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((d) => {
                const vehicle = vehicleByDriver.get(d.id);
                const tone = expiryTone(d.license_expiry);
                return (
                  <TableRow key={d.id} className="group cursor-pointer" onClick={() => router.push(`/drivers/${d.id}`)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary">
                          {initials(d.first_name, d.last_name)}
                        </span>
                        <div className="min-w-0">
                          <Link href={`/drivers/${d.id}`} className="block truncate font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                            {fullName(d)}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground md:hidden">{d.phone || d.email || "—"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <p className="tabular">{d.phone || "—"}</p>
                      <p className="max-w-[220px] truncate text-xs text-muted-foreground">{d.email || "Aucun email"}</p>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {d.license_number ? (
                        <>
                          <p className="font-mono text-xs">{d.license_number}</p>
                          <p className="text-xs text-muted-foreground">{d.license_categories ? `Cat. ${d.license_categories}` : "Catégories non renseignées"}</p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Non renseigné</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {d.license_expiry ? (
                        <>
                          <p className="tabular">{formatDate(d.license_expiry)}</p>
                          <p className={cn("text-xs", tone ? cn(toneText(tone), "font-medium") : "text-muted-foreground")}>
                            {tone === "danger" ? "Expiré " : ""}
                            {formatRelativeDays(d.license_expiry)}
                          </p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {vehicle ? <Plate value={vehicle.registration} size="sm" /> : <span className="text-xs text-muted-foreground">Aucun</span>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={d.is_active ? "success" : "neutral"}>{d.is_active ? "Actif" : "Inactif"}</StatusBadge>
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
