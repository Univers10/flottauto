"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, BusFront, CheckCircle2, ChevronRight, Route, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, StatusBadge, toneSurface } from "@/components/app/primitives";
import { api, listAllVehicles, listConvoys, listDepartures } from "@/lib/api";
import type { Tone } from "@/lib/labels";
import { formatMoney } from "@/lib/format";
import { vehicleName } from "@/lib/vehicle";
import { cn } from "@/lib/utils";
import type { AlertItem, Convoy, Departure, Vehicle } from "@/types";

type Todo = { key: string; tone: Tone; icon: React.ElementType; title: string; detail: string; action: string; href: string; order: number };

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function time(value: string): string {
  return new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function blockedCount(dep: Departure): number {
  return dep.checklist?.groups.reduce((n, g) => n + g.items.filter((i) => i.status === "blocked").length, 0) ?? 0;
}

function buildTodos(departures: Departure[], convoys: Convoy[], alerts: AlertItem[], vehicles: Map<number, Vehicle>): Todo[] {
  const todos: Todo[] = [];
  for (const dep of departures) {
    const car = `Car ${vehicleName(vehicles.get(dep.vehicle_id))}`;
    const when = `${time(dep.scheduled_at)}${dep.route_label ? ` · ${dep.route_label}` : ""}`;
    if (dep.status === "planned") {
      const n = blockedCount(dep);
      todos.push({
        key: `dep-${dep.id}`,
        tone: n > 0 ? "danger" : "warning",
        icon: BusFront,
        title: n > 0 ? `${car} : ${n} point${n > 1 ? "s" : ""} à régler avant le départ` : `${car} : prêt, émettre le bon de sortie`,
        detail: when,
        action: n > 0 ? "Préparer le départ" : "Émettre le bon",
        href: `/departures/${dep.id}`,
        order: 0,
      });
    } else if (dep.status === "authorized") {
      todos.push({
        key: `dep-${dep.id}`,
        tone: "success",
        icon: BusFront,
        title: `${car} : autorisé à partir`,
        detail: `${when} · bon ${dep.exit_pass_number}`,
        action: "Voir le bon",
        href: `/departures/${dep.id}`,
        order: 2,
      });
    }
  }
  const soon = Date.now() + 7 * 86_400_000;
  for (const c of convoys) {
    const due = c.departure_at ? new Date(c.departure_at).getTime() : null;
    if (c.status === "confirmed" && c.account && c.account.balance > 0 && due !== null && due <= soon) {
      todos.push({
        key: `convoy-pay-${c.id}`,
        tone: "warning",
        icon: Wallet,
        title: `Convoi ${c.title} : solde à encaisser`,
        detail: `${formatMoney(c.account.balance)} avant l'embarquement · ${c.number}`,
        action: "Encaisser",
        href: `/convoys/${c.id}`,
        order: 1,
      });
    } else if (c.status === "draft") {
      todos.push({
        key: `convoy-draft-${c.id}`,
        tone: "info",
        icon: Route,
        title: `Convoi ${c.title} : devis à terminer`,
        detail: `${c.number} · contrat pas encore généré`,
        action: "Continuer",
        href: `/convoys/${c.id}`,
        order: 3,
      });
    }
  }
  const critical = alerts.filter((a) => a.severity === "critical");
  if (critical.length > 0) {
    todos.push({
      key: "alerts",
      tone: "danger",
      icon: BellRing,
      title: `${critical.length} alerte${critical.length > 1 ? "s" : ""} critique${critical.length > 1 ? "s" : ""} à lire`,
      detail: critical[0].title,
      action: "Voir les alertes",
      href: "/alerts",
      order: 1,
    });
  }
  return todos.sort((a, b) => a.order - b.order);
}

/** Accueil : la liste de ce qu'il faut faire maintenant, une action par ligne. */
export function TodoNow() {
  const [todos, setTodos] = useState<Todo[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listDepartures({ day: todayIso() }).catch(() => [] as Departure[]),
      listConvoys().catch(() => [] as Convoy[]),
      api.get<AlertItem[]>("/alerts?unread_only=true&limit=50").catch(() => [] as AlertItem[]),
      listAllVehicles().catch(() => [] as Vehicle[]),
    ]).then(([deps, convoys, alerts, vehicles]) => {
      if (!cancelled) setTodos(buildTodos(deps, convoys, alerts, new Map(vehicles.map((v) => [v.id, v]))));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Panel title="À faire maintenant" description="Départs du jour, convois et alertes qui attendent une action." flush>
      {todos === null ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : todos.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6">
          <span className={cn("flex size-10 items-center justify-center rounded-lg border", toneSurface("success"))}>
            <CheckCircle2 className="size-5" />
          </span>
          <div>
            <p className="font-medium">Rien d&apos;urgent</p>
            <p className="text-sm text-muted-foreground">Aucun départ à préparer aujourd&apos;hui, aucun convoi ni alerte en attente.</p>
          </div>
        </div>
      ) : (
        <ul className="divide-y">
          {todos.map((t) => (
            <li key={t.key}>
              <Link href={t.href} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-accent/60">
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg border", toneSurface(t.tone))}>
                  <t.icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.detail}</p>
                </div>
                <StatusBadge tone={t.tone} className="hidden sm:inline-flex">
                  {t.action}
                </StatusBadge>
                <ChevronRight className="size-4 shrink-0 text-subtle-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
