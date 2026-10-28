"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CalendarClock,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Fuel,
  Gauge,
  KeyRound,
  Loader2,
  PenLine,
  Route,
  ShieldCheck,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { AppShell, useCurrentUser } from "@/components/layout/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DetailList, EmptyState, Field, PageHeader, Panel, Plate, SegmentButton, StatCard, StatusBadge, toneSurface, toneText } from "@/components/app/primitives";
import { CameraCapture, type CapturedPhoto } from "@/components/app/camera-capture";
import { PrivatePhoto, fetchInspectionPhotoFile } from "@/components/app/private-photo";
import {
  api,
  getDayReport,
  getInspection,
  getVehicle,
  setInspectionItems,
  signInspection,
  updateInspection,
  uploadInspectionPhoto,
  validateInspection,
} from "@/lib/api";
import {
  blockingSections,
  documentTypeLabels,
  fuelLevelLabels,
  inspectionSectionLabels,
  inspectionVerdict,
  itemStatus,
  needPriority,
  needStatus,
  needOriginLabels,
  photoSlotLabels,
  photoSlots,
  signatureRoleLabels,
  type Tone,
} from "@/lib/labels";
import { canRunInspections } from "@/lib/roles";
import { formatDate, formatMoney, formatNumber, fullName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  DayReport,
  Driver,
  FuelLevel,
  Inspection,
  InspectionItem,
  InspectionPhoto,
  ItemStatus,
  PhotoSlot,
  SignatureRole,
  Vehicle,
} from "@/types";
import { toast } from "sonner";

/* ───────────────────────── Utilitaires ───────────────────────── */

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDelay(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

const SIGNATURE_ROLES: SignatureRole[] = ["station_manager", "driver", "conveyor"];
const STATUS_OPTIONS: ItemStatus[] = ["ok", "reserve", "ko"];
const SECTIONS_WITH_NA = ["technology", "arrival"];

type MutateResult = string | null;
type Mutate = (op: () => Promise<Inspection>, opts?: { silent?: boolean; errorMessage?: string }) => Promise<MutateResult>;

/* ───────────────────────── Page ───────────────────────── */

export default function InspectionDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell>
      <InspectionDetail id={Number(params.id)} />
    </AppShell>
  );
}

