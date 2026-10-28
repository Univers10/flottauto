"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BusFront, CheckCircle2, CircleAlert, OctagonX, Plus, Printer, TriangleAlert } from "lucide-react";
import { AppShell, useCurrentUser } from "@/components/layout/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PageHeader, Panel, Plate, SegmentButton, StatCard, StatusBadge, toneText } from "@/components/app/primitives";
import { createInspection, issueExitPass, listDepartures, listVehicles, markDeparted } from "@/lib/api";
import { checklistItemTone, departureLight, departureStatus, type Tone } from "@/lib/labels";
import { canRunInspections } from "@/lib/roles";
import { fullName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Departure, DepartureLight, Vehicle } from "@/types";
import { toast } from "sonner";

/* ───────────────────────── Utilitaires ───────────────────────── */

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

const borderTone: Record<Tone, string> = {
  success: "border-success-border",
  warning: "border-warning-border",
  danger: "border-danger-border",
  info: "border-info-border",
  neutral: "border-neutral-border",
};

const RULES: { tone: Tone; title: string; text: string }[] = [
  {
    tone: "danger",
    title: "Rouge = blocage",
    text: "Document expiré ou absent, case KO en sécurité, signature manquante, convoi non soldé.",
  },
  {
    tone: "warning",
    title: "Orange = départ avec alerte",
    text: "Échéance à moins de 30 jours, vidange à moins de 2 000 km ; le superviseur est notifié.",
  },
  {
    tone: "info",
    title: "3 signatures par code PIN",
    text: "Chef de gare, chauffeur et convoyeur signent l'état des lieux avec leur code PIN.",
  },
  {
    tone: "neutral",
    title: "Bon de sortie QR",
    text: "Scanné à la sortie de gare ; sans bon valide, le départ est une infraction.",
  },
];

/* ───────────────────────── Page ───────────────────────── */

export default function DeparturesPage() {
  return (
    <AppShell>
      <DeparturesBoard />
    </AppShell>
  );
}

