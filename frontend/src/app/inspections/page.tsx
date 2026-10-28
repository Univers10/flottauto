"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ChevronRight, ClipboardCheck, PenLine, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, Panel, Plate, SegmentButton, StatusBadge, Toolbar, toneText } from "@/components/app/primitives";
import { listInspections, listVehicles } from "@/lib/api";
import { inspectionKindLabels, inspectionVerdict } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { InspectionKind, InspectionListItem, InspectionStatus, Vehicle } from "@/types";
import { toast } from "sonner";

type KindFilter = InspectionKind | "all";
type StatusFilter = InspectionStatus | "all";

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDayTime(value: string, withDay: boolean): string {
  if (!withDay) return formatTime(value);
  const d = new Date(value);
  return `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} · ${formatTime(value)}`;
}

function VerdictCell({ row }: { row: InspectionListItem }) {
  if (!row.verdict) return <span className="text-xs text-muted-foreground">En cours</span>;
  const v = inspectionVerdict[row.verdict];
  return (
    <span className="inline-flex items-center gap-2">
      <StatusBadge tone={v.tone}>{v.label}</StatusBadge>
      {row.score !== null && <span className="text-xs font-medium text-muted-foreground tabular">{row.score}/100</span>}
    </span>
  );
}

function Progress({ icon: Icon, value, max, label }: { icon: React.ElementType; value: number; max: number; label: string }) {
  const complete = value >= max;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium tabular", complete ? toneText("success") : "text-muted-foreground")} title={label}>
      <Icon className="size-3.5" aria-hidden />
      {value}/{max}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export default function InspectionsPage() {
  const router = useRouter();
  const [day, setDay] = useState(todayIso);
  const [kind, setKind] = useState<KindFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [rows, setRows] = useState<InspectionListItem[]>([]);
  const [vehicles, setVehicles] = useState<Record<number, Vehicle>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listVehicles({ size: 100 })
      .then((res) => setVehicles(Object.fromEntries(res.items.map((v) => [v.id, v]))))
      .catch(() => toast.error("Erreur de chargement des véhicules"));
  }, []);

  async function load(selectedDay: string) {
    setLoading(true);
    try {
      setRows(await listInspections({ day: selectedDay || undefined }));
    } catch (err: any) {
      toast.error(err.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(day);
  }, [day]);

  const counts = useMemo(() => {
    const byKind = rows.filter((r) => status === "all" || r.status === status);
    const byStatus = rows.filter((r) => kind === "all" || r.kind === kind);
    return {
      kind: { all: byKind.length, departure: byKind.filter((r) => r.kind === "departure").length, arrival: byKind.filter((r) => r.kind === "arrival").length },
      status: { all: byStatus.length, draft: byStatus.filter((r) => r.status === "draft").length, validated: byStatus.filter((r) => r.status === "validated").length },
    };
  }, [rows, kind, status]);

  const visible = rows.filter((r) => (kind === "all" || r.kind === kind) && (status === "all" || r.status === status));
  const isToday = day === todayIso();
  const filtered = kind !== "all" || status !== "all";

  const kindFilters: { value: KindFilter; label: string }[] = [
    { value: "all", label: "Tous" },
    { value: "departure", label: "Départs" },
    { value: "arrival", label: "Arrivées" },
  ];
  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "Tous" },
    { value: "draft", label: "Brouillons" },
    { value: "validated", label: "Validés" },
  ];

  const newButton = (
    <Link href="/inspections/new" className={buttonVariants()}>
      <Plus className="size-4" />
      Nouvel état des lieux
    </Link>
  );

  return (
    <AppShell>
      <PageHeader
        title="États des lieux"
        description="Contrôles au départ et à l'arrivée des cars : photos, points de contrôle et signatures."
        actions={newButton}
      />

      <Panel flush>
        <Toolbar className="flex-wrap gap-3 lg:flex-nowrap lg:justify-between">
          <div className="flex items-center gap-2">
            <SegmentButton active={isToday} onClick={() => setDay(todayIso())}>
              Aujourd&apos;hui
            </SegmentButton>
            <div className="w-44">
              <DateInput value={day} onValueChange={setDay} aria-label="Jour" className="h-9" />
            </div>
          </div>
          <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1">
            <div className="flex gap-1" role="group" aria-label="Type">
              {kindFilters.map((f) => (
                <SegmentButton key={f.value} active={kind === f.value} onClick={() => setKind(f.value)} count={counts.kind[f.value]}>
                  {f.label}
                </SegmentButton>
              ))}
            </div>
            <span className="w-px shrink-0 bg-border" aria-hidden />
            <div className="flex gap-1" role="group" aria-label="Statut">
              {statusFilters.map((f) => (
                <SegmentButton key={f.value} active={status === f.value} onClick={() => setStatus(f.value)} count={counts.status[f.value]}>
                  {f.label}
                </SegmentButton>
              ))}
            </div>
          </div>
        </Toolbar>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={filtered ? "Aucun état des lieux ne correspond" : day ? "Aucun état des lieux ce jour" : "Aucun état des lieux"}
            description={filtered ? "Modifiez les filtres." : "Commencez par l'état des lieux de départ d'un car."}
            action={filtered ? undefined : newButton}
          />
        ) : (
          <>
            {/* Mobile : cartes compactes */}
            <ul className="divide-y md:hidden">
              {visible.map((r) => {
                const vehicle = vehicles[r.vehicle_id];
                return (
                  <li key={r.id}>
                    <Link href={`/inspections/${r.id}`} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Plate value={vehicle?.registration ?? `#${r.vehicle_id}`} size="sm" />
                          <StatusBadge tone={r.kind === "departure" ? "info" : "neutral"}>{inspectionKindLabels[r.kind]}</StatusBadge>
                          {r.status === "draft" && <span className="text-xs text-muted-foreground">Brouillon</span>}
                        </div>
                        <p className="truncate text-sm font-medium">{r.route_label || "Ligne non renseignée"}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <VerdictCell row={r} />
                          <Progress icon={Camera} value={r.photos_count} max={8} label="photos" />
                          <Progress icon={PenLine} value={r.signatures_count} max={3} label="signatures" />
                        </div>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {r.number} · {formatDayTime(r.created_at, !day)}
                        </p>
                      </div>
                      <ChevronRight className="mt-1 size-4 shrink-0 text-subtle-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Bureau : tableau */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Car</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Ligne</TableHead>
                    <TableHead>Verdict</TableHead>
                    <TableHead className="text-center">Photos</TableHead>
                    <TableHead className="text-center">Signatures</TableHead>
                    <TableHead className="text-right">Heure</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => {
                    const vehicle = vehicles[r.vehicle_id];
                    return (
                      <TableRow key={r.id} className="group cursor-pointer" onClick={() => router.push(`/inspections/${r.id}`)}>
                        <TableCell>
                          <Link href={`/inspections/${r.id}`} className="font-mono text-xs font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                            {r.number}
                          </Link>
                          {r.status === "draft" && <p className="text-xs text-muted-foreground">Brouillon</p>}
                        </TableCell>
                        <TableCell>
                          <Plate value={vehicle?.registration ?? `#${r.vehicle_id}`} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={r.kind === "departure" ? "info" : "neutral"}>{inspectionKindLabels[r.kind]}</StatusBadge>
                        </TableCell>
                        <TableCell className="max-w-56 truncate text-muted-foreground">{r.route_label || "—"}</TableCell>
                        <TableCell>
                          <VerdictCell row={r} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Progress icon={Camera} value={r.photos_count} max={8} label="photos" />
                        </TableCell>
                        <TableCell className="text-center">
                          <Progress icon={PenLine} value={r.signatures_count} max={3} label="signatures" />
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular">{formatDayTime(r.created_at, !day)}</TableCell>
                        <TableCell className="pr-4">
                          <ChevronRight className="size-4 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Panel>
    </AppShell>
  );
}
