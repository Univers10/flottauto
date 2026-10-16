"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, Check, Info, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listAlerts, markAlertRead, refreshAlerts, removeToken } from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileSidebar } from "./sidebar";
import { alertSeverity } from "@/lib/labels";
import { toneSurface } from "@/components/app/primitives";
import { fullName, initials } from "@/lib/format";
import { roleLabels } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { AlertItem, User } from "@/types";
import { toast } from "sonner";

const severityIcon: Record<string, React.ElementType> = {
  critical: AlertTriangle,
  warning: Bell,
  info: Info,
};

export function Topbar({ user }: { user: User }) {
  const router = useRouter();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  async function loadAlerts() {
    try {
      // La régénération des alertes passe par le dashboard, inaccessible aux maintenanciers.
      if (user.role !== "mechanic") await refreshAlerts();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 lg:px-8">
      <MobileSidebar user={user} />
      <p className="hidden text-[13px] text-muted-foreground capitalize sm:block">{today}</p>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
                <Bell className="size-[18px]" />
                {alerts.length > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white ring-2 ring-background tabular">
                    {alerts.length > 9 ? "9+" : alerts.length}
                  </span>
                )}
                <span className="sr-only">Notifications</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-[22rem] p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">Notifications</span>
              {alerts.length > 0 && <span className="text-xs text-muted-foreground tabular">{alerts.length} non lue(s)</span>}
            </div>
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
                <span className="flex size-9 items-center justify-center rounded-full border bg-surface-sunken">
                  <Check className="size-4" />
                </span>
                Tout est à jour.
              </div>
            ) : (
              <div className="scrollbar-thin max-h-96 divide-y overflow-y-auto">
                {alerts.slice(0, 8).map((alert) => {
                  const sev = alertSeverity[alert.severity] ?? alertSeverity.info;
                  const Icon = severityIcon[alert.severity] ?? Info;
                  return (
                    <div key={alert.id} className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
                      <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border", toneSurface(sev.tone))}>
                        <Icon className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-snug font-medium">{alert.title}</p>
                        {alert.message && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{alert.message}</p>}
                      </div>
                      <button
                        onClick={() => handleMarkRead(alert.id)}
                        className="shrink-0 rounded-md p-1 text-subtle-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                        title="Marquer comme lu"
                        aria-label="Marquer comme lu"
                      >
                        <Check className="size-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="border-t p-1">
              <DropdownMenuItem onClick={() => router.push("/alerts")} className="justify-center text-[13px] font-medium">
                Voir toutes les alertes
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="mx-1.5 h-5 w-px bg-border" aria-hidden />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex h-9 items-center gap-2.5 rounded-lg pr-2 pl-1 transition-colors hover:bg-accent aria-expanded:bg-accent"
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {initials(user.first_name, user.last_name, user.email)}
                </span>
                <span className="hidden text-left leading-tight md:block">
                  <span className="block text-[13px] font-medium">{fullName(user)}</span>
                </span>
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-60">
            <div className="px-2 py-2">
              <p className="truncate text-sm font-medium">{fullName(user)}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              <p className="mt-1.5 inline-flex rounded-md border bg-surface-sunken px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                {roleLabels[user.role]}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings className="size-4" />
              Paramètres
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout} variant="destructive">
              <LogOut className="size-4" />
              Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
