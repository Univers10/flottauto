"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { BusFront, Check, CircleAlert, FileText, Plus, Route, Trash2, X } from "lucide-react";
import { AppShell, useCurrentUser } from "@/components/layout/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Field, Panel, StatusBadge, toneSurface, toneText } from "@/components/app/primitives";
import {
  addConvoyPayment,
  cancelConvoy,
  completeConvoy,
  confirmConvoy,
  deleteConvoy,
  deleteConvoyPayment,
  getConvoy,
  listAllVehicles,
  listDrivers,
  listStations,
  updateConvoy,
} from "@/lib/api";
import { checklistItemTone, convoyPurposeLabels, convoyStatus, convoyVerdictTone, paymentMethodLabels } from "@/lib/labels";
import { canCollectConvoyPayments, canManageConvoys } from "@/lib/roles";
import { formatDate, formatNumber, fullName } from "@/lib/format";
import { vehicleFullName } from "@/lib/vehicle";
import { cn } from "@/lib/utils";
import type { Convoy, ConvoyInput, ConvoyPurpose, Driver, PaymentMethod, Station, Vehicle } from "@/types";
import { toast } from "sonner";

/* ───────────────────────── Formulaire ───────────────────────── */

const NONE = "none";

type SegmentForm = { from_label: string; to_label: string; km: string; price_per_seat: string };
type Form = {
  title: string;
  purpose: ConvoyPurpose;
  client_name: string;
  client_phone: string;
  broker_name: string;
  broker_phone: string;
  departure_at: string;
  return_date: string;
  meeting_point: string;
  station_id: string;
  seats_sold: string;
  seats_boarded: string;
  billed_days: string;
  daily_rate: string;
  tolls_estimate: string;
  vehicle_id: string;
  backup_vehicle_id: string;
  driver_id: string;
  relief_driver_id: string;
  conveyor_id: string;
  notes: string;
  segments: SegmentForm[];
};

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const id = (v: number | null) => (v === null ? NONE : String(v));
const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

function toForm(c: Convoy): Form {
  return {
    title: c.title,
    purpose: c.purpose,
    client_name: c.client_name ?? "",
    client_phone: c.client_phone ?? "",
    broker_name: c.broker_name ?? "",
    broker_phone: c.broker_phone ?? "",
    departure_at: toLocalInput(c.departure_at),
    return_date: c.return_date ?? "",
    meeting_point: c.meeting_point ?? "",
    station_id: id(c.station_id),
    seats_sold: c.seats_sold ? String(c.seats_sold) : "",
    seats_boarded: num(c.seats_boarded),
    billed_days: c.billed_days ? String(c.billed_days) : "",
    daily_rate: num(c.daily_rate),
    tolls_estimate: c.tolls_estimate ? String(c.tolls_estimate) : "",
    vehicle_id: id(c.vehicle_id),
    backup_vehicle_id: id(c.backup_vehicle_id),
    driver_id: id(c.driver_id),
    relief_driver_id: id(c.relief_driver_id),
    conveyor_id: id(c.conveyor_id),
    notes: c.notes ?? "",
    segments: c.segments.map((s) => ({ from_label: s.from_label, to_label: s.to_label, km: String(s.km || ""), price_per_seat: String(s.price_per_seat || "") })),
  };
}

