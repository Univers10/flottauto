"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { CircleDot, Copy, KeyRound, MapPinned, Navigation, Plus, PowerOff, Radio, Route, Satellite, Trash2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { AppShell, useCurrentUser } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Field, PageHeader, Panel, SegmentButton, StatCard, StatusBadge, Toolbar } from "@/components/app/primitives";
import { DateInput } from "@/components/ui/date-input";
import { api, apiBaseUrl, listVehicles } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { canManageUsers, rolesOf } from "@/lib/roles";
import type { Tone } from "@/lib/labels";
import type { Vehicle } from "@/types";

const GpsMap = dynamic(() => import("@/components/app/gps-map"), { ssr: false, loading: () => <Skeleton className="h-full w-full" /> });

type State = "moving" | "idle" | "stopped" | "offline" | "no_data";
type Pos = { at: string; lat: number; lng: number; speed_kmh: number | null; heading: number | null; ignition: boolean | null; fuel_level_pct: number | null };
type LiveCar = { vehicle_id: number; registration: string | null; fleet_number: string | null; mileage: number | null; state: State; position: Pos | null };
type Trip = { start: string; end: string; km: number; minutes: number; max_speed_kmh: number };
type Stop = { from: string; to: string | null; lat: number; lng: number; minutes: number };
type Track = { points: [number, number, string, number | null][]; km: number; trips: Trip[]; stops: Stop[]; max_speed_kmh: number; truncated: boolean };
type Device = { id: number; vehicle_id: number; vehicle: { registration: string; fleet_number: string | null } | null; imei: string | null; model: string | null; active: boolean; last_seen_at: string | null; online: boolean };

const STATES: Record<State, { label: string; tone: Tone; color: string }> = {
  moving: { label: "En route", tone: "success", color: "#16a34a" },
  idle: { label: "Moteur allumé, à l'arrêt", tone: "warning", color: "#f59e0b" },
  stopped: { label: "Moteur coupé", tone: "info", color: "#2563eb" },
  offline: { label: "Hors ligne", tone: "neutral", color: "#9ca3af" },
  no_data: { label: "Aucune position", tone: "neutral", color: "#9ca3af" },
};

