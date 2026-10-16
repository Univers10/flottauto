"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BellOff, BellRing, Check, CheckCheck, Info, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PageHeader, Panel, StatusBadge, Toolbar, toneSurface, SegmentButton } from "@/components/app/primitives";
import { api, markAlertRead, markAllAlertsRead, refreshAlerts } from "@/lib/api";
import { alertSeverity } from "@/lib/labels";
import { formatDate, formatRelativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AlertItem } from "@/types";
import { toast } from "sonner";

const severityOrder = ["critical", "warning", "info"] as const;
type Severity = (typeof severityOrder)[number];

const severityIcon: Record<Severity, React.ElementType> = {
  critical: AlertTriangle,
  warning: BellRing,
  info: Info,
};

function normalizeSeverity(value: string): Severity {
  return (severityOrder as readonly string[]).includes(value) ? (value as Severity) : "info";
}

function Count({ value }: { value: number }) {
  return <span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground tabular">{value}</span>;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("unread");
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadAlerts() {
    setLoading(true);
    try {
      const res = await api.get<AlertItem[]>("/alerts");
      setAlerts(res);
    } catch (err: any) {
      toast.error(err.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAlerts();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const { created } = await refreshAlerts();
      await loadAlerts();
      toast.success(created > 0 ? `${created} nouvelle(s) alerte(s)` : "Aucune nouvelle alerte");
    } catch (err: any) {
      toast.error(err.message || "Erreur d'actualisation");
    } finally {
      setRefreshing(false);
    }
  }

  async function markRead(id: number) {
    try {
      await markAlertRead(id);
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)));
    } catch (err: any) {
      toast.error(err.message || "Erreur");
    }
  }

  async function markAllRead() {
    try {
      await markAllAlertsRead();
      setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
      toast.success("Toutes les alertes ont été marquées comme lues");
    } catch (err: any) {
      toast.error(err.message || "Erreur");
    }
  }

  const unreadCount = alerts.filter((a) => !a.is_read).length;
  const readScoped = filter === "unread" ? alerts.filter((a) => !a.is_read) : alerts;

  const severityCounts: Record<Severity | "all", number> = { all: readScoped.length, critical: 0, warning: 0, info: 0 };
  readScoped.forEach((a) => (severityCounts[normalizeSeverity(a.severity)] += 1));

  const filteredAlerts = severity === "all" ? readScoped : readScoped.filter((a) => normalizeSeverity(a.severity) === severity);

  const groups = severityOrder
    .map((sev) => ({ sev, items: filteredAlerts.filter((a) => normalizeSeverity(a.severity) === sev) }))
    .filter((g) => g.items.length > 0);

  return (
    <AppShell>
      <PageHeader
        title="Alertes"
        description={unreadCount > 0 ? `${unreadCount} alerte(s) non lue(s)` : "Vous êtes à jour"}
        actions={
          <>
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
              Actualiser
            </Button>
            {unreadCount > 0 && (
              <Button onClick={markAllRead}>
                <CheckCheck className="size-4" />
                Tout marquer comme lu
              </Button>
            )}
          </>
        }
      />

      <Panel flush>
        <Toolbar className="justify-between">
          <div className="flex gap-1">
            <SegmentButton active={filter === "unread"} onClick={() => setFilter("unread")}>
              Non lues
              <Count value={unreadCount} />
            </SegmentButton>
            <SegmentButton active={filter === "all"} onClick={() => setFilter("all")}>
              Toutes
              <Count value={alerts.length} />
            </SegmentButton>
          </div>
          <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
            <SegmentButton active={severity === "all"} onClick={() => setSeverity("all")}>
              Toutes gravités
              <Count value={severityCounts.all} />
            </SegmentButton>
            {severityOrder.map((sev) => (
              <SegmentButton key={sev} active={severity === sev} onClick={() => setSeverity(sev)}>
                {alertSeverity[sev].label}
                <Count value={severityCounts[sev]} />
              </SegmentButton>
            ))}
          </div>
        </Toolbar>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filteredAlerts.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title={filter === "unread" ? "Aucune alerte non lue" : "Aucune alerte"}
            description={
              severity !== "all"
                ? "Aucune alerte pour cette gravité."
                : filter === "unread"
                  ? "Toutes les alertes ont été traitées."
                  : "Les échéances et anomalies de la flotte apparaîtront ici."
            }
          />
        ) : (
          <div>
            {groups.map(({ sev, items }) => {
              const def = alertSeverity[sev];
              const Icon = severityIcon[sev];
              return (
                <section key={sev} aria-label={def.label}>
                  <h3 className="flex items-center gap-2 border-b bg-surface-sunken px-5 py-2 text-xs font-medium text-muted-foreground">
                    {def.label}
                    <span className="tabular">· {items.length}</span>
                  </h3>
                  <ul className="divide-y border-b last:border-b-0">
                    {items.map((alert) => (
                      <li
                        key={alert.id}
                        className={cn("flex items-start gap-4 px-5 py-4 transition-colors hover:bg-accent/50", alert.is_read && "opacity-60")}
                      >
                        <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border", toneSurface(def.tone))}>
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{alert.title}</p>
                            <StatusBadge tone={def.tone}>{def.label}</StatusBadge>
                            {!alert.is_read && <span className="size-1.5 rounded-full bg-primary" aria-label="Non lue" />}
                          </div>
                          {alert.message && <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>}
                          <p className="mt-1.5 text-xs text-muted-foreground tabular">
                            {alert.due_date ? (
                              <>
                                Échéance : <span className="text-foreground">{formatDate(alert.due_date)}</span> ({formatRelativeDays(alert.due_date)})
                                {" · "}
                              </>
                            ) : null}
                            Créée le {formatDate(alert.created_at)}
                          </p>
                        </div>
                        {!alert.is_read && (
                          <Button size="sm" variant="outline" onClick={() => markRead(alert.id)} className="shrink-0">
                            <Check className="size-4" />
                            Marquer lu
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </Panel>
    </AppShell>
  );
}
