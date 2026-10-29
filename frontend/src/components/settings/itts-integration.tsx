"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Panel, Plate, StatusBadge } from "@/components/app/primitives";
import { getIttsStatus, listVehicles, mapIttsBus } from "@/lib/api";
import type { Tone } from "@/lib/labels";
import type { IttsBridgeStatus, IttsEventLog, IttsPendingMapping, Vehicle } from "@/types";

const eventLabels: Record<IttsEventLog["type"], string> = {
  "departure.upserted": "Départ programmé / modifié",
  "departure.cancelled": "Départ annulé",
  "departure.departed": "Car parti",
};

/** Toute la flotte (l'API limite les pages à 100 cars). */
async function listAllVehicles(): Promise<Vehicle[]> {
  const all: Vehicle[] = [];
  for (let page = 1; ; page++) {
    const res = await listVehicles({ page, size: 100 });
    all.push(...res.items);
    if (res.items.length === 0 || all.length >= res.total) return all;
  }
}

const statusMeta: Record<IttsEventLog["status"], { label: string; tone: Tone }> = {
  received: { label: "Reçu", tone: "info" },
  processed: { label: "Traité", tone: "success" },
  pending_mapping: { label: "Car à associer", tone: "warning" },
  error: { label: "Erreur", tone: "danger" },
};

function formatDateTime(value: string): string {
  // Dates naïves du serveur = UTC.
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return date.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Paramètres → Intégration ITTS : état du pont, journal des événements, cars ITTS à associer. */
export function IttsIntegration() {
  const [status, setStatus] = useState<IttsBridgeStatus | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [s, vehicles] = await Promise.all([getIttsStatus(), listAllVehicles()]);
    return [s, { items: vehicles }] as const;
  }, []);

  // Rechargement silencieux après une association ou sur « Actualiser ».
  const load = useCallback(async () => {
    try {
      const [s, v] = await fetchAll();
      setStatus(s);
      setVehicles(v.items);
    } catch (err) {
      toast.error((err as Error).message || "Erreur de chargement de l'intégration");
    }
  }, [fetchAll]);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then(([s, v]) => {
        if (cancelled) return;
        setStatus(s);
        setVehicles(v.items);
      })
      .catch((err: Error) => toast.error(err.message || "Erreur de chargement de l'intégration"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!status) return null;

  return (
    <div className="space-y-4">
      <Panel
        title="Pont ITTS Gestion"
        description={
          status.enabled
            ? status.last_event_at
              ? `Dernier événement reçu le ${formatDateTime(status.last_event_at)}`
              : "Activé — aucun événement reçu pour l'instant"
            : "Le serveur n'est pas configuré pour recevoir les départs d'ITTS Gestion."
        }
        actions={
          <>
            <StatusBadge tone={status.enabled ? "success" : "neutral"}>{status.enabled ? "Activé" : "Désactivé"}</StatusBadge>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="size-4" />
              Actualiser
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          Les départs programmés dans ITTS Gestion arrivent ici automatiquement. Avant de passer un départ à « parti », ITTS
          Gestion demande à FlottAuto si le bon de sortie est valide.
        </p>
      </Panel>

      {status.pending_mappings.length > 0 && (
        <Panel
          flush
          title="Cars ITTS à associer"
          description="Ces cars d'ITTS Gestion n'ont pas d'équivalent connu dans FlottAuto. Leurs départs sont en attente et seront traités dès l'association."
        >
          <ul className="divide-y">
            {status.pending_mappings.map((m) => (
              <PendingMappingRow key={m.itts_bus_id} mapping={m} vehicles={vehicles} onMapped={load} />
            ))}
          </ul>
        </Panel>
      )}

      <Panel flush title="Derniers événements" description="Les 30 derniers événements reçus d'ITTS Gestion.">
        {status.events.length === 0 ? (
          <EmptyState icon={Unplug} title="Aucun événement" description="Les départs envoyés par ITTS Gestion apparaîtront ici." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reçu</TableHead>
                  <TableHead>Événement</TableHead>
                  <TableHead>Car</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{formatDateTime(e.received_at)}</TableCell>
                    <TableCell className="min-w-36">{eventLabels[e.type] ?? e.type}</TableCell>
                    <TableCell>{e.bus_plate ? <Plate value={e.bus_plate} size="sm" /> : "—"}</TableCell>
                    <TableCell>
                      <StatusBadge tone={statusMeta[e.status]?.tone ?? "neutral"}>{statusMeta[e.status]?.label ?? e.status}</StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function PendingMappingRow({
  mapping,
  vehicles,
  onMapped,
}: {
  mapping: IttsPendingMapping;
  vehicles: Vehicle[];
  onMapped: () => void;
}) {
  const [vehicleId, setVehicleId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const items = vehicles.map((v) => ({ value: String(v.id), label: v.registration }));

  async function handleMap() {
    if (!vehicleId) return;
    setSubmitting(true);
    try {
      const { replayed } = await mapIttsBus(mapping.itts_bus_id, Number(vehicleId));
      toast.success(replayed > 0 ? `Car associé — ${replayed} départ(s) traité(s)` : "Car associé");
      onMapped();
    } catch (err) {
      toast.error((err as Error).message || "Association impossible");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 px-5 py-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {mapping.plate ? <Plate value={mapping.plate} size="sm" /> : <span className="text-sm font-medium">Car ITTS</span>}
          <span className="text-xs text-muted-foreground">{mapping.events} événement(s) en attente</span>
        </div>
        <p className="mt-1 truncate font-mono text-xs text-subtle-foreground">{mapping.itts_bus_id}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select items={items} value={vehicleId || null} onValueChange={(v) => v && setVehicleId(String(v))}>
          <SelectTrigger className="w-full sm:w-64" aria-label="Car FlottAuto correspondant">
            <SelectValue placeholder="Associer à…" />
          </SelectTrigger>
          <SelectContent>
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={String(v.id)}>
                {v.registration} · {v.brand} {v.model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleMap} disabled={!vehicleId || submitting}>
          <Link2 className="size-4" />
          Associer
        </Button>
      </div>
    </li>
  );
}