/** Heures du serveur en UTC (heure d'Abidjan) sans fuseau. */
const utc = (s: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);
const hm = (s: string) => utc(s).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const ago = (s: string) => {
  const min = Math.round((Date.now() - utc(s).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 48 * 60) return `il y a ${Math.round(min / 60)} h`;
  return `il y a ${Math.round(min / 1440)} j`;
};
const duration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}` : `${min} min`);
const carName = (c: { fleet_number: string | null; registration: string | null }) => (c.fleet_number ? `Car ${c.fleet_number}` : c.registration ?? "Car");
const today = () => new Date().toISOString().slice(0, 10);

type Tab = "live" | "devices";

export default function TrackingPage() {
  return (
    <AppShell>
      <TrackingContent />
    </AppShell>
  );
}

// Rendu sous AppShell pour accéder à l'utilisateur connecté.
function TrackingContent() {
  const user = useCurrentUser();
  const isAdmin = user ? canManageUsers(rolesOf(user)) : false;
  const [tab, setTab] = useState<Tab>("live");
  const [cars, setCars] = useState<LiveCar[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [day, setDay] = useState(today());
  const [track, setTrack] = useState<Track | null>(null);

  const loadLive = useCallback(async () => {
    try {
      setCars(await api.get<LiveCar[]>("/gps/live"));
    } catch (err) {
      toast.error((err as Error).message || "Positions indisponibles");
      setCars([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLive();
    const t = setInterval(loadLive, 30_000);
    return () => clearInterval(t);
  }, [loadLive]);

  useEffect(() => {
    if (selected === null) return;
    let alive = true;
    api
      .get<Track>(`/gps/vehicles/${selected}/track?day=${day}`)
      .then((t) => alive && setTrack(t))
      .catch((err) => toast.error((err as Error).message || "Trajet indisponible"));
    return () => {
      alive = false;
    };
  }, [selected, day]);

  const located = (cars ?? []).filter((c) => c.position);
  const count = (s: State) => (cars ?? []).filter((c) => c.state === s).length;
  const car = cars?.find((c) => c.vehicle_id === selected) ?? null;

  const markers = useMemo(
    () =>
      selected !== null && track
        ? []
        : located.map((c) => ({
            id: c.vehicle_id,
            lat: c.position!.lat,
            lng: c.position!.lng,
            label: carName(c),
            color: STATES[c.state].color,
            onClick: () => setSelected(c.vehicle_id),
          })),
    [located, selected, track]
  );
  const line = useMemo<[number, number][]>(() => (selected !== null && track ? track.points.map((p) => [p[0], p[1]]) : []), [selected, track]);
  const stops = useMemo(
    () => (selected !== null && track ? track.stops.map((s) => ({ lat: s.lat, lng: s.lng, label: `Arrêt moteur ${hm(s.from)} · ${duration(s.minutes)}` })) : []),
    [selected, track]
  );
  const end = selected !== null && track && track.points.length > 0 ? track.points[track.points.length - 1] : null;
  const endMarker = end && car ? [{ id: "end", lat: end[0], lng: end[1], label: `${carName(car)} · ${hm(end[2])}`, color: STATES[car.state].color }] : [];

  return (
    <>
      <PageHeader
        title="Suivi GPS"
        description="Position des cars, trajets et arrêts moteur. Le kilométrage des cars équipés se met à jour tout seul."
        breadcrumb={selected !== null && car ? [{ label: "Suivi GPS" }, { label: carName(car) }] : undefined}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="En route" value={String(count("moving"))} icon={Navigation} tone={count("moving") ? "success" : undefined} />
        <StatCard label="Moteur allumé à l'arrêt" value={String(count("idle"))} icon={CircleDot} tone={count("idle") ? "warning" : undefined} />
        <StatCard label="Moteur coupé" value={String(count("stopped"))} icon={PowerOff} />
        <StatCard label="Hors ligne" value={String(count("offline") + count("no_data"))} icon={WifiOff} />
      </div>

      <Panel flush>
        <Toolbar className="justify-between">
          <div className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1">
            <SegmentButton active={tab === "live"} onClick={() => setTab("live")} count={cars?.length}>
              Carte
            </SegmentButton>
            {isAdmin && (
              <SegmentButton active={tab === "devices"} onClick={() => setTab("devices")}>
                Boîtiers
              </SegmentButton>
            )}
          </div>
          {tab === "live" && selected !== null && (
            <div className="flex items-center gap-2">
              <DateInput value={day} onValueChange={setDay} max={today()} className="h-8 w-40" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelected(null);
                  setTrack(null);
                }}
              >
                Tous les cars
              </Button>
            </div>
          )}
        </Toolbar>

        {tab === "devices" ? (
          <Devices />
        ) : cars === null ? (
          <div className="p-5">
            <Skeleton className="h-[420px] w-full" />
          </div>
        ) : cars.length === 0 ? (
          <EmptyState
            icon={Satellite}
            title="Aucun car équipé"
            description={isAdmin ? "Déclare un boîtier dans l'onglet « Boîtiers » : il envoie ensuite ses positions tout seul." : "Aucun boîtier GPS n'est encore posé."}
          />
        ) : (
          <div className="grid lg:grid-cols-[1fr_340px]">
            <div className="h-[460px] border-b lg:h-[560px] lg:border-r lg:border-b-0">
              <GpsMap markers={[...markers, ...endMarker]} line={line} stops={stops} />
            </div>
            <div className="max-h-[560px] overflow-y-auto">
              {selected !== null && car ? (
                <CarDay car={car} track={track} />
              ) : (
                <ul className="divide-y">
                  {cars.map((c) => (
                    <li key={c.vehicle_id}>
                      <button
                        type="button"
                        onClick={() => setSelected(c.vehicle_id)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
                      >
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: STATES[c.state].color }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{carName(c)}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {STATES[c.state].label}
                            {c.position ? ` · ${ago(c.position.at)}` : ""}
                          </span>
                        </span>
                        {c.position?.speed_kmh ? <span className="text-sm font-semibold tabular-nums">{Math.round(c.position.speed_kmh)} km/h</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Panel>
    </>
  );
}

function CarDay({ car, track }: { car: LiveCar; track: Track | null }) {
  const p = car.position;
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{carName(car)}</p>
          <p className="text-xs text-muted-foreground">{car.registration}</p>
        </div>
        <StatusBadge tone={STATES[car.state].tone}>{STATES[car.state].label}</StatusBadge>
      </div>
      {p && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <dt className="text-muted-foreground">Dernière position</dt>
          <dd className="text-right">{ago(p.at)}</dd>
          <dt className="text-muted-foreground">Vitesse</dt>
          <dd className="text-right tabular-nums">{p.speed_kmh != null ? `${Math.round(p.speed_kmh)} km/h` : "—"}</dd>
          <dt className="text-muted-foreground">Compteur</dt>
          <dd className="text-right tabular-nums">{formatNumber(car.mileage, "km")}</dd>
          {p.fuel_level_pct != null && (
            <>
              <dt className="text-muted-foreground">Carburant</dt>
              <dd className="text-right tabular-nums">{Math.round(p.fuel_level_pct)} %</dd>
            </>
          )}
        </dl>
      )}
      {track === null ? (
        <Skeleton className="h-32 w-full" />
      ) : track.points.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">Aucune position ce jour-là.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-muted/50 p-2">
              <p className="text-base font-semibold tabular-nums">{formatNumber(track.km)}</p>
              <p className="text-[11px] text-muted-foreground">km</p>
            </div>
            <div className="rounded-md bg-muted/50 p-2">
              <p className="text-base font-semibold tabular-nums">{track.trips.length}</p>
              <p className="text-[11px] text-muted-foreground">trajets</p>
            </div>
            <div className="rounded-md bg-muted/50 p-2">
              <p className="text-base font-semibold tabular-nums">{Math.round(track.max_speed_kmh)}</p>
              <p className="text-[11px] text-muted-foreground">km/h max</p>
            </div>
          </div>
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Route className="size-3.5" /> Trajets
            </h3>
            <ul className="divide-y rounded-md border text-xs">
              {track.trips.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="tabular-nums">
                    {hm(t.start)} → {hm(t.end)}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatNumber(t.km)} km · {duration(t.minutes)} · max {Math.round(t.max_speed_kmh)} km/h
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <PowerOff className="size-3.5" /> Arrêts moteur (5 min et plus)
            </h3>
            {track.stops.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun.</p>
            ) : (
              <ul className="divide-y rounded-md border text-xs">
                {track.stops.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="tabular-nums">
                      {hm(s.from)} → {s.to ? hm(s.to) : "…"}
                    </span>
                    <a
                      className="text-primary hover:underline"
                      href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=16/${s.lat}/${s.lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {duration(s.minutes)} · voir
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {track.truncated && <p className="text-[11px] text-muted-foreground">Journée très chargée : seules les premières positions sont affichées.</p>}
        </>
      )}
    </div>
  );
}

/** Boîtiers : un par car. La clé n'est montrée qu'une fois (à la création ou au renouvellement). */
function Devices() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [relay, setRelay] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ vehicle_id: "", imei: "", model: "" });
  const [shown, setShown] = useState<{ title: string; key: string; relay?: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, v] = await Promise.all([api.get<{ devices: Device[]; relay_configured: boolean }>("/gps/devices"), listVehicles({ size: 100 })]);
      setDevices(d.devices);
      setRelay(d.relay_configured);
      setVehicles(v.items);
    } catch (err) {
      toast.error((err as Error).message || "Erreur de chargement");
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const equipped = new Set((devices ?? []).map((d) => d.vehicle_id));
  const free = vehicles.filter((v) => !equipped.has(v.id));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vehicle_id) return;
    try {
      const r = await api.post<Device & { key: string }>("/gps/devices", {
        vehicle_id: Number(form.vehicle_id),
        imei: form.imei.trim() || null,
        model: form.model.trim() || null,
      });
      setOpen(false);
      setForm({ vehicle_id: "", imei: "", model: "" });
      setShown({ title: `Boîtier du ${r.vehicle?.fleet_number ? `car ${r.vehicle.fleet_number}` : r.vehicle?.registration}`, key: r.key });
      await load();
    } catch (err) {
      toast.error((err as Error).message || "Enregistrement impossible");
    }
  }

  async function rotate(d: Device) {
    if (!confirm("Nouvelle clé : l'ancienne ne marchera plus. Continuer ?")) return;
    const r = await api.post<{ key: string }>(`/gps/devices/${d.id}/key`, {});
    setShown({ title: "Nouvelle clé du boîtier", key: r.key });
  }

  async function toggle(d: Device) {
    await api.patch(`/gps/devices/${d.id}`, { active: !d.active });
    await load();
  }

  async function remove(d: Device) {
    if (!confirm("Supprimer ce boîtier et toutes ses positions ?")) return;
    await api.delete(`/gps/devices/${d.id}`);
    await load();
  }

  async function relayKey() {
    if (relay && !confirm("Nouvelle clé du relais : l'ancienne ne marchera plus. Continuer ?")) return;
    const r = await api.post<{ key: string }>("/gps/relay-key", {});
    setRelay(true);
    setShown({ title: "Clé du serveur Traccar", key: r.key, relay: true });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <p className="text-xs text-muted-foreground">Un boîtier par car. Avec un serveur Traccar, renseigne l&apos;IMEI du boîtier.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={relayKey}>
            <Radio className="size-4" />
            {relay ? "Nouvelle clé Traccar" : "Clé du serveur Traccar"}
          </Button>
          <Button size="sm" onClick={() => setOpen(true)} disabled={free.length === 0}>
            <Plus className="size-4" />
            Ajouter un boîtier
          </Button>
        </div>
      </div>
      {devices === null ? (
        <div className="p-5">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : devices.length === 0 ? (
        <EmptyState icon={MapPinned} title="Aucun boîtier" description="Ajoute un boîtier pour un car. Pour essayer sans boîtier, un téléphone avec l'app « Traccar Client » suffit." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Car</TableHead>
              <TableHead>Boîtier</TableHead>
              <TableHead>Dernière position</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.vehicle ? (d.vehicle.fleet_number ? `Car ${d.vehicle.fleet_number}` : d.vehicle.registration) : "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {d.model || "—"}
                  {d.imei ? ` · IMEI ${d.imei}` : ""}
                </TableCell>
                <TableCell>
                  {!d.active ? (
                    <StatusBadge tone="neutral">Désactivé</StatusBadge>
                  ) : d.last_seen_at ? (
                    <StatusBadge tone={d.online ? "success" : "warning"}>{ago(d.last_seen_at)}</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">Jamais</StatusBadge>
                  )}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => rotate(d)}>
                    <KeyRound className="size-3.5" />
                    Clé
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => toggle(d)}>
                    {d.active ? "Désactiver" : "Activer"}
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Supprimer" onClick={() => remove(d)}>
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={create} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Ajouter un boîtier</DialogTitle>
              <DialogDescription className="text-xs">La clé du boîtier s&apos;affiche une seule fois après l&apos;enregistrement.</DialogDescription>
            </DialogHeader>
            <Field label="Car">
              <Select value={form.vehicle_id} onValueChange={(v) => setForm({ ...form, vehicle_id: v ?? "" })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir un car" />
                </SelectTrigger>
                <SelectContent>
                  {free.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.fleet_number ? `${v.fleet_number} · ${v.registration}` : v.registration}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="IMEI (facultatif)" hint="Obligatoire si le boîtier passe par un serveur Traccar.">
              <Input value={form.imei} onChange={(e) => setForm({ ...form, imei: e.target.value })} inputMode="numeric" maxLength={32} />
            </Field>
            <Field label="Modèle (facultatif)">
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Teltonika FMC130, téléphone…" maxLength={100} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={!form.vehicle_id}>
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={shown !== null} onOpenChange={(o) => !o && setShown(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{shown?.title}</DialogTitle>
            <DialogDescription className="text-xs">Copie cette clé maintenant : elle ne sera plus affichée.</DialogDescription>
          </DialogHeader>
          {shown && <KeyInstructions secret={shown.key} relay={!!shown.relay} />}
          <DialogFooter>
            <Button onClick={() => setShown(null)}>J&apos;ai noté la clé</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CopyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-2 py-1.5 text-xs">{value}</code>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Copier ${label}`}
          onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copié"))}
        >
          <Copy className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function KeyInstructions({ secret, relay }: { secret: string; relay: boolean }) {
  const base = apiBaseUrl.startsWith("http") ? apiBaseUrl : `${typeof window !== "undefined" ? window.location.origin : ""}${apiBaseUrl}`;
  return relay ? (
    <div className="space-y-3">
      <CopyLine label="Clé du relais" value={secret} />
      <p className="text-xs text-muted-foreground">Dans le fichier traccar.xml du serveur Traccar :</p>
      <CopyLine label="forward.url" value={`${base}/gps/traccar`} />
      <CopyLine label="forward.header" value={`X-Gps-Key: ${secret}`} />
      <p className="text-xs text-muted-foreground">Ajouter aussi forward.enable = true et forward.json = true, puis redémarrer Traccar.</p>
    </div>
  ) : (
    <div className="space-y-3">
      <CopyLine label="Clé du boîtier" value={secret} />
      <p className="text-xs text-muted-foreground">
        Téléphone de test : app « Traccar Client », identifiant de l&apos;appareil = la clé, adresse du serveur :
      </p>
      <CopyLine label="Adresse du serveur" value={`${base}/gps/osmand`} />
      <p className="text-xs text-muted-foreground">Boîtier qui envoie du JSON : POST {`${base}/gps/ingest`} avec l&apos;en-tête X-Gps-Key.</p>
    </div>
  );
}
