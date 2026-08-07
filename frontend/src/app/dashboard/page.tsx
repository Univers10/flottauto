"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Car,
  Users,
  Wrench,
  Bell,
  AlertTriangle,
  FileText,
  CalendarClock,
  Euro,
  Download,
  MoreHorizontal,
  RefreshCw,
  ArrowUpRight,
  Activity,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { DashboardStats, AlertItem, WorkOrder } from "@/types";
import { toast } from "sonner";

const statusLabels: Record<string, string> = {
  available: "Disponible",
  in_mission: "En mission",
  in_maintenance: "En maintenance",
  out_of_service: "Hors service",
};

function KpiCard({
  title,
  value,
  icon: Icon,
  trend,
  trendLabel,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: string;
  trendLabel?: string;
  color?: string;
}) {
  return (
    <Card className="relative overflow-hidden rounded-2xl border-none bg-card shadow-sm shadow-black/5 transition-all hover:shadow-md">
      <div className={cn("absolute right-4 top-4 rounded-xl p-2", color ?? "bg-primary/10")}>
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        {trend && (
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-600">
            {trend}
            <span className="text-muted-foreground">{trendLabel}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    try {
      const [s, a, wo] = await Promise.all([
        api.get<DashboardStats>("/dashboard/stats"),
        api.get<AlertItem[]>("/alerts?unread_only=true&limit=10"),
        api.get<WorkOrder[]>("/maintenance/work-orders"),
      ]);
      setStats(s);
      setAlerts(a);
      setWorkOrders(wo);
    } catch (err: any) {
      toast.error(err.message || "Erreur de chargement");
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleRefreshAlerts() {
    setRefreshing(true);
    try {
      const res = await api.post<{ created: number }>("/dashboard/refresh-alerts", {});
      toast.success(`${res.created} alerte(s) générée(s)`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Erreur");
    } finally {
      setRefreshing(false);
    }
  }

  const fleetTrend = [
    { name: "Lun", disponibles: 6, maintenance: 1, mission: 1 },
    { name: "Mar", disponibles: 5, maintenance: 2, mission: 1 },
    { name: "Mer", disponibles: 7, maintenance: 1, mission: 0 },
    { name: "Jeu", disponibles: 6, maintenance: 2, mission: 0 },
    { name: "Ven", disponibles: 8, maintenance: 0, mission: 0 },
    { name: "Sam", disponibles: 8, maintenance: 0, mission: 0 },
    { name: "Dim", disponibles: 7, maintenance: 1, mission: 0 },
  ];

  const costByType = workOrders.length
    ? [
        {
          name: "Préventif",
          value: workOrders
            .filter((wo) => wo.type === "preventive" && wo.total_cost)
            .reduce((acc, wo) => acc + Number(wo.total_cost), 0),
        },
        {
          name: "Curatif",
          value: workOrders
            .filter((wo) => wo.type === "curative" && wo.total_cost)
            .reduce((acc, wo) => acc + Number(wo.total_cost), 0),
        },
      ]
    : [
        { name: "Préventif", value: 0 },
        { name: "Curatif", value: 0 },
      ];

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tableau de bord</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Vue d&apos;ensemble de votre flotte — {new Date().toLocaleDateString("fr-FR", { dateStyle: "long" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              className="h-9 gap-2 rounded-xl border-border/60 bg-card px-4"
            >
              <RefreshCw className="h-4 w-4" />
              Rafraîchir
            </Button>
            <Button
              size="sm"
              onClick={handleRefreshAlerts}
              disabled={refreshing}
              className="h-9 gap-2 rounded-xl px-4"
            >
              <Bell className="h-4 w-4" />
              {refreshing ? "Génération..." : "Générer alertes"}
            </Button>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Véhicules"
            value={stats?.total_vehicles ?? "—"}
            icon={Car}
            trend="+2"
            trendLabel="ce mois-ci"
            color="bg-blue-100 text-blue-600"
          />
          <KpiCard
            title="Conducteurs actifs"
            value={stats?.active_drivers ?? "—"}
            icon={Users}
            trend="+1"
            trendLabel="nouveau"
            color="bg-emerald-100 text-emerald-600"
          />
          <KpiCard
            title="Ordres en cours"
            value={stats?.open_work_orders ?? "—"}
            icon={Wrench}
            trend=" stable"
            trendLabel=" vs semaine dernière"
            color="bg-amber-100 text-amber-600"
          />
          <KpiCard
            title="Alertes critiques"
            value={stats?.critical_alerts ?? "—"}
            icon={AlertTriangle}
            trendLabel="nécessitent attention"
            color="bg-rose-100 text-rose-600"
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2 rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Activité de la flotte</CardTitle>
                <p className="text-xs text-muted-foreground">Évolution des véhicules disponibles, en mission et en maintenance</p>
              </div>
              <Button variant="ghost" size="icon" className="rounded-xl">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={fleetTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorDispo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorMaint" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12 }} />
                    <Legend iconType="circle" />
                    <Area
                      type="monotone"
                      dataKey="disponibles"
                      name="Disponibles"
                      stroke="#2563eb"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorDispo)"
                    />
                    <Area
                      type="monotone"
                      dataKey="maintenance"
                      name="En maintenance"
                      stroke="#f59e0b"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorMaint)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Répartition</CardTitle>
                <p className="text-xs text-muted-foreground">Statut des véhicules</p>
              </div>
              <Button variant="ghost" size="icon" className="rounded-xl">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                {stats ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Disponibles", value: stats.available_vehicles },
                          { name: "En mission", value: Math.max(0, stats.total_vehicles - stats.available_vehicles - stats.in_maintenance_vehicles) },
                          { name: "En maintenance", value: stats.in_maintenance_vehicles },
                        ].filter((d) => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        dataKey="value"
                        paddingAngle={3}
                      >
                        {["#2563eb", "#0ea5e9", "#f59e0b"].map((color, i) => (
                          <Cell key={i} fill={color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Chargement...</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Coûts par type</CardTitle>
                <p className="text-xs text-muted-foreground">Maintenance validée</p>
              </div>
              <Button variant="ghost" size="icon" className="rounded-xl">
                <Download className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costByType} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v} FCFA`} />
                    <Tooltip formatter={(v) => [`${Number(v).toLocaleString("fr-FR")} FCFA`, "Coût"]} contentStyle={{ borderRadius: 12 }} />
                    <Bar dataKey="value" fill="#2563eb" radius={[8, 8, 0, 0]} barSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Alertes prioritaires</CardTitle>
                <p className="text-xs text-muted-foreground">Documents, permis et maintenances à surveiller</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => router.push("/alerts")} className="gap-1 rounded-xl text-primary">
                Voir tout <ArrowUpRight className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                  <Activity className="mb-2 h-8 w-8 opacity-40" />
                  Aucune alerte prioritaire
                </div>
              ) : (
                <ul className="space-y-3">
                  {alerts.slice(0, 6).map((alert) => (
                    <li
                      key={alert.id}
                      className="flex items-start justify-between gap-4 rounded-xl border border-border/60 p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{alert.title}</p>
                        <p className="truncate text-sm text-muted-foreground">{alert.message}</p>
                      </div>
                      <Badge
                        variant={alert.severity === "critical" ? "destructive" : "secondary"}
                        className="shrink-0 rounded-lg"
                      >
                        {alert.severity}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