function DeparturesBoard() {
  const user = useCurrentUser();
  const canEdit = !!user && canRunInspections(user.role);
  const [day, setDay] = useState(todayIso);
  const [rows, setRows] = useState<Departure[]>([]);
  const [vehicles, setVehicles] = useState<Record<number, Vehicle>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listVehicles({ size: 100 })
      .then((res) => setVehicles(Object.fromEntries(res.items.map((v) => [v.id, v]))))
      .catch(() => toast.error("Erreur de chargement des véhicules"));
  }, []);

  const load = useCallback(async (selectedDay: string) => {
    setLoading(true);
    try {
      const data = await listDepartures({ day: selectedDay || undefined });
      setRows([...data].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)));
    } catch (err: any) {
      toast.error(err.message || "Erreur de chargement des départs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(day);
  }, [day, load]);

  const replaceRow = useCallback((next: Departure) => {
    setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)));
  }, []);

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status === "planned" || r.status === "authorized");
    const byLight = (light: DepartureLight) => active.filter((r) => r.checklist?.status === light).length;
    return {
      green: byLight("green"),
      orange: byLight("orange"),
      red: byLight("red"),
      departed: rows.filter((r) => r.status === "departed").length,
      issued: rows.filter((r) => r.status === "authorized").length,
    };
  }, [rows]);

  const isToday = day === todayIso();

  return (
    <>
      <PageHeader
        title="Autorisation de départ"
        description="Comme un pilote avant le décollage : chaque point est vérifié par le système. Un seul point rouge suffit à bloquer le départ. Personne ne peut forcer un départ bloqué, même le chef de gare."
        actions={
          <>
            <SegmentButton active={isToday} onClick={() => setDay(todayIso())}>
              Aujourd&apos;hui
            </SegmentButton>
            <div className="w-44">
              <DateInput value={day} onValueChange={setDay} aria-label="Jour" className="h-9" />
            </div>
            {canEdit && (
              <Link href="/departures/new" className={buttonVariants()}>
                <Plus className="size-4" />
                Nouveau départ
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Autorisés" value={stats.green} icon={CheckCircle2} tone="success" hint={`${stats.issued} bon${stats.issued > 1 ? "s" : ""} de sortie émis`} />
        <StatCard label="Avec réserves" value={stats.orange} icon={TriangleAlert} tone="warning" hint="Superviseur notifié" />
        <StatCard label="Bloqués" value={stats.red} icon={OctagonX} tone="danger" hint="Aucun départ possible" />
        <StatCard label="Partis" value={stats.departed} icon={BusFront} tone="info" />
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Panel>
            <EmptyState
              icon={BusFront}
              title={isToday ? "Aucun départ prévu aujourd'hui" : "Aucun départ ce jour-là"}
              description="Programmez un départ : le système vérifie les papiers, l'équipage, le car et l'exploitation avant d'émettre le bon de sortie."
              action={
                canEdit ? (
                  <Link href="/departures/new" className={buttonVariants()}>
                    <Plus className="size-4" />
                    Nouveau départ
                  </Link>
                ) : undefined
              }
            />
          </Panel>
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-2">
            {rows.map((dep) => (
              <DepartureCard key={dep.id} departure={dep} vehicle={vehicles[dep.vehicle_id]} canEdit={canEdit} onChange={replaceRow} onReload={() => load(day)} />
            ))}
          </div>
        )}
      </div>

      <Panel title="Règles du décollage" className="mt-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {RULES.map((rule) => (
            <div key={rule.title} className="space-y-1">
              <p className={cn("text-sm font-semibold", toneText(rule.tone))}>{rule.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{rule.text}</p>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

/* ───────────────────────── Carte de départ ───────────────────────── */

function DepartureCard({
  departure: dep,
  vehicle,
  canEdit,
  onChange,
  onReload,
}: {
  departure: Departure;
  vehicle: Vehicle | undefined;
  canEdit: boolean;
  onChange: (next: Departure) => void;
  onReload: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const registration = vehicle?.registration ?? `#${dep.vehicle_id}`;
  const header = (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
      <span>Car</span>
      <Plate value={registration} size="sm" />
      {dep.route_label && <span>· {dep.route_label}</span>}
      <span className="tabular">· {formatTime(dep.scheduled_at)}</span>
    </p>
  );

  // Départ parti ou annulé : carte compacte.
  if (dep.status === "departed" || dep.status === "cancelled" || !dep.checklist) {
    const st = departureStatus[dep.status];
    return (
      <Link
        href={`/departures/${dep.id}`}
        className="flex items-center justify-between gap-3 rounded-xl border bg-surface-sunken px-5 py-4 text-muted-foreground transition-colors hover:border-border-strong"
      >
        <div className="min-w-0 space-y-1">
          {header}
          {dep.status === "departed" && dep.departed_at && <p className="text-xs tabular">Parti à {formatTime(dep.departed_at)}</p>}
        </div>
        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
      </Link>
    );
  }

  const checklist = dep.checklist;
  const light = departureLight[checklist.status];
  const isRed = checklist.status === "red";
  const isAuthorized = dep.status === "authorized";

  async function run(op: () => Promise<Departure>, success: string) {
    setBusy(true);
    try {
      onChange(await op());
      toast.success(success);
    } catch (err: any) {
      toast.error(err.message || "Action impossible");
      onReload();
    } finally {
      setBusy(false);
    }
  }

  async function openInspection() {
    if (dep.inspection_id) {
      router.push(`/inspections/${dep.inspection_id}`);
      return;
    }
    setBusy(true);
    try {
      const insp = await createInspection({ vehicle_id: dep.vehicle_id, kind: "departure", departure_id: dep.id });
      router.push(`/inspections/${insp.id}`);
    } catch (err: any) {
      toast.error(err.message || "Ouverture de l'état des lieux impossible");
      setBusy(false);
    }
  }

  return (
    <article className={cn("overflow-hidden rounded-xl border-[1.5px] bg-card shadow-card", borderTone[light.tone])}>
      <div className="flex flex-col gap-4 px-5 pt-5 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          {header}
          <p className={cn("text-2xl font-bold tracking-tight", toneText(light.tone))}>{light.headline}</p>
          {(dep.driver || dep.conveyor) && (
            <p className="text-xs text-muted-foreground">
              {[dep.driver ? `Chauffeur ${fullName(dep.driver)}` : null, dep.conveyor ? `Convoyeur ${fullName(dep.conveyor)}` : null].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {isAuthorized && dep.exit_pass_number ? (
          <div className="shrink-0 sm:text-right">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Bon de sortie</p>
            <p className="font-mono text-sm font-semibold tabular">{dep.exit_pass_number}</p>
            <p className="text-xs text-muted-foreground tabular">Valable jusqu&apos;à {formatTime(dep.exit_pass_valid_until)}</p>
          </div>
        ) : isRed && checklist.blocking_reason ? (
          <div className="max-w-xs shrink-0 sm:text-right">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Motif</p>
            <p className={cn("text-sm font-medium", toneText("danger"))}>{checklist.blocking_reason}</p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-x-6 gap-y-4 border-t px-5 py-4 sm:grid-cols-2 xl:grid-cols-1">
        {checklist.groups.map((group) => (
          <div key={group.key} className="min-w-0">
            <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{group.label}</p>
            <ul className="divide-y">
              {group.items.map((item) => (
                <li key={item.code} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate">{item.label}</span>
                  <StatusBadge tone={checklistItemTone[item.status]} className="max-w-[55%] truncate">
                    <span className="truncate">{item.detail || (item.status === "ok" ? "OK" : "—")}</span>
                  </StatusBadge>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-surface-sunken px-5 py-3">
        {isAuthorized ? (
          <>
            <Link href={`/departures/${dep.id}/pass`} className={buttonVariants({ variant: "outline" })}>
              <Printer className="size-4" />
              Imprimer le bon de sortie (QR)
            </Link>
            {canEdit && (
              <Button disabled={busy} onClick={() => run(() => markDeparted(dep.id), "Départ enregistré")}>
                <BusFront className="size-4" />
                Marquer parti
              </Button>
            )}
          </>
        ) : isRed ? (
          <>
            <Link href={`/departures/${dep.id}`} className={buttonVariants({ variant: "outline" })}>
              Voir le détail
            </Link>
            {canEdit &&
              (dep.inspection_id ? (
                <Link href={`/inspections/${dep.inspection_id}`} className={buttonVariants()}>
                  Faire l&apos;état des lieux
                </Link>
              ) : (
                <Button disabled={busy} onClick={openInspection}>
                  Faire l&apos;état des lieux
                </Button>
              ))}
          </>
        ) : (
          <>
            <Link href={`/departures/${dep.id}`} className={buttonVariants({ variant: "outline" })}>
              Voir le détail
            </Link>
            {canEdit && (
              <Button disabled={busy} onClick={() => run(() => issueExitPass(dep.id), "Bon de sortie émis")}>
                {checklist.status === "orange" && <CircleAlert className="size-4" />}
                Émettre le bon de sortie
              </Button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
