"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BusFront, CircleAlert, FileDown, Fuel, Printer, Route, Wrench } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PageHeader, Panel, StatCard, StatusBadge, toneText } from "@/components/app/primitives";
import { getReportSummary } from "@/lib/api";
import { convoyVerdictTone } from "@/lib/labels";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReportSummary } from "@/types";

const F = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${formatNumber(n)} F`);

type PeriodKey = "this_week" | "last_week" | "this_month" | "last_month";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "this_week", label: "Cette semaine" },
  { key: "last_week", label: "Semaine dernière" },
  { key: "this_month", label: "Ce mois" },
  { key: "last_month", label: "Mois dernier" },
];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function range(key: PeriodKey): [string, string] {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  if (key === "this_week" || key === "last_week") {
    if (key === "last_week") monday.setDate(monday.getDate() - 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return [iso(monday), iso(sunday)];
  }
  const offset = key === "last_month" ? -1 : 0;
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const last = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
  return [iso(first), iso(last)];
}

function csvCell(value: unknown): string {
  const s = String(value ?? "").replace(/"/g, '""');
  return /[;"\n]/.test(s) ? `"${s}"` : s;
}

function exportCsv(report: ReportSummary) {
  const header = ["Car", "Immatriculation", "Km", "Carburant (F)", "Litres", "Péages (F)", "Entretien (F)", "Coût total (F)", "Coût / km (F)", "Départs", "Convois", "Recette convois (F)", "À prévoir (F)"];
  const rows = report.vehicles.map((v) => [v.label, v.registration, v.km, v.fuel, v.fuel_liters, v.tolls, v.maintenance, v.total_cost, v.cost_per_km ?? "", v.departures, v.convoys, v.convoy_revenue, v.needs_to_plan]);
  // Point-virgule : Excel en français ouvre le fichier directement en colonnes.
  const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `flottauto-rapport-${report.start}-${report.end}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<PeriodKey>("this_week");
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const [start, end] = range(period);
    getReportSummary(start, end)
      .then((r) => !cancelled && setReport(r))
      .catch((err: Error) => !cancelled && toast.error(err.message || "Rapport indisponible"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [period]);

  const weekly = period === "this_week" || period === "last_week";

  return (
    <AppShell>
      <PageHeader
        title={weekly ? "Point hebdomadaire" : "Bilan du mois"}
        description={report ? report.label : "Coût par car, convois, réparations à surveiller et dépenses à prévoir."}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" disabled={!report} onClick={() => report && exportCsv(report)}>
              <FileDown className="size-4" />
              Exporter (Excel)
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" />
              Imprimer
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap gap-1.5 print:hidden" role="group" aria-label="Période">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={period === p.key}
            onClick={() => {
              setLoading(true);
              setPeriod(p.key);
            }}
            className={cn(
              "h-8 rounded-full px-3 text-sm font-medium transition-colors",
              period === p.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading || !report ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : (
        <ReportView report={report} />
      )}
    </AppShell>
  );
}

function ReportView({ report }: { report: ReportSummary }) {
  const t = report.totals;
  const c = report.compliance;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Dépenses des cars" value={F(t.expenses)} hint={`Carburant ${F(t.fuel)} · Péages ${F(t.tolls)} · Entretien ${F(t.maintenance)}`} icon={Fuel} />
        <StatCard label="Kilomètres relevés" value={`${formatNumber(t.km)} km`} hint={t.km ? `${F(Math.round(t.expenses / t.km))} par km` : "Relevés : carburant, péages, états des lieux"} icon={BusFront} />
        <StatCard
          label="Convois"
          value={F(t.convoy_revenue)}
          hint={`${t.convoys} convoi(s) · marge ${F(t.convoy_margin)}${t.convoy_balance_due ? ` · reste à encaisser ${F(t.convoy_balance_due)}` : ""}`}
          icon={Route}
          tone={t.convoy_balance_due ? "warning" : undefined}
        />
        <StatCard
          label="À prévoir"
          value={F(t.needs_to_plan)}
          hint={`${t.needs_count} besoin(s) ouverts${t.needs_before_departure ? ` · ${t.needs_before_departure} avant le départ` : ""}`}
          icon={Wrench}
          tone={t.needs_before_departure ? "danger" : undefined}
          href="/needs"
        />
      </div>

      <Panel title="À surveiller" description="Réparations hors des règles et pannes qui reviennent.">
        {report.watch.length === 0 && report.repeated.length === 0 ? (
          <p className={cn("text-sm font-medium", toneText("success"))}>Rien à signaler sur la période.</p>
        ) : (
          <ul className="divide-y text-sm">
            {report.watch.map((w) => (
              <li key={w.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <Link href={`/maintenance/${w.id}`} className="font-medium hover:underline">
                    N°{w.id} · {w.title}
                  </Link>
                  <span className="text-muted-foreground"> · {w.vehicle_label.split(" · ")[0]}</span>
                  <ul className="mt-1 space-y-0.5">
                    {w.reasons.map((r) => (
                      <li key={r} className={cn("flex gap-1.5 text-xs", toneText("warning"))}>
                        <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
                <span className="font-semibold tabular">{F(w.amount)}</span>
              </li>
            ))}
            {report.repeated.map((r) => (
              <li key={`${r.vehicle_label}-${r.component}`} className="py-2.5">
                <span className="font-medium">{r.vehicle_label.split(" · ")[0]}</span> · {r.component} : {r.count} fois en 12 mois,{" "}
                <span className={toneText("warning")}>contrôler la conduite et la qualité des réparations</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Coût par car" description="Trié du plus cher au moins cher." flush>
        {report.vehicles.length === 0 ? (
          <EmptyState icon={BusFront} title="Aucune activité" description="Pas de dépense ni de départ sur la période." className="py-10" />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b bg-surface-sunken text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Car</th>
                  <th className="px-3 py-2 text-right font-medium">Km</th>
                  <th className="px-3 py-2 text-right font-medium">Carburant</th>
                  <th className="px-3 py-2 text-right font-medium">Péages</th>
                  <th className="px-3 py-2 text-right font-medium">Entretien</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">F / km</th>
                  <th className="px-3 py-2 text-right font-medium">Départs</th>
                  <th className="px-4 py-2 text-right font-medium">À prévoir</th>
                </tr>
              </thead>
              <tbody>
                {report.vehicles.map((v) => (
                  <tr key={v.vehicle_id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <Link href={`/vehicles/${v.vehicle_id}`} className="font-medium hover:underline">
                        {v.label.split(" · ")[0]}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular">{v.km ? formatNumber(v.km) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular">{formatNumber(v.fuel)}</td>
                    <td className="px-3 py-2 text-right tabular">{formatNumber(v.tolls)}</td>
                    <td className="px-3 py-2 text-right tabular">{formatNumber(v.maintenance)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular">{formatNumber(v.total_cost)}</td>
                    <td className="px-3 py-2 text-right tabular">{v.cost_per_km ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular">{v.departures}</td>
                    <td className="px-4 py-2 text-right tabular">{v.needs_to_plan ? formatNumber(v.needs_to_plan) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Convois de la période">
          {report.convoy_list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun convoi parti sur la période.</p>
          ) : (
            <ul className="divide-y text-sm">
              {report.convoy_list.map((cv) => (
                <li key={cv.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/convoys/${cv.id}`} className="font-medium hover:underline">
                      {cv.number} · {cv.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(cv.departure_at)} · recette {F(cv.revenue)} · marge {F(cv.margin)}
                      {cv.balance > 0 && <span className={toneText("warning")}> · reste {F(cv.balance)}</span>}
                    </p>
                  </div>
                  <StatusBadge tone={convoyVerdictTone[cv.verdict]}>{cv.verdict_label}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Contrôle des départs">
          <dl className="space-y-2 text-sm">
            <Row label="Départs prévus" value={String(t.departures)} />
            <Row label="Partis avec bon de sortie" value={`${t.exit_passes} / ${t.departures_departed}`} tone={t.exit_passes < t.departures_departed ? "danger" : undefined} />
            <Row label="États des lieux au départ / à l'arrivée" value={`${c.departure_inspections} / ${c.arrival_inspections}`} />
            <Row label="Départs bloqués" value={String(c.blocked_alerts)} tone={c.blocked_alerts ? "danger" : undefined} />
            <Row label="Départs avec alerte" value={String(c.warning_alerts)} tone={c.warning_alerts ? "warning" : undefined} />
            <Row label="Factures absentes à minuit" value={String(c.invoice_missing_alerts)} tone={c.invoice_missing_alerts ? "danger" : undefined} />
            <Row
              label="Réparations : en cours / sans facture / clôturées"
              value={`${report.interventions.open} / ${report.interventions.awaiting_invoice} / ${report.interventions.closed}`}
              tone={report.interventions.awaiting_invoice ? "warning" : undefined}
            />
          </dl>
        </Panel>
      </div>

      <Panel title="Papiers qui expirent dans les 30 jours">
        {report.deadlines.length === 0 ? (
          <p className={cn("text-sm font-medium", toneText("success"))}>Aucun papier à renouveler dans les 30 jours.</p>
        ) : (
          <ul className="divide-y text-sm">
            {report.deadlines.map((d, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span>
                  <span className="font-medium">{d.vehicle_label.split(" · ")[0]}</span> · {d.document}
                </span>
                <span className={cn("font-medium tabular", d.days_left < 0 ? toneText("danger") : d.days_left <= 15 ? toneText("warning") : "")}>
                  {d.days_left < 0 ? `Expiré depuis ${-d.days_left} j` : `${d.days_left} jours`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "danger" | "warning" }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("font-semibold tabular", tone && toneText(tone))}>{value}</dd>
    </div>
  );
}