const int = (v: string) => {
  const n = Math.round(Number(v.replace(/\s/g, "")));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const intOrNull = (v: string) => (v.trim() === "" ? null : int(v));
const ref = (v: string) => (v === NONE ? null : Number(v));
const text = (v: string) => v.trim() || null;

function toPayload(f: Form): ConvoyInput {
  return {
    title: f.title.trim() || "Convoi",
    purpose: f.purpose,
    client_name: text(f.client_name),
    client_phone: text(f.client_phone),
    broker_name: text(f.broker_name),
    broker_phone: text(f.broker_phone),
    departure_at: f.departure_at ? `${f.departure_at}:00` : null,
    return_date: f.return_date || null,
    meeting_point: text(f.meeting_point),
    station_id: ref(f.station_id),
    seats_sold: int(f.seats_sold),
    seats_boarded: intOrNull(f.seats_boarded),
    billed_days: int(f.billed_days),
    daily_rate: intOrNull(f.daily_rate),
    tolls_estimate: int(f.tolls_estimate),
    vehicle_id: ref(f.vehicle_id),
    backup_vehicle_id: ref(f.backup_vehicle_id),
    driver_id: ref(f.driver_id),
    relief_driver_id: ref(f.relief_driver_id),
    conveyor_id: ref(f.conveyor_id),
    notes: text(f.notes),
    segments: f.segments
      .filter((s) => s.from_label.trim() && s.to_label.trim())
      .map((s) => ({ from_label: s.from_label.trim(), to_label: s.to_label.trim(), km: int(s.km), price_per_seat: int(s.price_per_seat) })),
  };
}

const F = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${formatNumber(n)} F`);

/* ───────────────────────── Page ───────────────────────── */

export default function ConvoyPage() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell>
      <ConvoyEditor key={params.id} convoyId={Number(params.id)} />
    </AppShell>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";

function ConvoyEditor({ convoyId }: { convoyId: number }) {
  const router = useRouter();
  const user = useCurrentUser();
  const [convoy, setConvoy] = useState<Convoy | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [people, setPeople] = useState<Driver[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [missing, setMissing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState<"confirm" | "cancel" | "delete" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Form | null>(null);
  const inflight = useRef<Promise<Convoy | null> | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getConvoy(convoyId), listAllVehicles(), listDrivers(), listStations().catch(() => [])])
      .then(([c, v, d, s]) => {
        if (cancelled) return;
        setConvoy(c);
        setForm(toForm(c));
        setVehicles(v);
        setPeople(d);
        setStations(s);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setMissing(true);
        toast.error(err.message || "Convoi introuvable");
      });
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      // Quitter la page juste après une frappe : la dernière modification part quand même.
      if (pending.current) updateConvoy(convoyId, toPayload(pending.current)).catch(() => {});
    };
  }, [convoyId]);

  // Fermeture ou rechargement avant l'enregistrement automatique : le navigateur demande confirmation.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const save = useCallback(
    (next: Form) => {
      const run = async () => {
        await inflight.current; // un seul PATCH à la fois, dans l'ordre des frappes
        if (pending.current === next) pending.current = null;
        const mine = ++seq.current;
        setSaveState("saving");
        try {
          const updated = await updateConvoy(convoyId, toPayload(next));
          if (mine === seq.current) {
            setConvoy(updated);
            setSaveState("saved");
          }
          return updated;
        } catch (err) {
          // Échec : la modification reste en attente et sera renvoyée avant toute validation.
          pending.current ??= next;
          if (mine === seq.current) setSaveState("error");
          toast.error((err as Error).message || "Enregistrement impossible");
          return null;
        }
      };
      const promise = run();
      inflight.current = promise;
      return promise;
    },
    [convoyId]
  );

  /** Enregistrement automatique, 700 ms après la dernière frappe. */
  function change(patch: Partial<Form>) {
    if (!form || !convoy || !user || !canManageConvoys(user.role) || convoy.status === "done" || convoy.status === "cancelled") return;
    const next = { ...form, ...patch };
    setForm(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => pending.current && save(pending.current), 700);
  }

  /** Avant une action (valider, terminer…) : attend l'enregistrement en cours et envoie le reste ; échec = action annulée. */
  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    await inflight.current;
    if (pending.current && !(await save(pending.current))) {
      throw new Error("Les dernières modifications ne sont pas enregistrées : réessayez.");
    }
  }

  if (missing) {
    return (
      <Panel>
        <EmptyState
          icon={Route}
          title="Convoi introuvable"
          action={
            <Link href="/convoys" className={buttonVariants({ variant: "outline" })}>
              Retour aux convois
            </Link>
          }
        />
      </Panel>
    );
  }
  if (!convoy || !form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-2/3" />
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const a = convoy.account!;
  const st = convoyStatus[convoy.status];
  const closed = convoy.status === "done" || convoy.status === "cancelled";
  const canEdit = !!user && canManageConvoys(user.role) && !closed;
  const canPay = !!user && canCollectConvoyPayments(user.role) && convoy.status !== "cancelled";
  const drivers = people.filter((p) => p.staff_type === "driver" && (p.is_active || [convoy.driver_id, convoy.relief_driver_id].includes(p.id)));
  const conveyors = people.filter((p) => p.staff_type === "conveyor" && (p.is_active || p.id === convoy.conveyor_id));
  const seatsOf = vehicles.find((v) => String(v.id) === form.vehicle_id)?.seats;

  async function runAction(kind: "confirm" | "complete" | "cancel" | "delete") {
    setBusy(true);
    try {
      await flush();
      if (kind === "delete") {
        await deleteConvoy(convoy!.id);
        toast.success("Brouillon supprimé");
        router.push("/convoys");
        return;
      }
      const op = { confirm: confirmConvoy, complete: completeConvoy, cancel: cancelConvoy }[kind];
      const next = await op(convoy!.id);
      setConvoy(next);
      setForm(toForm(next));
      toast.success(
        { confirm: "Contrat généré · le départ du convoi est créé", complete: "Convoi terminé", cancel: "Convoi annulé" }[kind]
      );
      setConfirmOpen(null);
    } catch (err) {
      toast.error((err as Error).message || "Action impossible");
    } finally {
      setBusy(false);
    }
  }

  const verdictTone = convoyVerdictTone[a.verdict];

  return (
    <>
      {/* En-tête */}
      <div className="flex flex-col gap-4 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <nav aria-label="Fil d'Ariane" className="flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/convoys" className="hover:text-foreground">
              Convois
            </Link>
            <span>›</span>
            <span className="font-mono text-foreground">N° {convoy.number}</span>
          </nav>
          {canEdit ? (
            <input
              value={form.title}
              onChange={(e) => change({ title: e.target.value })}
              aria-label="Titre du convoi"
              className="w-full max-w-2xl rounded-md bg-transparent text-2xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">{convoy.title}</h1>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
            <StatusBadge tone={a.balance === 0 && a.revenue > 0 ? "success" : "info"}>
              Paiement : {formatNumber(a.paid)} / {F(a.revenue)}
            </StatusBadge>
            <SaveIndicator state={saveState} />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {convoy.status !== "draft" && (
            <Link href={`/convoys/${convoy.id}/contract`} className={buttonVariants({ variant: "outline" })}>
              <FileText className="size-4" />
              Voir le contrat
            </Link>
          )}
          {convoy.departure_id && (
            <Link href={`/departures/${convoy.departure_id}`} className={buttonVariants({ variant: "outline" })}>
              <BusFront className="size-4" />
              Départ du convoi
            </Link>
          )}
          {canEdit && convoy.status === "draft" && (
            <>
              <Button variant="ghost" onClick={() => setConfirmOpen("delete")} aria-label="Supprimer le brouillon">
                <Trash2 className="size-4" />
              </Button>
              <Button onClick={() => setConfirmOpen("confirm")} disabled={busy}>
                <Check className="size-4" />
                Valider et générer le contrat
              </Button>
            </>
          )}
          {canEdit && convoy.status === "confirmed" && (
            <>
              <Button variant="outline" onClick={() => setConfirmOpen("cancel")} disabled={busy}>
                <X className="size-4" />
                Annuler le convoi
              </Button>
              <Button onClick={() => runAction("complete")} disabled={busy}>
                <Check className="size-4" />
                Marquer terminé
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Indicateurs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Recettes" value={F(a.revenue)} hint="Transport + immobilisation" />
        <Kpi label="Charges" value={F(a.charges)} hint="Carburant, rations, péages, apporteur" />
        <Kpi
          label="Marge du convoi"
          value={F(a.margin)}
          tone={a.margin < 0 ? "danger" : a.margin > 0 ? "success" : undefined}
          hint={a.margin_pct !== null ? `${String(a.margin_pct).replace(".", ",")} % des recettes` : "—"}
        />
        <Kpi label="Recette / jour de car" value={F(a.revenue_per_day)} hint={`Ligne régulière : ${F(a.line_revenue_per_day)}/j`} />
        <div className={cn("rounded-xl border p-4 shadow-card sm:p-5", toneSurface(verdictTone))}>
          <p className="text-[13px] font-medium opacity-80">Verdict</p>
          <p className="mt-2 text-xl font-bold tracking-tight">{a.verdict_label}</p>
          <p className="mt-1 text-xs">{a.verdict_detail}</p>
        </div>
      </div>

      {a.alerts.length > 0 && (
        <div className={cn("mt-4 space-y-1 rounded-xl border px-4 py-3 text-sm", toneSurface("warning"))}>
          {a.alerts.map((alert) => (
            <p key={alert} className="flex gap-2">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{alert}</span>
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-3">
        <fieldset disabled={!canEdit} className="min-w-0 space-y-4 xl:col-span-2">
          {/* A · Client */}
          <Panel title="A · Client, motif et apporteur">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Client / chef de convoi" htmlFor="client_name" required>
                <Input id="client_name" value={form.client_name} onChange={(e) => change({ client_name: e.target.value })} placeholder="Nom du chef de convoi" />
              </Field>
              <Field label="Téléphone" htmlFor="client_phone">
                <Input id="client_phone" inputMode="tel" value={form.client_phone} onChange={(e) => change({ client_phone: e.target.value })} placeholder="07 00 00 00 00" />
              </Field>
              <Field label="Apporteur d'affaires" htmlFor="broker_name" hint="Laisser vide s'il n'y a pas de commission">
                <Input id="broker_name" value={form.broker_name} onChange={(e) => change({ broker_name: e.target.value })} />
              </Field>
              <Field label="N° de l'apporteur" htmlFor="broker_phone">
                <Input id="broker_phone" inputMode="tel" value={form.broker_phone} onChange={(e) => change({ broker_phone: e.target.value })} />
              </Field>
              <div className="space-y-1.5 sm:col-span-2">
                <p className="text-[13px] font-medium">Motif du convoi</p>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(convoyPurposeLabels) as ConvoyPurpose[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => change({ purpose: p })}
                      aria-pressed={form.purpose === p}
                      className={cn(
                        "h-8 rounded-full px-3 text-[13px] font-medium transition-colors disabled:opacity-60",
                        form.purpose === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      {convoyPurposeLabels[p]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          {/* B · Itinéraire */}
          <Panel title="B · Itinéraire et kilométrage" description="Une ligne par étape. Le tarif est le prix d'une place sur l'étape." flush>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-sunken text-xs text-muted-foreground">
                  <tr>
                    <th className="w-8 px-4 py-2 text-left font-medium">#</th>
                    <th className="px-2 py-2 text-left font-medium">De</th>
                    <th className="px-2 py-2 text-left font-medium">À</th>
                    <th className="w-24 px-2 py-2 text-right font-medium">Km</th>
                    <th className="w-32 px-2 py-2 text-right font-medium">Tarif / place</th>
                    <th className="w-32 px-2 py-2 text-right font-medium">× {int(form.seats_sold) || "?"} places</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {form.segments.map((s, i) => {
                    const set = (patch: Partial<SegmentForm>) =>
                      change({ segments: form.segments.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                    return (
                      <tr key={i}>
                        <td className="px-4 py-1.5 text-muted-foreground tabular">{i + 1}</td>
                        <td className="px-2 py-1.5">
                          <Input aria-label={`Départ de l'étape ${i + 1}`} value={s.from_label} onChange={(e) => set({ from_label: e.target.value })} placeholder="Abidjan" />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input aria-label={`Arrivée de l'étape ${i + 1}`} value={s.to_label} onChange={(e) => set({ to_label: e.target.value })} placeholder="Danané" />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input aria-label={`Km de l'étape ${i + 1}`} inputMode="numeric" className="text-right tabular" value={s.km} onChange={(e) => set({ km: e.target.value })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input aria-label={`Tarif de l'étape ${i + 1}`} inputMode="numeric" className="text-right tabular" value={s.price_per_seat} onChange={(e) => set({ price_per_seat: e.target.value })} />
                        </td>
                        <td className="px-2 py-1.5 text-right tabular">{formatNumber(int(s.price_per_seat) * int(form.seats_sold))}</td>
                        <td className="px-2 py-1.5">
                          {canEdit && (
                            <Button variant="ghost" size="icon" aria-label={`Supprimer l'étape ${i + 1}`} onClick={() => change({ segments: form.segments.filter((_, j) => j !== i) })}>
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {form.segments.length > 0 && (
                  <tfoot className="border-t font-semibold">
                    <tr>
                      <td />
                      <td className="px-2 py-2" colSpan={2}>
                        Total
                      </td>
                      <td className="px-2 py-2 text-right tabular">{formatNumber(a.km)} km</td>
                      <td className="px-2 py-2 text-right tabular">{formatNumber(a.price_per_seat)}</td>
                      <td className="px-2 py-2 text-right tabular">{formatNumber(a.price_per_seat * (convoy.seats_sold || 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {canEdit && (
              <div className="border-t px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const last = form.segments.at(-1);
                    change({ segments: [...form.segments, { from_label: last?.to_label ?? "", to_label: "", km: "", price_per_seat: "" }] });
                  }}
                >
                  <Plus className="size-4" />
                  Ajouter une étape
                </Button>
              </div>
            )}
          </Panel>

          {/* C · Dates */}
          <Panel title="C · Dates, places et immobilisation">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Départ (ramassage)" htmlFor="departure_at" required>
                <Input id="departure_at" type="datetime-local" className="tabular" value={form.departure_at} onChange={(e) => change({ departure_at: e.target.value })} />
              </Field>
              <Field label="Retour" htmlFor="return_date" required>
                <Input id="return_date" type="date" className="tabular" value={form.return_date} onChange={(e) => change({ return_date: e.target.value })} />
              </Field>
              <Field label="Lieu de rassemblement" htmlFor="meeting_point">
                <Input id="meeting_point" value={form.meeting_point} onChange={(e) => change({ meeting_point: e.target.value })} placeholder="Gare d'Abobo" />
              </Field>
              <Field label="Places vendues" htmlFor="seats_sold" required hint={seatsOf ? `Le car a ${seatsOf} places` : undefined}>
                <Input id="seats_sold" inputMode="numeric" className="tabular" value={form.seats_sold} onChange={(e) => change({ seats_sold: e.target.value })} />
              </Field>
              <Field label="Places occupées au départ" htmlFor="seats_boarded" hint="Saisi le jour du départ">
                <Input id="seats_boarded" inputMode="numeric" className="tabular" value={form.seats_boarded} onChange={(e) => change({ seats_boarded: e.target.value })} />
              </Field>
              <Field label="Gare de départ" htmlFor="station_id" hint="Le départ apparaîtra dans cette gare">
                <PickSelect
                  id="station_id"
                  value={form.station_id}
                  onChange={(v) => change({ station_id: v })}
                  options={stations.filter((s) => s.active || s.id === convoy.station_id).map((s) => ({ value: String(s.id), label: s.name }))}
                />
              </Field>
              <Field label="Jours d'immobilisation du car" htmlFor="days" hint="Calcul automatique (départ → retour)">
                <Input id="days" readOnly value={a.days ? `${a.days} jour${a.days > 1 ? "s" : ""}` : "—"} className="tabular" />
              </Field>
              <Field label="Jours facturés" htmlFor="billed_days">
                <Input id="billed_days" inputMode="numeric" className="tabular" value={form.billed_days} onChange={(e) => change({ billed_days: e.target.value })} />
              </Field>
              <Field label="Tarif d'immobilisation" htmlFor="daily_rate" hint="F par jour · vide = valeur des Paramètres">
                <Input id="daily_rate" inputMode="numeric" className="tabular" value={form.daily_rate} onChange={(e) => change({ daily_rate: e.target.value })} />
              </Field>
              <Field label="Péages estimés" htmlFor="tolls_estimate" hint="F pour tout l'itinéraire">
                <Input id="tolls_estimate" inputMode="numeric" className="tabular" value={form.tolls_estimate} onChange={(e) => change({ tolls_estimate: e.target.value })} />
              </Field>
            </div>
          </Panel>

          {/* D · Car et équipage */}
          <Panel title="D · Car et équipage">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Car affecté" htmlFor="vehicle_id" required>
                <PickSelect
                  id="vehicle_id"
                  value={form.vehicle_id}
                  onChange={(v) => change({ vehicle_id: v })}
                  options={vehicles.map((v) => ({ value: String(v.id), label: `${vehicleFullName(v)}${v.seats ? ` · ${v.seats} places` : ""}` }))}
                />
              </Field>
              <div className="space-y-1.5">
                <p className="text-[13px] font-medium">Documents du car aux dates du convoi</p>
                {convoy.vehicle_documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Choisissez un car.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {convoy.vehicle_documents.map((d) => (
                      <StatusBadge key={d.code} tone={checklistItemTone[d.status]}>
                        {d.label}
                        {d.status !== "ok" && d.detail ? ` : ${d.detail.toLowerCase()}` : ""}
                      </StatusBadge>
                    ))}
                  </div>
                )}
                {convoy.vehicle_id && convoy.vehicle_documents.some((d) => d.status !== "ok") && (
                  <Link href={`/vehicles/${convoy.vehicle_id}?tab=documents`} className="text-xs font-medium text-primary hover:underline">
                    Mettre à jour les documents du car →
                  </Link>
                )}
              </div>
              <Field label="Chauffeur titulaire" htmlFor="driver_id" required>
                <PickSelect id="driver_id" value={form.driver_id} onChange={(v) => change({ driver_id: v })} options={drivers.map((d) => ({ value: String(d.id), label: fullName(d) }))} />
              </Field>
              <Field label="Chauffeur relais" htmlFor="relief_driver_id" hint="Compte une deuxième ration chauffeur">
                <PickSelect id="relief_driver_id" value={form.relief_driver_id} onChange={(v) => change({ relief_driver_id: v })} options={drivers.map((d) => ({ value: String(d.id), label: fullName(d) }))} />
              </Field>
              <Field label="Convoyeur" htmlFor="conveyor_id">
                <PickSelect id="conveyor_id" value={form.conveyor_id} onChange={(v) => change({ conveyor_id: v })} options={conveyors.map((d) => ({ value: String(d.id), label: fullName(d) }))} />
              </Field>
              <Field label="Car de secours désigné" htmlFor="backup_vehicle_id">
                <PickSelect
                  id="backup_vehicle_id"
                  value={form.backup_vehicle_id}
                  onChange={(v) => change({ backup_vehicle_id: v })}
                  options={vehicles.filter((v) => String(v.id) !== form.vehicle_id).map((v) => ({ value: String(v.id), label: vehicleFullName(v) }))}
                />
              </Field>
              <Field label="Remarques" htmlFor="notes" className="sm:col-span-2">
                <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => change({ notes: e.target.value })} />
              </Field>
            </div>
          </Panel>
        </fieldset>

        {/* Colonne de droite */}
        <div className="space-y-4">
          <Panel title="Compte du convoi">
            <AccountBlock title="Recettes" lines={a.revenue_lines} total={a.revenue} totalLabel="Total recettes" />
            <AccountBlock title="Charges" lines={a.charge_lines} total={a.charges} totalLabel="Total charges" className="mt-4" />
            <div className="mt-4 flex items-center justify-between border-t pt-3">
              <span className="font-semibold">Marge du convoi</span>
              <span className={cn("text-lg font-semibold tabular", toneText(a.margin < 0 ? "danger" : "success"))}>{F(a.margin)}</span>
            </div>
          </Panel>

          <Panel title="Aide à la décision">
            <dl className="space-y-2 text-sm">
              <Row label="Marge par km" value={F(a.margin_per_km)} />
              <Row label="Marge par jour de car" value={F(a.margin_per_day)} />
              <Row label="Point mort" value={a.break_even_seats !== null ? `${a.break_even_seats} places payantes` : "—"} />
              <Row label="Part du carburant" value={a.fuel_share_pct !== null ? `${a.fuel_share_pct} % des charges` : "—"} />
              <Row label="Prix plancher conseillé" value={F(a.floor_price)} hint={`Charges + ${F(a.line_revenue_per_day)} × ${a.days} j de ligne`} />
            </dl>
          </Panel>

          <PaymentPanel
            convoy={convoy}
            canPay={canPay}
            canDelete={!!user && canManageConvoys(user.role)}
            agentName={user ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email : null}
            onChange={(next) => setConvoy(next)}
          />

          <p className="px-1 text-xs text-muted-foreground">
            Valeurs de calcul (gasoil, rations, commission, recette de ligne) réglables dans{" "}
            <Link href="/settings" className="underline">
              Paramètres
            </Link>
            .
          </p>
        </div>
      </div>

      <Dialog open={confirmOpen !== null} onOpenChange={(open) => !open && !busy && setConfirmOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmOpen === "confirm" ? "Valider et générer le contrat ?" : confirmOpen === "cancel" ? "Annuler ce convoi ?" : "Supprimer ce brouillon ?"}
            </DialogTitle>
            <DialogDescription>
              {confirmOpen === "confirm"
                ? "Le contrat de transport est numéroté et le départ du convoi apparaît dans « Départs ». Le car ne pourra sortir qu'une fois le solde réglé."
                : confirmOpen === "cancel"
                  ? "Le départ du convoi est annulé et son bon de sortie invalidé."
                  : "Le brouillon et ses montants sont supprimés définitivement."}
            </DialogDescription>
          </DialogHeader>
          {confirmOpen === "confirm" && a.verdict !== "profitable" && (
            <p className={cn("rounded-lg border px-3 py-2 text-sm", toneSurface(verdictTone))}>
              Attention : {a.verdict_label.toLowerCase()} — {a.verdict_detail}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(null)} disabled={busy}>
              Retour
            </Button>
            <Button
              variant={confirmOpen === "confirm" ? "default" : "destructive"}
              disabled={busy}
              onClick={() => confirmOpen && runAction(confirmOpen)}
            >
              {confirmOpen === "confirm" ? "Générer le contrat" : confirmOpen === "cancel" ? "Annuler le convoi" : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────────────────────── Morceaux ───────────────────────── */

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return <span className="text-xs text-muted-foreground">Enregistrement automatique</span>;
  if (state === "saving") return <span className="text-xs text-muted-foreground">Enregistrement…</span>;
  if (state === "error") return <span className={cn("text-xs font-medium", toneText("danger"))}>Non enregistré</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Check className="size-3.5" />
      Enregistré
    </span>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "success" | "danger" }) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-4 shadow-card sm:p-5">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-2 truncate text-xl font-semibold tracking-tight tabular", tone && toneText(tone))}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">
        {label}
        {hint && <span className="block text-xs text-subtle-foreground">{hint}</span>}
      </dt>
      <dd className="text-right font-medium whitespace-nowrap tabular">{value}</dd>
    </div>
  );
}