function InspectionDetail({ id }: { id: number }) {
  const user = useCurrentUser();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [departure, setDeparture] = useState<Inspection | null>(null);
  const [report, setReport] = useState<DayReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);

  // Écritures sérialisées : chaque réponse du serveur reflète l'état après l'écriture précédente.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const seqRef = useRef(0);
  const latestRef = useRef<Inspection | null>(null);

  const apply = useCallback((next: Inspection) => {
    latestRef.current = next;
    setInspection(next);
  }, []);

  const loadReport = useCallback(async (insp: Inspection) => {
    if (insp.kind !== "arrival") return;
    try {
      setReport(await getDayReport(insp.id));
    } catch {
      setReport(null);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const insp = await getInspection(id);
      apply(insp);
      const [veh, dep] = await Promise.all([
        getVehicle(insp.vehicle_id).catch(() => null),
        insp.departure_inspection_id ? getInspection(insp.departure_inspection_id).catch(() => null) : Promise.resolve(null),
      ]);
      setVehicle(veh);
      setDeparture(dep);
      await loadReport(insp);
    } catch (err: any) {
      setNotFound(true);
      toast.error(err.message || "État des lieux introuvable");
    } finally {
      setLoading(false);
    }
  }, [id, apply, loadReport]);

  useEffect(() => {
    load();
  }, [load]);

  const mutate: Mutate = useCallback(
    (op, opts = {}) => {
      const seq = ++seqRef.current;
      const run = queueRef.current.then(async (): Promise<MutateResult> => {
        try {
          const before = latestRef.current;
          const res = await op();
          latestRef.current = res;
          if (seq === seqRef.current) setInspection(res);
          if (before && before.signatures.length > 0 && res.signatures.length === 0) {
            toast.info("Modification enregistrée : les signatures ont été effacées, faites signer à nouveau.");
          }
          return null;
        } catch (err: any) {
          const message: string = err?.message || opts.errorMessage || "Enregistrement impossible";
          if (!opts.silent) toast.error(message);
          // Resynchronise l'état local (mise à jour optimiste annulée).
          getInspection(id)
            .then((fresh) => {
              latestRef.current = fresh;
              setInspection(fresh);
            })
            .catch(() => undefined);
          return message;
        }
      });
      queueRef.current = run.catch(() => undefined);
      return run;
    },
    [id]
  );

  if (loading && !inspection) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-2/3" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!inspection || notFound) {
    return (
      <Panel>
        <EmptyState
          icon={ClipboardCheck}
          title="État des lieux introuvable"
          description="Il a peut-être été supprimé ou n'appartient pas à votre société."
          action={
            <Link href="/inspections" className={buttonVariants({ variant: "outline" })}>
              Retour aux états des lieux
            </Link>
          }
        />
      </Panel>
    );
  }

  const insp = inspection;
  const isDeparture = insp.kind === "departure";
  const canEdit = !!user && canRunInspections(user.role);
  const readOnly = insp.status === "validated" || !canEdit;
  const registration = vehicle?.registration ?? `#${insp.vehicle_id}`;
  const signedCount = SIGNATURE_ROLES.filter((r) => insp.signatures.some((s) => s.role === r)).length;

  async function handleValidate() {
    setValidating(true);
    setValidateError(null);
    const error = await mutate(() => validateInspection(insp.id), { silent: true });
    setValidating(false);
    if (error) {
      setValidateError(error);
      toast.error(error);
      return;
    }
    toast.success("État des lieux validé");
    const fresh = latestRef.current;
    if (fresh) {
      loadReport(fresh);
      getVehicle(fresh.vehicle_id).then(setVehicle).catch(() => undefined);
    }
  }

  const subtitle = [
    formatDate(insp.created_at, "long"),
    insp.route_label,
    isDeparture && insp.scheduled_departure_at ? `Départ prévu ${formatTime(insp.scheduled_departure_at)}` : null,
    !isDeparture && insp.arrived_at ? `Arrivé à ${formatTime(insp.arrived_at)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6 pb-4">
      <PageHeader
        className="pb-0"
        title={`État des lieux ${isDeparture ? "au départ" : "à l'arrivée"} · ${registration}`}
        description={subtitle}
        breadcrumb={[{ label: "États des lieux", href: "/inspections" }, { label: insp.number }]}
        actions={
          <>
            <Plate value={registration} />
            <StatusBadge tone={insp.status === "validated" ? "success" : "neutral"}>{insp.status === "validated" ? "Validé" : "Brouillon"}</StatusBadge>
          </>
        }
      />

      {insp.status === "validated" && (
        <div className={cn("flex items-start gap-3 rounded-xl border p-4", toneSurface("success"))}>
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 space-y-1 text-sm">
            <p className="font-medium">
              État des lieux validé le {formatDate(insp.validated_at, "long")} à {formatTime(insp.validated_at)}. Il ne peut plus être modifié.
            </p>
            <p className="text-muted-foreground">
              Les réserves et les KO ont été ajoutés à la liste des besoins du car.{" "}
              <Link href={`/needs?vehicle_id=${insp.vehicle_id}`} className="font-medium text-foreground underline underline-offset-4">
                Voir les besoins
              </Link>
            </p>
          </div>
        </div>
      )}

      {!canEdit && insp.status === "draft" && (
        <p className="rounded-xl border bg-surface-sunken px-4 py-3 text-sm text-muted-foreground">
          Lecture seule : seuls les chefs de gare et les responsables d&apos;exploitation peuvent remplir cet état des lieux.
        </p>
      )}

      <KpiRow inspection={insp} />

      <PhotosPanel inspection={insp} departure={departure} readOnly={readOnly} mutate={mutate} />

      <ChecklistPanels inspection={insp} readOnly={readOnly} mutate={mutate} setInspection={apply} />

      {isDeparture && (
        <p className={cn("flex items-start gap-2 text-sm font-medium", toneText("danger"))}>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          Une case KO en mécanique et sécurité, ou un outil de bord manquant, rend le car inapte au départ.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <MeterPanel inspection={insp} vehicle={vehicle} departure={departure} readOnly={readOnly} mutate={mutate} />
        <ObservationsPanel inspection={insp} readOnly={readOnly} mutate={mutate} />
      </div>

      <SignaturesPanel inspection={insp} readOnly={readOnly} mutate={mutate} userName={fullName(user)} />

      {!isDeparture && report && <DayReportSection report={report} vehicleId={insp.vehicle_id} />}

      {!readOnly && (
        <div className="sticky bottom-0 z-20 -mx-1 flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-pop sm:flex-row sm:items-center sm:justify-between md:static md:mx-0 md:shadow-card">
          <div className="min-w-0 text-sm">
            {validateError ? (
              <p className={cn("font-medium", toneText("danger"))}>{validateError}</p>
            ) : (
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground tabular">{signedCount}/3</span> signatures
                {signedCount < 3 && " · les 3 signatures sont nécessaires pour valider"}
              </p>
            )}
          </div>
          <Button size="lg" className="w-full sm:w-auto" disabled={signedCount < 3 || validating} onClick={handleValidate}>
            {validating ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            Valider l&apos;état des lieux
          </Button>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Indicateurs ───────────────────────── */

function KpiRow({ inspection: insp }: { inspection: Inspection }) {
  const verdict = insp.verdict ? inspectionVerdict[insp.verdict] : null;
  const tone: Tone = verdict?.tone ?? "neutral";
  const filled = insp.items.filter((i) => i.status !== null).length;
  const isArrival = insp.kind === "arrival";
  const fuel = [insp.fuel_level ? fuelLevelLabels[insp.fuel_level] : null, insp.fuel_liters !== null ? formatNumber(insp.fuel_liters, "L") : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", isArrival ? "lg:grid-cols-5" : "lg:grid-cols-3")}>
      <div className={cn("col-span-2 rounded-xl border p-4 shadow-card sm:p-5 lg:col-span-1", toneSurface(tone))}>
        <p className="text-[13px] font-medium opacity-80">Verdict</p>
        <p className="mt-3 text-[1.375rem] leading-none font-semibold tracking-tight sm:text-[1.75rem]">{verdict?.label ?? "En cours"}</p>
        <p className="mt-2 text-xs opacity-80">
          {verdict ? (insp.verdict === "unfit" ? "KO sur un point bloquant" : "Calculé sur les points de contrôle") : "Tous les points doivent être renseignés"}
        </p>
      </div>
      <StatCard label="Note" value={insp.score !== null ? `${insp.score}/100` : "—"} hint={`${filled}/${insp.items.length} points renseignés`} icon={ClipboardCheck} />
      <StatCard label="Compteur · carburant" value={formatNumber(insp.mileage, "km")} hint={fuel || "Carburant non renseigné"} icon={Gauge} />
      {isArrival && <StatCard label="Km du jour" value={formatNumber(insp.km_of_day, "km")} hint="Depuis l'état des lieux de départ" icon={Route} />}
      {isArrival && (
        <StatCard
          label="Délai d'envoi"
          value={formatDelay(insp.report_delay_minutes)}
          hint={insp.report_late === null ? "Limite : 60 min après l'arrivée" : insp.report_late ? "En retard (plus de 60 min)" : "Dans les temps (60 min max)"}
          icon={Timer}
          tone={insp.report_late === null ? undefined : insp.report_late ? "danger" : "success"}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Photos ───────────────────────── */

function PhotosPanel({
  inspection: insp,
  departure,
  readOnly,
  mutate,
}: {
  inspection: Inspection;
  departure: Inspection | null;
  readOnly: boolean;
  mutate: Mutate;
}) {
  const bySlot = useMemo(() => new Map(insp.photos.map((p) => [p.slot, p])), [insp.photos]);
  const departureBySlot = useMemo(() => new Map((departure?.photos ?? []).map((p) => [p.slot, p])), [departure]);
  const done = photoSlots.filter((s) => bySlot.has(s)).length;

  return (
    <Panel
      title={`Photos obligatoires · ${done} / 8`}
      description={
        readOnly
          ? undefined
          : insp.kind === "arrival"
            ? "Comparez avec la photo du départ. Cochez « Dégât » avant de prendre la photo si un dommage est visible. Reprendre une photo efface les signatures."
            : "Touchez une tuile pour photographier. Reprendre une photo efface les signatures déjà recueillies."
      }
      actions={done < 8 ? <StatusBadge tone="warning">Validation impossible tant qu&apos;une photo manque</StatusBadge> : <StatusBadge tone="success">Complet</StatusBadge>}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {photoSlots.map((slot) => (
          <PhotoTile
            key={slot}
            inspectionId={insp.id}
            slot={slot}
            photo={bySlot.get(slot)}
            departureId={departure?.id ?? null}
            departurePhoto={departureBySlot.get(slot)}
            showCompare={insp.kind === "arrival"}
            readOnly={readOnly}
            mutate={mutate}
          />
        ))}
      </div>
    </Panel>
  );
}

function PhotoTile({
  inspectionId,
  slot,
  photo,
  departureId,
  departurePhoto,
  showCompare,
  readOnly,
  mutate,
}: {
  inspectionId: number;
  slot: PhotoSlot;
  photo: InspectionPhoto | undefined;
  departureId: number | null;
  departurePhoto: InspectionPhoto | undefined;
  showCompare: boolean;
  readOnly: boolean;
  mutate: Mutate;
}) {
  const label = photoSlotLabels[slot];
  const [value, setValue] = useState<CapturedPhoto | null>(null);
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [damage, setDamage] = useState(false);

  // Photo déjà enregistrée : téléchargée (privée) pour l'afficher dans la tuile.
  useEffect(() => {
    if (readOnly || !photo || photo.id === loadedId) return;
    let cancelled = false;
    const current = photo;
    fetchInspectionPhotoFile(inspectionId, current.id)
      .then((file) => {
        if (cancelled) return;
        setValue({ file, capturedAt: new Date(current.captured_at ?? current.uploaded_at), fresh: current.is_fresh, width: 0, height: 0 });
        setLoadedId(current.id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [inspectionId, photo, loadedId, readOnly]);

  async function handleCapture(captured: CapturedPhoto) {
    const previous = value;
    setValue(captured);
    setUploading(true);
    const error = await mutate(
      async () => {
        const uploaded = await uploadInspectionPhoto(inspectionId, slot, captured.file, {
          capturedAt: captured.capturedAt,
          fresh: captured.fresh,
          damage: showCompare && damage,
        });
        setLoadedId(uploaded.id);
        return getInspection(inspectionId);
      },
      { errorMessage: `Envoi de la photo « ${label} » impossible` }
    );
    if (error) setValue(previous);
    setUploading(false);
  }

  const compare = showCompare && (
    <div className="mt-1.5 flex items-center gap-2">
      {departureId && departurePhoto ? (
        <PrivatePhoto inspectionId={departureId} photoId={departurePhoto.id} alt={`${label} au départ`} className="size-9 shrink-0 rounded-md border" />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-dashed bg-surface-sunken text-subtle-foreground">
          <Camera className="size-3.5" />
        </span>
      )}
      <span className="text-[11px] leading-tight text-muted-foreground">{departurePhoto ? "Au départ" : "Pas de photo au départ"}</span>
    </div>
  );

  if (readOnly) {
    return (
      <div className="min-w-0">
        <div className={cn("relative aspect-[4/3] overflow-hidden rounded-lg border bg-surface-sunken", photo?.damage && "border-warning-border ring-1 ring-warning-border")}>
          {photo ? (
            <PrivatePhoto inspectionId={inspectionId} photoId={photo.id} alt={label} className="absolute inset-0" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-subtle-foreground">
              <Camera className="size-5" />
            </span>
          )}
          <span className={cn("absolute inset-x-0 bottom-0 truncate px-2.5 py-2 text-xs font-medium", photo ? "bg-black/55 text-white" : "text-foreground")}>{label}</span>
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground tabular">
          {photo ? formatTime(photo.captured_at ?? photo.uploaded_at) : <span className="text-danger">Manquante</span>}
          {photo?.damage && <span className={cn("font-medium", toneText("warning"))}>· Dégât</span>}
          {photo && !photo.is_fresh && <span className={toneText("warning")}>· ancienne</span>}
        </p>
        {compare}
      </div>
    );
  }

  return (
    <div className="relative min-w-0">
      <div className="relative">
        <CameraCapture label={label} value={value} onCapture={handleCapture} required flagged={photo?.damage} />
        {uploading && (
          <span className="absolute inset-x-0 top-0 flex aspect-[4/3] items-center justify-center rounded-lg bg-background/60" aria-label="Envoi en cours">
            <Loader2 className="size-5 animate-spin text-foreground" />
          </span>
        )}
        {photo && !value && !uploading && (
          <span className="pointer-events-none absolute inset-x-0 top-0 flex aspect-[4/3] items-center justify-center">
            <Loader2 className="size-4 animate-spin text-subtle-foreground" />
          </span>
        )}
      </div>
      {photo?.damage && <p className={cn("mt-0.5 text-[11px] font-medium", toneText("warning"))}>Dégât signalé</p>}
      {showCompare && (
        <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-xs font-medium select-none">
          <input type="checkbox" className="size-3.5 accent-primary" checked={damage} onChange={(e) => setDamage(e.target.checked)} />
          Dégât
        </label>
      )}
      {compare}
    </div>
  );
}

/* ───────────────────────── Points de contrôle ───────────────────────── */

function ChecklistPanels({
  inspection: insp,
  readOnly,
  mutate,
  setInspection,
}: {
  inspection: Inspection;
  readOnly: boolean;
  mutate: Mutate;
  setInspection: (next: Inspection) => void;
}) {
  const sections = useMemo(() => {
    const groups = new Map<string, InspectionItem[]>();
    for (const item of insp.items) {
      const list = groups.get(item.section) ?? [];
      list.push(item);
      groups.set(item.section, list);
    }
    return Array.from(groups.entries());
  }, [insp.items]);

  function saveItem(item: InspectionItem, status: ItemStatus | null, note: string | null) {
    // Mise à jour optimiste, puis enregistrement du seul point modifié.
    setInspection({ ...insp, items: insp.items.map((i) => (i.code === item.code ? { ...i, status, note } : i)) });
    mutate(() => setInspectionItems(insp.id, [{ code: item.code, status, note }]));
  }

  return (
    <div className={cn("grid gap-6", sections.length > 1 && "lg:grid-cols-2")}>
      {sections.map(([section, items]) => {
        const filled = items.filter((i) => i.status !== null).length;
        const blocking = blockingSections.includes(section);
        return (
          <Panel
            key={section}
            flush
            title={
              <span className="flex flex-wrap items-center gap-2">
                {inspectionSectionLabels[section] ?? section}
                {blocking && insp.kind === "departure" && <span className={cn("text-[11px] font-medium", toneText("danger"))}>bloquant</span>}
              </span>
            }
            actions={<span className="text-xs text-muted-foreground tabular">{filled}/{items.length}</span>}
          >
            <ul className="divide-y">
              {items.map((item) => (
                <ItemRow
                  key={item.code}
                  item={item}
                  allowNa={SECTIONS_WITH_NA.includes(section) || item.status === "na"}
                  readOnly={readOnly}
                  onChange={(status, note) => saveItem(item, status, note)}
                />
              ))}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}

function ItemRow({
  item,
  allowNa,
  readOnly,
  onChange,
}: {
  item: InspectionItem;
  allowNa: boolean;
  readOnly: boolean;
  onChange: (status: ItemStatus | null, note: string | null) => void;
}) {
  const needsNote = item.status === "reserve" || item.status === "ko";
  const options = allowNa ? [...STATUS_OPTIONS, "na" as const] : STATUS_OPTIONS;

  return (
    <li className="space-y-2 px-5 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className={cn("text-sm", item.status === null && !readOnly ? "font-medium" : "text-foreground")}>{item.label}</p>
        {readOnly ? (
          item.status ? (
            <StatusBadge tone={itemStatus[item.status].tone}>{itemStatus[item.status].label}</StatusBadge>
          ) : (
            <span className="text-xs text-muted-foreground">Non renseigné</span>
          )
        ) : (
          <div role="radiogroup" aria-label={item.label} className="inline-flex shrink-0 gap-0.5 self-start rounded-lg border bg-surface-sunken p-0.5 sm:self-auto">
            {options.map((s) => {
              const active = item.status === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => !active && onChange(s, s === "reserve" || s === "ko" ? item.note : null)}
                  className={cn(
                    "h-8 min-w-12 rounded-md border px-2.5 text-[13px] font-medium transition-colors",
                    active ? toneSurface(itemStatus[s].tone) : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {s === "na" ? "S.O." : itemStatus[s].label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {readOnly
        ? item.note && <p className="text-xs text-muted-foreground">{item.note}</p>
        : needsNote && (
            <Input
              key={`${item.code}:${item.note ?? ""}`}
              defaultValue={item.note ?? ""}
              placeholder={item.status === "ko" ? "Décrivez le problème…" : "Précisez la réserve…"}
              className="h-9"
              aria-label={`Note : ${item.label}`}
              onBlur={(e) => {
                const note = e.target.value.trim() || null;
                if (note !== (item.note ?? null)) onChange(item.status, note);
              }}
            />
          )}
    </li>
  );
}

/* ───────────────────────── Compteur, carburant, observations ───────────────────────── */

function MeterPanel({
  inspection: insp,
  vehicle,
  departure,
  readOnly,
  mutate,
}: {
  inspection: Inspection;
  vehicle: Vehicle | null;
  departure: Inspection | null;
  readOnly: boolean;
  mutate: Mutate;
}) {
  const fuelLevels = Object.keys(fuelLevelLabels) as FuelLevel[];

  if (readOnly) {
    return (
      <Panel title="Compteur et carburant">
        <DetailList
          items={[
            { label: "Compteur", value: formatNumber(insp.mileage, "km") },
            { label: "Niveau de carburant", value: insp.fuel_level ? fuelLevelLabels[insp.fuel_level] : "—" },
            { label: "Litres", value: formatNumber(insp.fuel_liters, "L") },
          ]}
        />
      </Panel>
    );
  }

  const reference =
    insp.kind === "arrival" && departure?.mileage != null
      ? `Au départ : ${formatNumber(departure.mileage, "km")}`
      : vehicle
        ? `Dernier relevé du car : ${formatNumber(vehicle.mileage, "km")}`
        : undefined;

  return (
    <Panel title="Compteur et carburant" description="Enregistré à la sortie du champ.">
      <div className="space-y-4">
        <Field label="Compteur (km)" htmlFor="mileage" required hint={reference}>
          <Input
            id="mileage"
            key={`mileage:${insp.mileage ?? ""}`}
            type="number"
            inputMode="numeric"
            min={0}
            className="tabular"
            defaultValue={insp.mileage ?? ""}
            placeholder="0"
            onBlur={(e) => {
              const raw = e.target.value.trim();
              const next = raw === "" ? null : Math.round(Number(raw));
              if (next !== null && Number.isNaN(next)) return;
              if (next !== insp.mileage) mutate(() => updateInspection(insp.id, { mileage: next }));
            }}
          />
        </Field>
        <Field label="Niveau de carburant">
          <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
            {fuelLevels.map((level) => (
              <SegmentButton
                key={level}
                active={insp.fuel_level === level}
                onClick={() => insp.fuel_level !== level && mutate(() => updateInspection(insp.id, { fuel_level: level }))}
              >
                <Fuel className="size-3.5" aria-hidden />
                {fuelLevelLabels[level]}
              </SegmentButton>
            ))}
          </div>
        </Field>
        <Field label="Litres (facultatif)" htmlFor="fuel-liters">
          <Input
            id="fuel-liters"
            key={`liters:${insp.fuel_liters ?? ""}`}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            className="tabular"
            defaultValue={insp.fuel_liters ?? ""}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              const next = raw === "" ? null : Number(raw);
              if (next !== null && Number.isNaN(next)) return;
              if (next !== insp.fuel_liters) mutate(() => updateInspection(insp.id, { fuel_liters: next }));
            }}
          />
        </Field>
      </div>
    </Panel>
  );
}

function ObservationsPanel({ inspection: insp, readOnly, mutate }: { inspection: Inspection; readOnly: boolean; mutate: Mutate }) {
  return (
    <Panel title="Observations" description={readOnly ? undefined : "Remarques générales sur le car. Enregistré à la sortie du champ."}>
      {readOnly ? (
        <p className="text-sm whitespace-pre-line text-muted-foreground">{insp.observations || "Aucune observation."}</p>
      ) : (
        <Textarea
          key={`obs:${insp.observations ?? ""}`}
          rows={6}
          defaultValue={insp.observations ?? ""}
          placeholder="Bruit suspect, état des pneus, objets trouvés…"
          aria-label="Observations"
          onBlur={(e) => {
            const next = e.target.value.trim() || null;
            if (next !== (insp.observations ?? null)) mutate(() => updateInspection(insp.id, { observations: next }));
          }}
        />
      )}
    </Panel>
  );
}

/* ───────────────────────── Signatures ───────────────────────── */

function SignaturesPanel({
  inspection: insp,
  readOnly,
  mutate,
  userName,
}: {
  inspection: Inspection;
  readOnly: boolean;
  mutate: Mutate;
  userName: string;
}) {
  const [dialogRole, setDialogRole] = useState<SignatureRole | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [staff, setStaff] = useState<{ driver: Driver[]; conveyor: Driver[] } | null>(null);

  const needsCrew = !readOnly && (!insp.driver_id || !insp.conveyor_id);

  useEffect(() => {
    if (!needsCrew || staff) return;
    Promise.all([api.get<Driver[]>("/drivers?staff_type=driver"), api.get<Driver[]>("/drivers?staff_type=conveyor")])
      .then(([driver, conveyor]) => setStaff({ driver: driver.filter((d) => d.is_active), conveyor: conveyor.filter((d) => d.is_active) }))
      .catch(() => undefined);
  }, [needsCrew, staff]);

  const missingPhotos = insp.missing_photos.map((s) => photoSlotLabels[s]);
  const missingItems = insp.items.filter((i) => i.status === null).length;
  const missing: string[] = [
    ...(missingPhotos.length ? [`Photos : ${missingPhotos.join(", ")}`] : []),
    ...(missingItems ? [`${missingItems} point(s) de contrôle à renseigner`] : []),
    ...(insp.mileage === null ? ["Compteur kilométrique"] : []),
  ];

  function personFor(role: SignatureRole): string | null {
    if (role === "station_manager") return userName;
    const p = role === "driver" ? insp.driver : insp.conveyor;
    return p ? fullName(p) : null;
  }

  function openDialog(role: SignatureRole) {
    setDialogRole(role);
    setPin("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dialogRole) return;
    if (dialogRole !== "station_manager" && !/^\d{4,6}$/.test(pin)) {
      setError("Le PIN comporte 4 à 6 chiffres.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const role = dialogRole;
    const err = await mutate(() => signInspection(insp.id, role, role === "station_manager" ? undefined : pin), { silent: true });
    setSubmitting(false);
    setPin("");
    if (err) {
      setError(err);
      return;
    }
    toast.success(`Signature ${signatureRoleLabels[role].toLowerCase()} enregistrée`);
    setDialogRole(null);
  }

  const dialogPerson = dialogRole ? personFor(dialogRole) : null;

  return (
    <Panel title="Signatures" description="3 signatures obligatoires (code PIN pour le chauffeur et le convoyeur).">
      {!readOnly && !insp.ready_to_sign && (
        <div className={cn("mb-4 rounded-lg border p-3 text-sm", toneSurface("warning"))}>
          <p className="font-medium">Signature impossible pour l&apos;instant. Il manque :</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-foreground">
            {missing.length ? missing.map((m) => <li key={m}>{m}</li>) : <li>Éléments en cours d&apos;enregistrement…</li>}
          </ul>
        </div>
      )}
      {!readOnly && insp.signatures.length > 0 && (
        <p className="mb-4 text-xs text-muted-foreground">
          Toute modification (point, photo, compteur, observation) efface les signatures déjà recueillies.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {SIGNATURE_ROLES.map((role) => {
          const signature = insp.signatures.find((s) => s.role === role);
          const person = signature?.signer_name ?? personFor(role);
          const noPerson = role !== "station_manager" && !(role === "driver" ? insp.driver_id : insp.conveyor_id);
          return (
            <div key={role} className="flex flex-col gap-3 rounded-lg border bg-surface-sunken p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{signatureRoleLabels[role]}</p>
                  <p className="truncate text-sm font-semibold">{person ?? "Non assigné"}</p>
                </div>
                {signature ? (
                  <StatusBadge tone="success">Signé à {formatTime(signature.signed_at)}</StatusBadge>
                ) : (
                  <StatusBadge tone="warning">En attente</StatusBadge>
                )}
              </div>
              {!readOnly && !signature && noPerson && staff && (
                <CrewSelect
                  role={role as "driver" | "conveyor"}
                  options={role === "driver" ? staff.driver : staff.conveyor}
                  onSelect={(personId) => mutate(() => updateInspection(insp.id, role === "driver" ? { driver_id: personId } : { conveyor_id: personId }))}
                />
              )}
              {!readOnly && !signature && (
                <Button variant={role === "station_manager" ? "default" : "outline"} className="mt-auto w-full" disabled={!insp.ready_to_sign || noPerson} onClick={() => openDialog(role)}>
                  {role === "station_manager" ? <PenLine className="size-4" /> : <KeyRound className="size-4" />}
                  {role === "station_manager" ? "Signer" : "Signer avec le PIN"}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={dialogRole !== null} onOpenChange={(open) => !open && !submitting && setDialogRole(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{dialogRole === "station_manager" ? "Signer l'état des lieux" : `Signature du ${dialogRole ? signatureRoleLabels[dialogRole].toLowerCase() : ""}`}</DialogTitle>
            <DialogDescription>
              {dialogRole === "station_manager"
                ? `Vous signez en tant que chef de gare (${userName}). Vous attestez l'exactitude des points, des photos et du compteur.`
                : `Passez le téléphone à ${dialogPerson ?? "la personne concernée"} : il ou elle saisit son code PIN personnel.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4" autoComplete="off">
            {dialogRole && dialogRole !== "station_manager" && (
              <Field label="Code PIN" htmlFor="signature-pin" hint="4 à 6 chiffres.">
                <Input
                  id="signature-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4,6}"
                  minLength={4}
                  maxLength={6}
                  autoComplete="new-password"
                  autoFocus
                  className="h-12 text-center text-lg tracking-[0.5em] tabular"
                  aria-invalid={error ? true : undefined}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </Field>
            )}
            {error && <p className={cn("text-sm font-medium", toneText("danger"))}>{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogRole(null)} disabled={submitting}>
                Annuler
              </Button>
              <Button type="submit" disabled={submitting || (dialogRole !== "station_manager" && pin.length < 4)}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />}
                Signer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function CrewSelect({ role, options, onSelect }: { role: "driver" | "conveyor"; options: Driver[]; onSelect: (id: number) => void }) {
  const items = Object.fromEntries(options.map((d) => [String(d.id), fullName(d)]));
  return (
    <Select items={items} value={null} onValueChange={(v) => v && onSelect(Number(v))}>
      <SelectTrigger size="sm" aria-label={`Assigner un ${signatureRoleLabels[role].toLowerCase()}`}>
        <SelectValue placeholder={`Assigner un ${signatureRoleLabels[role].toLowerCase()}`} />
      </SelectTrigger>
      <SelectContent>
        {options.map((d) => (
          <SelectItem key={d.id} value={String(d.id)}>
            {fullName(d)}
            {!d.has_pin && <span className="text-xs text-warning">sans PIN</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ───────────────────────── Bilan du jour (arrivée) ───────────────────────── */

function daysTone(days: number | null): Tone | undefined {
  if (days === null) return undefined;
  if (days < 0) return "danger";
  if (days < 30) return "warning";
  return undefined;
}

function DayReportSection({ report, vehicleId }: { report: DayReport; vehicleId: number }) {
  const oil = report.deadlines.oil_change_due_in_km;
  const oilTone: Tone | undefined = oil === null ? undefined : oil < 0 ? "danger" : oil < 1000 ? "warning" : undefined;
  const fuel = [report.fuel_level ? fuelLevelLabels[report.fuel_level] : null, report.fuel_liters !== null ? formatNumber(report.fuel_liters, "L") : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[0.9375rem] font-semibold tracking-tight">Bilan du jour</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Synthèse de la journée du car, du départ à l&apos;arrivée.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Km du jour" value={formatNumber(report.km_of_day, "km")} icon={Route} />
        <StatCard label="Carburant" value={fuel || "—"} icon={Fuel} />
        <StatCard
          label="Dépenses du jour"
          value={formatMoney(report.day_expenses.total)}
          hint={`Carburant ${formatMoney(report.day_expenses.fuel)} · Péages ${formatMoney(report.day_expenses.tolls)}`}
          className="col-span-2 lg:col-span-1"
        />
        <Panel title="Échéances" className="col-span-2 lg:col-span-1" bodyClassName="p-4">
          <DetailList
            items={[
              {
                label: "Vidange",
                value: (
                  <span className={oilTone ? toneText(oilTone) : undefined}>
                    {oil === null ? "—" : oil < 0 ? `dépassée de ${formatNumber(-oil, "km")}` : `dans ${formatNumber(oil, "km")}`}
                  </span>
                ),
              },
              ...report.deadlines.documents.map((d) => {
                const tone = daysTone(d.days_left);
                return {
                  label: documentTypeLabels[d.type] ?? d.type,
                  value: (
                    <span className={tone ? toneText(tone) : undefined}>
                      {d.days_left === null ? "Non renseigné" : d.days_left < 0 ? `expiré depuis ${-d.days_left} j` : `${d.days_left} j`}
                    </span>
                  ),
                };
              }),
            ]}
          />
        </Panel>
      </div>

      <Panel
        flush
        title="Liste des besoins du car"
        actions={
          <Link href={`/needs?vehicle_id=${vehicleId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Voir tous les besoins
          </Link>
        }
      >
        {report.needs.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Aucun besoin ouvert" description="Les réserves et KO des états des lieux validés apparaissent ici." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Priorité</TableHead>
                <TableHead>Besoin</TableHead>
                <TableHead className="hidden md:table-cell">Origine</TableHead>
                <TableHead className="text-right">Coût estimé</TableHead>
                <TableHead className="hidden sm:table-cell">Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.needs.map((n) => (
                <TableRow key={n.id}>
                  <TableCell>
                    <StatusBadge tone={needPriority[n.priority].tone}>{needPriority[n.priority].label}</StatusBadge>
                  </TableCell>
                  <TableCell className="max-w-64">
                    <p className="truncate font-medium">{n.title}</p>
                    <p className="truncate text-xs text-muted-foreground md:hidden">{n.origin_label ?? needOriginLabels[n.origin]}</p>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{n.origin_label ?? needOriginLabels[n.origin]}</TableCell>
                  <TableCell className="text-right font-medium tabular">{formatMoney(n.estimated_cost)}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <StatusBadge tone={needStatus[n.status].tone}>{needStatus[n.status].label}</StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
                <TableCell colSpan={2} className="font-medium">
                  Total à prévoir
                </TableCell>
                <TableCell className="hidden md:table-cell" />
                <TableCell className="text-right font-semibold tabular">{formatMoney(report.needs_total)}</TableCell>
                <TableCell className="hidden sm:table-cell" />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </Panel>
    </section>
  );
}
