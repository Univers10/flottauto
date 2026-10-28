"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, KeyRound, Plus, Search, Users } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, Panel, Plate, SegmentButton, StatusBadge, Toolbar, toneText } from "@/components/app/primitives";
import { api, listVehicles } from "@/lib/api";
import { formatDate, formatRelativeDays, fullName, initials, expiryTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { staffTypeLabels } from "@/lib/labels";
import type { Driver, StaffType, Vehicle } from "@/types";
import { toast } from "sonner";

type ActiveFilter = "all" | "active" | "inactive";
type TypeFilter = "all" | StaffType;

/** Échéance (permis, visite médicale) : date + délai, coloré si expiré ou proche. */
function ExpiryCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const tone = expiryTone(value);
  return (
    <>
      <p className="tabular">{formatDate(value)}</p>
      <p className={cn("text-xs", tone ? cn(toneText(tone), "font-medium") : "text-muted-foreground")}>
        {tone === "danger" ? "Expiré " : ""}
        {formatRelativeDays(value)}
      </p>
    </>
  );
}

export default function DriversPage() {
  const router = useRouter();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [active, setActive] = useState<ActiveFilter>("all");
  const [staffType, setStaffType] = useState<TypeFilter>("all");

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
    `${d.first_name} ${d.last_name} ${d.email ?? ""} ${d.phone ?? ""} ${d.license_number ?? ""} ${d.itts_staff_id ?? ""}`.toLowerCase().includes(q.toLowerCase())
  );
  const matchesActive = (d: Driver, f: ActiveFilter) => f === "all" || (f === "active" ? d.is_active : !d.is_active);
  const matchesType = (d: Driver, f: TypeFilter) => f === "all" || d.staff_type === f;
  // Chaque groupe de filtres compte selon l'autre filtre déjà appliqué.
  const byType = searched.filter((d) => matchesType(d, staffType));
  const byActive = searched.filter((d) => matchesActive(d, active));
  const counts: Record<ActiveFilter, number> = {
    all: byType.length,
    active: byType.filter((d) => d.is_active).length,
    inactive: byType.filter((d) => !d.is_active).length,
  };
  const typeCounts: Record<TypeFilter, number> = {
    all: byActive.length,
    driver: byActive.filter((d) => d.staff_type === "driver").length,
    conveyor: byActive.filter((d) => d.staff_type === "conveyor").length,
  };
  const visible = byType.filter((d) => matchesActive(d, active));
  const filters: { value: ActiveFilter; label: string }[] = [
    { value: "all", label: "Tous" },
    { value: "active", label: "Actifs" },
    { value: "inactive", label: "Inactifs" },
  ];
  const typeFilters: { value: TypeFilter; label: string }[] = [
    { value: "all", label: "Tous" },
    { value: "driver", label: "Chauffeurs" },
    { value: "conveyor", label: "Convoyeurs" },
  ];
  const filtering = q !== "" || active !== "all" || staffType !== "all";

  return (
    <AppShell>
      <PageHeader
        title="Personnel"
        description="Chauffeurs et convoyeurs"
        actions={
          <Link href="/drivers/new" className={buttonVariants()}>
            <Plus className="size-4" />
            Ajouter une personne
          </Link>
        }
      />

      <Panel flush>
        <Toolbar className="justify-between">
          <div className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1">
            {typeFilters.map((f) => (
              <SegmentButton key={f.value} active={staffType === f.value} onClick={() => setStaffType(f.value)} count={typeCounts[f.value]}>
                {f.label}
              </SegmentButton>
            ))}
            <span aria-hidden className="mx-1.5 h-5 w-px shrink-0 bg-border" />
            {filters.map((f) => (
              <SegmentButton key={f.value} active={active === f.value} onClick={() => setActive(f.value)} count={counts[f.value]}>
                {f.label}
              </SegmentButton>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
            <Input placeholder="Nom, email, téléphone, permis, ITTS…" className="h-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
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
            title={filtering ? "Aucune personne ne correspond" : "Aucun membre du personnel"}
            description={filtering ? "Modifiez la recherche ou le filtre." : "Ajoutez un premier chauffeur ou convoyeur pour commencer."}
            action={
              !filtering ? (
                <Link href="/drivers/new" className={buttonVariants()}>
                  <Plus className="size-4" />
                  Ajouter une personne
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Personne</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="hidden md:table-cell">Contact</TableHead>
                <TableHead className="hidden lg:table-cell">Permis</TableHead>
                <TableHead className="hidden sm:table-cell">Expiration permis</TableHead>
                <TableHead>Visite médicale</TableHead>
                <TableHead className="hidden md:table-cell">Véhicule</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((d) => {
                const vehicle = vehicleByDriver.get(d.id);
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
                          <p
                            className={cn("mt-0.5 flex items-center gap-1 text-xs", d.has_pin ? "text-muted-foreground" : cn(toneText("warning"), "font-medium"))}
                            title={d.has_pin ? "PIN de signature défini" : "Aucun PIN de signature"}
                          >
                            <KeyRound className="size-3" />
                            {d.has_pin ? "PIN défini" : "Sans PIN"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <StatusBadge tone="neutral">{staffTypeLabels[d.staff_type] ?? d.staff_type}</StatusBadge>
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
                    <TableCell className="hidden sm:table-cell">
                      {d.staff_type === "conveyor" && !d.license_expiry ? (
                        <span className="text-xs text-muted-foreground">Non requis</span>
                      ) : (
                        <ExpiryCell value={d.license_expiry} />
                      )}
                    </TableCell>
                    <TableCell>
                      <ExpiryCell value={d.medical_visit_expiry} />
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