function AccountBlock({
  title,
  lines,
  total,
  totalLabel,
  className,
}: {
  title: string;
  lines: { label: string; detail: string | null; amount: number }[];
  total: number;
  totalLabel: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</p>
      <ul className="divide-y text-sm">
        {lines.map((l) => (
          <li key={l.label} className="flex items-start justify-between gap-3 py-2">
            <span className="min-w-0">
              {l.label}
              {l.detail && <span className="block text-xs text-muted-foreground">{l.detail}</span>}
            </span>
            <span className="tabular">{formatNumber(l.amount)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-3 py-2 font-semibold">
          <span>{totalLabel}</span>
          <span className="tabular">{formatNumber(total)}</span>
        </li>
      </ul>
    </div>
  );
}

function PickSelect({ id, value, onChange, options }: { id: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const items = { [NONE]: "Non choisi", ...Object.fromEntries(options.map((o) => [o.value, o.label])) };
  return (
    <Select items={items} value={value} onValueChange={(v) => onChange(v ? String(v) : NONE)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Non choisi</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const METHODS: PaymentMethod[] = ["wave", "orange_money", "mtn", "moov", "cash"];

function PaymentPanel({ convoy, canPay, canDelete, agentName, onChange }: { convoy: Convoy; canPay: boolean; canDelete: boolean; agentName: string | null; onChange: (c: Convoy) => void }) {
  const a = convoy.account!;
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("wave");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    const value = int(amount);
    if (!value) return;
    setSaving(true);
    try {
      onChange(await addConvoyPayment(convoy.id, { amount: value, method, reference: reference.trim() || null }));
      setAmount("");
      setReference("");
      toast.success("Paiement enregistré");
    } catch (err) {
      toast.error((err as Error).message || "Paiement impossible");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(paymentId: number) {
    try {
      onChange(await deleteConvoyPayment(convoy.id, paymentId));
    } catch (err) {
      toast.error((err as Error).message || "Suppression impossible");
    }
  }

  return (
    <Panel title="Paiement">
      <dl className="space-y-2 text-sm">
        <Row label="Prix global" value={F(a.revenue)} />
        <Row label="Déjà reçu" value={F(a.paid)} />
        <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
          <dt>Solde avant embarquement</dt>
          <dd className={cn("tabular", a.balance > 0 ? toneText("warning") : toneText("success"))}>{F(a.balance)}</dd>
        </div>
      </dl>

      {convoy.payments.length > 0 && (
        <ul className="mt-3 divide-y border-t text-sm">
          {convoy.payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                {paymentMethodLabels[p.method]} · {formatDate(p.paid_at)}
                <span className="block truncate text-xs text-muted-foreground">
                  {p.recorded_by_name ? `Encaissé par ${p.recorded_by_name}` : "Agent non renseigné"}
                  {p.reference && ` · ${p.reference}`}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <span className="tabular">{formatNumber(p.amount)}</span>
                {canDelete && (
                  <Button variant="ghost" size="icon" aria-label="Supprimer ce paiement" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canPay && a.balance > 0 && (
        <form onSubmit={handlePay} className="mt-4 space-y-3 border-t pt-4">
          <div className="flex flex-wrap gap-1.5">
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                aria-pressed={method === m}
                className={cn(
                  "h-7 rounded-full px-2.5 text-xs font-medium transition-colors",
                  method === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                {paymentMethodLabels[m]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input inputMode="numeric" className="tabular" placeholder="Montant reçu" aria-label="Montant reçu" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Button type="button" variant="outline" onClick={() => setAmount(String(a.balance))}>
              Solde
            </Button>
          </div>
          <Input placeholder="Référence (n° de transaction, reçu)" aria-label="Référence" value={reference} onChange={(e) => setReference(e.target.value)} />
          <Button type="submit" className="w-full" disabled={saving || !int(amount)}>
            Encaisser
          </Button>
          {agentName && <p className="text-xs text-muted-foreground">Le paiement sera enregistré à votre nom : {agentName}.</p>}
        </form>
      )}
      {a.balance > 0 && <p className={cn("mt-3 text-xs font-medium", toneText("danger"))}>Pas d&apos;autorisation de départ tant que le solde n&apos;est pas réglé.</p>}
    </Panel>
  );
}
