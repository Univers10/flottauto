"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, Check, LogOut, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { removeToken, listAlerts, markAlertRead, refreshAlerts } from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import type { AlertItem } from "@/types";
import { toast } from "sonner";

const severityConfig: Record<string, { icon: React.ElementType; color: string }> = {
  critical: { icon: AlertTriangle, color: "bg-rose-50 text-rose-700" },
  warning: { icon: Bell, color: "bg-amber-50 text-amber-700" },
  info: { icon: Check, color: "bg-blue-50 text-blue-700" },
};

export function Topbar({ user }: { user?: { first_name?: string | null; last_name?: string | null; email: string } }) {
  const router = useRouter();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  async function loadAlerts() {
    try {
      await refreshAlerts();
      const res = await listAlerts(true);
      setAlerts(res);
    } catch {
      // silent: notifications are non-critical
    }
  }

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 60000);
    return () => clearInterval(interval);
  }, []);

  async function handleMarkRead(id: number) {
    try {
      await markAlertRead(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      toast.error(err.message || "Erreur");
    }
  }

  function handleLogout() {
    removeToken();
    router.push("/");
    router.refresh();
  }

  const initials = user
    ? `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase() || user.email[0].toUpperCase()
    : "?";
  const fullName = user
    ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.email
    : "Invité";

  return (
    <header className="flex h-20 items-center justify-between gap-4 border-b border-border/60 bg-card/80 px-4 backdrop-blur-xl lg:px-8">
      <div className="hidden items-center gap-3 md:flex">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher..."
            className="h-10 w-64 rounded-xl border-border/60 bg-muted/50 pl-9 text-sm focus-visible:bg-background"
          />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-end gap-3 md:flex-none">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="relative h-10 w-10 rounded-xl border-border/60 bg-muted/50 hover:bg-background"
              >
                <Bell className="h-5 w-5 text-muted-foreground" />
                {alerts.length > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white ring-2 ring-card">
                    {alerts.length > 9 ? "9+" : alerts.length}
                  </span>
                )}
                <span className="sr-only">Notifications</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-80 rounded-xl p-2">
            <div className="flex items-center justify-between px-1.5 py-1">
              <span className="text-sm font-semibold">Notifications</span>
              {alerts.length > 0 && (
                <span className="text-xs text-muted-foreground">{alerts.length} non lue(s)</span>
              )}
            </div>
            <DropdownMenuSeparator />
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
                <Check className="h-6 w-6 opacity-40" />
                Aucune notification non lue.
              </div>
            ) : (
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {alerts.slice(0, 8).map((alert) => {
                  const cfg = severityConfig[alert.severity] ?? severityConfig.info;
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={alert.id}
                      className="flex items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-accent"
                    >
                      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", cfg.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 space-y-0.5">
                        <p className="text-sm font-medium leading-tight">{alert.title}</p>
                        {alert.message && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{alert.message}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleMarkRead(alert.id)}
                        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="Marquer comme lu"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/alerts")} className="justify-center text-sm font-medium">
              Voir toutes les notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger>
            <div className="flex h-10 cursor-pointer items-center gap-2 rounded-xl px-2 transition-colors hover:bg-muted/50">
              <Avatar className="h-8 w-8 border border-border/60">
                <AvatarFallback className="bg-gradient-to-br from-primary to-blue-600 text-xs font-semibold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium lg:inline">{fullName}</span>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl">
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              Paramètres
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
