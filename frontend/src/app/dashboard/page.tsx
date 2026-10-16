"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Car,
  CheckCircle2,
  FileClock,
  RefreshCw,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PageHeader, Panel, Plate, StatCard, StatusBadge, toneSurface } from "@/components/app/primitives";
import { api } from "@/lib/api";
import { alertSeverity, vehicleStatus, workOrderStatus, workOrderType } from "@/lib/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AlertItem, DashboardStats, Vehicle, VehicleStatus, WorkOrder } from "@/types";
import { toast } from "sonner";

const MONTHS = 6;

function monthKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-pop">
      <p className="text-xs text-muted-foreground capitalize">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular">{formatMoney(payload[0].value)}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    try {
      const [s, a, wo, v] = await Promise.all([
        api.get<DashboardStats>("/dashboard/stats"),
        api.get<AlertItem[]>("/alerts?unread_only=true&limit=10"),
        api.get<WorkOrder[]>("/maintenance/work-orders"),
        api.get<{ items: Vehicle[] }>("/vehicles?size=100"),
      ]);
      setStats(s);
      setAlerts(a);
      setWorkOrders(wo);
      setVehicles(v.items);
    } catch (err: any) {
      toast.error(err.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleRefreshAlerts() {
    setRefreshing(true);
    try {
      const res = await api.post<{ created: number }>("/dashboard/refresh-alerts", {});
      toast.success(res.created ? `${res.created} nouvelle(s) alerte(s)` : "Aucune nouvelle alerte");
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Erreur");
    } finally {
      setRefreshing(false);
    }
  }

  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  // Répartition réelle des statuts de la flotte
  const statusCounts = useMemo(() => {
    const counts: Record<VehicleStatus, number> = { available: 0, in_mission: 0, in_maintenance: 0, out_of_service: 0 };
    vehicles.forEach((v) => (counts[v.status] += 1));
    return counts;
  }, [vehicles]);
  const totalVehicles = vehicles.length || stats?.total_vehicles || 0;
  const availability = totalVehicles ? Math.round((statusCounts.available / totalVehicles) * 100) : 0;

  // Coûts de maintenance par mois (date de création de l'ordre)
  const monthlyCosts = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: MONTHS }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1);
      return { key: monthKey(d), label: d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""), full: d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }), value: 0 };
    });
    const index = new Map(buckets.map((b, i) => [b.key, i]));
    workOrders.forEach((wo) => {
      const i = index.get(monthKey(new Date(wo.created_at)));
      if (i !== undefined && wo.total_cost) buckets[i].value += Number(wo.total_cost);
    });
    return buckets;
  }, [workOrders]);
  const periodTotal = monthlyCosts.reduce((acc, m) => acc + m.value, 0);

  // Véhicules les plus coûteux en maintenance
  const topVehicles = useMemo(() => {
    const totals = new Map<number, number>();
    workOrders.forEach((wo) => {
      if (wo.total_cost) totals.set(wo.vehicle_id, (totals.get(wo.vehicle_id) ?? 0) + Number(wo.total_cost));
    });
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, total]) => ({ vehicle: vehicleById.get(id), id, total }));
  }, [workOrders, vehicleById]);
  const topMax = topVehicles[0]?.total ?? 0;

  const recentOrders = workOrders.slice(0, 6);
  const openOrders = workOrders.filter((wo) => wo.status !== "done" && wo.status !== "validated").length;

  return (
    <AppShell>
      <PageHeader
        title="Tableau de bord"
        description="Vue d'ensemble de l'activité de votre flotte."
        actions={
          <>
            <Button variant="outline" onClick={loadData}>
              <RefreshCw className="size-4" />
              Actualiser
            </Button>
            <Button onClick={handleRefreshAlerts} disabled={refreshing}>
              <Bell className="size-4" />
              {refreshing ? "Analyse…" : "Vérifier les échéances"}
            </Button>
          </>
        }
      />

      {/* Indicateurs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-xl" />)
        ) : (
          <>
            <StatCard
              label="Véhicules"
              value={totalVehicles}
              hint={`${statusCounts.available} disponible(s) · ${statusCounts.in_maintenance} en maintenance`}
              icon={Car}
              href="/vehicles"
            />
            <StatCard
              label="Ordres de travail ouverts"
              value={stats?.open_work_orders ?? openOrders}
              hint={`${workOrders.length} intervention(s) au total`}
              icon={Wrench}
              tone={(stats?.open_work_orders ?? openOrders) > 0 ? "warning" : undefined}
              href="/maintenance"
            />
            <StatCard
              label="Coût de maintenance du mois"
              value={formatMoney(stats?.cost_this_month ?? monthlyCosts[MONTHS - 1]?.value ?? 0, { compact: true })}
              hint={`${formatMoney(periodTotal, { compact: true })} sur ${MONTHS} mois`}
              icon={Wallet}
            />
            <StatCard
              label="Alertes critiques"
              value={stats?.critical_alerts ?? 0}
              hint={`${stats?.upcoming_document_expirations ?? 0} document(s) à renouveler sous 30 j`}
              icon={AlertTriangle}
              tone={(stats?.critical_alerts ?? 0) > 0 ? "danger" : "success"}
              href="/alerts"
            />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {/* Coûts mensuels */}
        <Panel
          className="xl:col-span-2"
          title="Coûts de maintenance"
          description={`${MONTHS} derniers mois · par date d'ouverture de l'intervention`}
          actions={<span className="text-sm font-semibold tabular">{formatMoney(periodTotal)}</span>}
        >
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : periodTotal === 0 ? (
            <EmptyState icon={Wallet} title="Aucun coût sur la période" description="Les coûts apparaîtront dès qu'une intervention sera chiffrée." className="h-64 py-0" />
          ) : (
            <div className="h-64" role="img" aria-label={`Coûts de maintenance par mois : ${monthlyCosts.map((m) => `${m.full} ${formatMoney(m.value)}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyCosts} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--chart-axis)" }} dy={6} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
                    tickFormatter={(v) => new Intl.NumberFormat("fr-FR", { notation: "compact" }).format(v)}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--accent)" }}
                    content={({ active, payload }) => (
                      <ChartTooltip
                        active={active}
                        payload={payload as unknown as { value: number }[]}
                        label={(payload?.[0]?.payload as { full?: string } | undefined)?.full}
                      />
                    )}
                  />
                  <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        {/* Disponibilité */}
        <Panel title="Disponibilité de la flotte" description="Statut actuel des véhicules">
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight tabular">{availability}%</span>
                <span className="text-sm text-muted-foreground">disponibles</span>
              </div>
              <div className="mt-5 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                {(Object.keys(vehicleStatus) as VehicleStatus[]).map((s) =>
                  statusCounts[s] > 0 ? (
                    <div
                      key={s}
                      className={cn(
                        "h-full",
                        { success: "bg-success", info: "bg-info", warning: "bg-warning", danger: "bg-danger", neutral: "bg-neutral" }[vehicleStatus[s].tone]
                      )}
                      style={{ width: `${(statusCounts[s] / totalVehicles) * 100}%` }}
                    />
                  ) : null
                )}
              </div>
              <ul className="mt-6 space-y-3">
                {(Object.keys(vehicleStatus) as VehicleStatus[]).map((s) => (
                  <li key={s} className="flex items-center justify-between text-sm">
                    <StatusBadge tone={vehicleStatus[s].tone}>{vehicleStatus[s].label}</StatusBadge>
                    <span className="font-medium tabular">
                      {statusCounts[s]}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {totalVehicles ? Math.round((statusCounts[s] / totalVehicles) * 100) : 0}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Conducteurs actifs</p>
                  <p className="mt-0.5 flex items-center gap-1.5 font-semibold tabular">
                    <Users className="size-3.5 text-muted-foreground" />
                    {stats?.active_drivers ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Âge moyen</p>
                  <p className="mt-0.5 font-semibold tabular">
                    {stats?.average_fleet_age_years != null ? `${stats.average_fleet_age_years.toFixed(1)} ans` : "—"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {/* Interventions récentes */}
        <Panel
          className="xl:col-span-2"
          title="Interventions récentes"
          flush
          actions={
            <Link href="/maintenance" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
              Tout voir <ArrowUpRight className="size-3.5" />
            </Link>
          }
        >
          {loading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <EmptyState icon={Wrench} title="Aucune intervention" description="Les ordres de travail apparaîtront ici." />
          ) : (
            <ul className="divide-y">
              {recentOrders.map((wo) => {
                const v = vehicleById.get(wo.vehicle_id);
                const st = workOrderStatus[wo.status];
                return (
                  <li key={wo.id}>
                    <Link href={`/maintenance/${wo.id}`} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-accent/60">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-surface-sunken text-muted-foreground">
                        <Wrench className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{wo.title}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {v ? <Plate value={v.registration} size="sm" /> : `Véhicule #${wo.vehicle_id}`}
                          <span>{workOrderType[wo.type]}</span>
                          <span aria-hidden>·</span>
                          <span>{formatDate(wo.created_at)}</span>
                        </p>
                      </div>
                      <span className="hidden text-sm font-medium tabular sm:block">{wo.total_cost ? formatMoney(wo.total_cost) : "—"}</span>
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          {/* Alertes */}
          <Panel
            title="Alertes prioritaires"
            flush
            actions={
              <Link href="/alerts" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                Tout voir <ArrowUpRight className="size-3.5" />
              </Link>
            }
          >
            {alerts.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Rien à signaler" description="Aucune alerte non lue." className="py-10" />
            ) : (
              <ul className="divide-y">
                {alerts.slice(0, 5).map((alert) => {
                  const sev = alertSeverity[alert.severity] ?? alertSeverity.info;
                  return (
                    <li key={alert.id} className="flex items-start gap-3 px-5 py-3">
                      <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border", toneSurface(sev.tone))}>
                        {alert.alert_type === "document_expiry" ? <FileClock className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">{alert.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{alert.message}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {/* Top véhicules */}
          <Panel title="Véhicules les plus coûteux" description="Total des interventions chiffrées">
            {topVehicles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune donnée de coût.</p>
            ) : (
              <ul className="space-y-3.5">
                {topVehicles.map(({ vehicle, id, total }) => (
                  <li key={id}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <Link href={`/vehicles/${id}`} className="flex min-w-0 items-center gap-2 hover:underline">
                        {vehicle ? <Plate value={vehicle.registration} size="sm" /> : null}
                        <span className="truncate text-muted-foreground">{vehicle ? `${vehicle.brand} ${vehicle.model}` : `Véhicule #${id}`}</span>
                      </Link>
                      <span className="shrink-0 font-medium tabular">{formatMoney(total, { compact: true })}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted">
                      <div className="h-full rounded-full bg-chart-1" style={{ width: `${(total / topMax) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
