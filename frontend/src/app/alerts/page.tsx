"use client";

import { useEffect, useState } from "react";
import { Check, Bell, AlertTriangle, RefreshCw, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, markAlertRead, markAllAlertsRead, refreshAlerts } from "@/lib/api";
import type { AlertItem } from "@/types";
import { toast } from "sonner";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("unread");
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
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, is_read: true } : a))
      );
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

  const severityConfig: Record<string, { icon: React.ElementType; color: string }> = {
    critical: { icon: AlertTriangle, color: "bg-rose-50 text-rose-700" },
    warning: { icon: Bell, color: "bg-amber-50 text-amber-700" },
    info: { icon: Check, color: "bg-blue-50 text-blue-700" },
  };

  const filteredAlerts = filter === "unread" ? alerts.filter((a) => !a.is_read) : alerts;
  const unreadCount = alerts.filter((a) => !a.is_read).length;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Centre de notifications</h1>
            <p className="mt-1 text-sm text-muted-foreground">{unreadCount} alerte(s) non lue(s)</p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-10 gap-2 rounded-xl border-border/60"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              Actualiser
            </Button>
            {unreadCount > 0 && (
              <Button onClick={markAllRead} className="h-10 gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 px-4 shadow-lg shadow-primary/25">
                <CheckCheck className="h-4 w-4" />
                Tout marquer lu
              </Button>
            )}
          </div>
        </div>

        <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg font-semibold">Alertes</CardTitle>
            <div className="flex gap-1 rounded-xl bg-muted/60 p-1">
              <button
                onClick={() => setFilter("unread")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  filter === "unread" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Non lues
              </button>
              <button
                onClick={() => setFilter("all")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  filter === "all" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Toutes
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Chargement...</div>
            ) : filteredAlerts.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                {filter === "unread" ? "Aucune alerte non lue." : "Aucune alerte."}
              </div>
            ) : (
              <ul className="space-y-3">
                {filteredAlerts.map((alert) => {
                  const cfg = severityConfig[alert.severity] ?? severityConfig.info;
                  const Icon = cfg.icon;
                  return (
                    <li
                      key={alert.id}
                      className={cn(
                        "flex items-start justify-between gap-4 rounded-2xl border border-border/60 p-4 transition-all hover:bg-muted/40",
                        alert.is_read && "opacity-60"
                      )}
                    >
                      <div className="flex gap-3">
                        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", cfg.color)}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold">{alert.title}</p>
                          <p className="text-sm text-muted-foreground">{alert.message}</p>
                          {alert.due_date && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Échéance : {new Date(alert.due_date).toLocaleDateString("fr-FR")}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!alert.is_read && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => markRead(alert.id)}
                            className="rounded-lg border-border/60"
                          >
                            <Check className="mr-1.5 h-4 w-4" />
                            Lu
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
