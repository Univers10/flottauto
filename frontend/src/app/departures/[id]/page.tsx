"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { BellRing, BusFront, CircleAlert, ClipboardCheck, Pencil, Printer, XCircle } from "lucide-react";
import { AppShell, useCurrentUser } from "@/components/layout/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DetailList, EmptyState, Field, PageHeader, Panel, Plate, StatusBadge, toneText } from "@/components/app/primitives";
import {
  api,
  cancelDeparture,
  createInspection,
  getDeparture,
  getInspection,
  getVehicle,
  issueExitPass,
  listReplacements,
  markDeparted,
  notifySupervisor,
  replaceDepartureVehicle,
  updateDeparture,
} from "@/lib/api";
import { checklistItemTone, departureLight, departureStatus, inspectionVerdict, type Tone } from "@/lib/labels";
import { canRunInspections } from "@/lib/roles";
import { formatDate, formatNumber, fullName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Departure, Driver, Inspection, ReplacementProposal, Vehicle } from "@/types";
import { toast } from "sonner";

/* ───────────────────────── Utilitaires ───────────────────────── */

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return `${formatDate(value)} · ${formatTime(value)}`;
}

/** Valeur pour un champ datetime-local (heure locale). */
function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const borderTone: Record<Tone, string> = {
  success: "border-success-border",
  warning: "border-warning-border",
  danger: "border-danger-border",
  info: "border-info-border",
  neutral: "border-neutral-border",
};

const NONE = "none";

/* ───────────────────────── Page ───────────────────────── */

export default function DepartureDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell>
      <DepartureDetail id={Number(params.id)} />
    </AppShell>
  );
}

function DepartureDetail({ id }: { id: number }) {
  const router = useRouter();
  const user = useCurrentUser();
  const canEdit = !!user && canRunInspections(user.role);
  const [departure, setDeparture] = useState<Departure | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [replacements, setReplacements] = useState<ReplacementProposal[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<ReplacementProposal | null>(null);

  const refreshRelated = useCallback(async (dep: Departure) => {
    const [veh, insp] = await Promise.all([
      getVehicle(dep.vehicle_id).catch(() => null),
      dep.inspection_id ? getInspection(dep.inspection_id).catch(() => null) : Promise.resolve(null),
    ]);
    setVehicle(veh);
    setInspection(insp);
    if (needsReplacement(dep)) {
      setReplacements(await listReplacements(dep.id).catch(() => []));
    } else {
      setReplacements(null);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const dep = await getDeparture(id);
      setDeparture(dep);
      await refreshRelated(dep);
    } catch (err: any) {
      setNotFound(true);
      toast.error(err.message || "Départ introuvable");
    } finally {
      setLoading(false);
    }
  }, [id, refreshRelated]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(op: () => Promise<Departure>, success: string) {
    setBusy(true);
    try {
      const next = await op();
      setDeparture(next);
      toast.success(success);
      await refreshRelated(next);
      return true;
    } catch (err: any) {
      toast.error(err.message || "Action impossible");
      load();
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loading && !departure) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-2/3" />
        <div className="grid gap-4 xl:grid-cols-3">
          <Skeleton className="h-96 rounded-xl xl:col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!departure || notFound) {
    return (
      <Panel>
        <EmptyState
          icon={BusFront}
          title="Départ introuvable"
          description="Il a peut-être été supprimé ou n'appartient pas à votre société."
          action={
            <Link href="/departures" className={buttonVariants({ variant: "outline" })}>
              Retour aux départs
            </Link>
          }
        />
      </Panel>
    );
  }

  const dep = departure;
  const registration = vehicle?.registration ?? `#${dep.vehicle_id}`;
  const st = departureStatus[dep.status];
  const active = dep.status === "planned" || dep.status === "authorized";
  const checklist = dep.checklist;
  const light = checklist ? departureLight[checklist.status] : null;
  const isRed = checklist?.status === "red";
  const isAuthorized = dep.status === "authorized";
  const showReplacement = needsReplacement(dep);

  async function openInspection() {
    if (dep.inspection_id) {
      router.push(`/inspections/${dep.inspection_id}`);
      return;
    }
    setBusy(true);
    try {
      const insp = await createInspection({ vehicle_id: dep.vehicle_id, kind: "departure", departure_id: dep.id });
      router.push(`/inspections/${insp.id}`);
    } catch (err: any) {
      toast.error(err.message || "Ouverture de l'état des lieux impossible");
      setBusy(false);
    }
  }

  async function handleNotify() {
    setBusy(true);
    try {
      await notifySupervisor(dep.id);
      toast.success("Superviseur prévenu");
    } catch (err: any) {
      toast.error(err.message || "Notification impossible");
    } finally {
      setBusy(false);
    }
  }

  async function confirmReplace() {
    if (!pendingReplace) return;
    const ok = await run(() => replaceDepartureVehicle(dep.id, pendingReplace.vehicle.id), "Car affecté : faites son état des lieux");
    if (ok) setPendingReplace(null);
  }

  async function confirmCancel() {
    const ok = await run(() => cancelDeparture(dep.id), "Départ annulé");
    if (ok) setCancelOpen(false);
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            Départ
            <Plate value={registration} size="lg" />
          </span>
        }
        description={[formatDate(dep.scheduled_at, "long"), dep.route_label, `Départ prévu ${formatTime(dep.scheduled_at)}`].filter(Boolean).join(" · ")}
        breadcrumb={[{ label: "Départs", href: "/departures" }, { label: registration }]}
        actions={
          <>
            <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
            {canEdit && active && (
              <>
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="size-4" />
                  Modifier
                </Button>
                <Button variant="destructive" onClick={() => setCancelOpen(true)}>
                  <XCircle className="size-4" />
                  Annuler le départ
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {checklist && light ? (
            <article className={cn("overflow-hidden rounded-xl border-[1.5px] bg-card shadow-card", borderTone[light.tone])}>
              <div className="flex flex-col gap-4 px-5 pt-5 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    <span>Car</span>
                    <Plate value={registration} size="sm" />
                    {dep.route_label && <span>· {dep.route_label}</span>}
                    <span className="tabular">· {formatTime(dep.scheduled_at)}</span>
                  </p>
                  <p className={cn("text-2xl font-bold tracking-tight", toneText(light.tone))}>{light.headline}</p>
                </div>
                {isAuthorized && dep.exit_pass_number ? (
                  <div className="shrink-0 sm:text-right">
                    <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Bon de sortie</p>
                    <p className="font-mono text-sm font-semibold tabular">{dep.exit_pass_number}</p>
                    <p className="text-xs text-muted-foreground tabular">Valable jusqu&apos;à {formatTime(dep.exit_pass_valid_until)}</p>
                  </div>
                ) : isRed && checklist.blocking_reason ? (
                  <div className="max-w-sm shrink-0 sm:text-right">
                    <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Motif</p>
                    <p className={cn("text-sm font-medium", toneText("danger"))}>{checklist.blocking_reason}</p>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-x-8 gap-y-5 border-t px-5 py-4 md:grid-cols-2">
                {checklist.groups.map((group) => (
                  <div key={group.key} className="min-w-0">
                    <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{group.label}</p>
                    <ul className="divide-y">
                      {group.items.map((item) => (
                        <li key={item.code} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="min-w-0">{item.label}</span>
                          <StatusBadge tone={checklistItemTone[item.status]} className="max-w-[60%]">
                            <span className="truncate">{item.detail || (item.status === "ok" ? "OK" : "—")}</span>
                          </StatusBadge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {canEdit && active && (
                <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-surface-sunken px-5 py-3">
                  {isAuthorized ? (
                    <>
                      <Link href={`/departures/${dep.id}/pass`} className={buttonVariants({ variant: "outline" })}>
                        <Printer className="size-4" />
                        Imprimer le bon de sortie (QR)
                      </Link>
                      <Button disabled={busy} onClick={() => run(() => markDeparted(dep.id), "Départ enregistré")}>
                        <BusFront className="size-4" />
                        Marquer parti
                      </Button>
                    </>
                  ) : isRed ? (
                    <>
                      {!showReplacement && (
                        <Button variant="outline" disabled={busy} onClick={handleNotify}>
                          <BellRing className="size-4" />
                          Prévenir le superviseur
                        </Button>
                      )}
                      <Button disabled={busy} onClick={openInspection}>
                        <ClipboardCheck className="size-4" />
                        Faire l&apos;état des lieux
                      </Button>
                    </>
                  ) : (
                    <Button disabled={busy} onClick={() => run(() => issueExitPass(dep.id), "Bon de sortie émis")}>
                      {checklist.status === "orange" && <CircleAlert className="size-4" />}
                      Émettre le bon de sortie
                    </Button>
                  )}
                </div>
              )}
              {!canEdit && isAuthorized && (
                <div className="flex justify-end border-t bg-surface-sunken px-5 py-3">
                  <Link href={`/departures/${dep.id}/pass`} className={buttonVariants({ variant: "outline" })}>
                    <Printer className="size-4" />
                    Imprimer le bon de sortie (QR)
                  </Link>
                </div>
              )}
            </article>
          ) : (
            <Panel>
              <EmptyState
                icon={BusFront}
                title={dep.status === "departed" ? `Parti à ${formatTime(dep.departed_at)}` : "Départ annulé"}
                description="Les vérifications ne sont plus calculées pour un départ parti ou annulé."
              />
            </Panel>
          )}

          <Panel title="Détails du départ">
            <DetailList
              items={[
                { label: "Car", value: vehicle ? `${vehicle.registration} — ${vehicle.brand} ${vehicle.model}` : registration },
                { label: "Ligne", value: dep.route_label || "—" },
                { label: "Départ prévu", value: formatDateTime(dep.scheduled_at) },
                { label: "Distance de l'étape", value: dep.distance_km !== null ? formatNumber(dep.distance_km, "km") : "—" },
                { label: "Chauffeur", value: dep.driver ? fullName(dep.driver) : "Non assigné" },
                { label: "Convoyeur", value: dep.conveyor ? fullName(dep.conveyor) : "Non assigné" },
                { label: "Bon de sortie", value: dep.exit_pass_number ? <span className="font-mono">{dep.exit_pass_number}</span> : "—" },
                { label: "Émis le", value: formatDateTime(dep.exit_pass_issued_at) },
                { label: "Valable jusqu'à", value: formatDateTime(dep.exit_pass_valid_until) },
                { label: "Parti à", value: formatDateTime(dep.departed_at) },
              ]}
            />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="État des lieux" description="Contrôle du car avant la mise en ligne, signé par code PIN.">
            {dep.inspection_id ? (
              <div className="space-y-4">
                {inspection && (
                  <DetailList
                    items={[
                      { label: "Numéro", value: <span className="font-mono">{inspection.number}</span> },
                      { label: "Statut", value: inspection.status === "validated" ? "Validé" : "En cours" },
                      {
                        label: "Verdict",
                        value: inspection.verdict ? (
                          <StatusBadge tone={inspectionVerdict[inspection.verdict].tone}>{inspectionVerdict[inspection.verdict].label}</StatusBadge>
                        ) : (
                          "—"
                        ),
                      },
                      { label: "Note", value: inspection.score !== null ? `${inspection.score}/100` : "—" },
                    ]}
                  />
                )}
                <Link href={`/inspections/${dep.inspection_id}`} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                  <ClipboardCheck className="size-4" />
                  Ouvrir l&apos;état des lieux
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Aucun état des lieux n&apos;est rattaché à ce départ.</p>
                {canEdit && active && (
                  <Button className="w-full" disabled={busy} onClick={openInspection}>
                    <ClipboardCheck className="size-4" />
                    Faire l&apos;état des lieux
                  </Button>
                )}
              </div>
            )}
          </Panel>

          {showReplacement && (
            <Panel title="Remplacement proposé" description="Cars disponibles dont les papiers et l'entretien sont en règle.">
              <div className="space-y-4">
                {replacements === null ? (
                  <Skeleton className="h-20" />
                ) : replacements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun car de remplacement disponible.</p>
                ) : (
                  <ul className="divide-y">
                    {replacements.map((r) => (
                      <li key={r.vehicle.id} className="space-y-2 py-3 first:pt-0">
                        <div className="flex items-center gap-2">
                          <Plate value={r.vehicle.registration} size="sm" />
                          <span className="truncate text-sm font-medium">
                            {r.vehicle.brand} {r.vehicle.model}
                          </span>
                        </div>
                        <ul className="space-y-0.5 text-xs text-muted-foreground">
                          <li className={r.documents_status === "ok" ? toneText("success") : toneText("warning")}>
                            {r.documents_status === "ok" ? "Papiers à jour" : "Papiers : échéance proche"}
                          </li>
                          <li>{r.last_score !== null ? `Dernier état des lieux ${r.last_score}/100` : "Aucun état des lieux"}</li>
                          {r.oil_change_due_in_km !== null && <li>Vidange dans {formatNumber(r.oil_change_due_in_km, "km")}</li>}
                        </ul>
                        {canEdit && (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => setPendingReplace(r)}>
                            Affecter ce car
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {canEdit && (
                  <Button variant="outline" className="w-full" disabled={busy} onClick={handleNotify}>
                    <BellRing className="size-4" />
                    Prévenir le superviseur
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">Alertes envoyées à J-30, J-15, J-7 et J-1 avant l&apos;échéance.</p>
              </div>
            </Panel>
          )}
        </div>
      </div>

      {editOpen && (
        <EditDepartureDialog
          departure={dep}
          onClose={() => setEditOpen(false)}
          onSaved={async (next) => {
            const revoked = dep.status === "authorized" && next.status !== "authorized";
            setDeparture(next);
            setEditOpen(false);
            toast.success("Départ modifié");
            if (revoked) toast.info("Le bon de sortie a été annulé : émettez-en un nouveau.");
            await refreshRelated(next);
          }}
        />
      )}

      <Dialog open={cancelOpen} onOpenChange={(open) => !open && !busy && setCancelOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Annuler ce départ ?</DialogTitle>
            <DialogDescription>Le bon de sortie éventuel sera invalidé. Cette action est définitive.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={busy}>
              Retour
            </Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={busy}>
              Annuler le départ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingReplace !== null} onOpenChange={(open) => !open && !busy && setPendingReplace(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Affecter ce car ?</DialogTitle>
            <DialogDescription>
              {pendingReplace && (
                <>
                  Le car {pendingReplace.vehicle.registration} remplace {registration} sur ce départ. Un nouvel état des lieux sera nécessaire.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingReplace(null)} disabled={busy}>
              Retour
            </Button>
            <Button onClick={confirmReplace} disabled={busy}>
              Affecter ce car
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Rouge à cause des papiers ou du car : un remplacement a du sens. */
function needsReplacement(dep: Departure): boolean {
  if (!dep.checklist || dep.checklist.status !== "red") return false;
  if (dep.status !== "planned" && dep.status !== "authorized") return false;
  return dep.checklist.groups.some((g) => (g.key === "papers" || g.key === "vehicle") && g.items.some((i) => i.status === "blocked"));
}

/* ───────────────────────── Modification ───────────────────────── */

function EditDepartureDialog({
  departure: dep,
  onClose,
  onSaved,
}: {
  departure: Departure;
  onClose: () => void;
  onSaved: (next: Departure) => void;
}) {
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(dep.scheduled_at));
  const [routeLabel, setRouteLabel] = useState(dep.route_label ?? "");
  const [distance, setDistance] = useState(dep.distance_km !== null ? String(dep.distance_km) : "");
  const [driverId, setDriverId] = useState(dep.driver_id ? String(dep.driver_id) : NONE);
  const [conveyorId, setConveyorId] = useState(dep.conveyor_id ? String(dep.conveyor_id) : NONE);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [conveyors, setConveyors] = useState<Driver[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<Driver[]>("/drivers?staff_type=driver")
      .then((res) => setDrivers(res.filter((d) => d.is_active || d.id === dep.driver_id)))
      .catch(() => toast.error("Erreur de chargement des chauffeurs"));
    api
      .get<Driver[]>("/drivers?staff_type=conveyor")
      .then((res) => setConveyors(res.filter((d) => d.is_active || d.id === dep.conveyor_id)))
      .catch(() => toast.error("Erreur de chargement des convoyeurs"));
  }, [dep.driver_id, dep.conveyor_id]);

  const personItems = (list: Driver[]): Record<string, string> => ({
    [NONE]: "Non assigné",
    ...Object.fromEntries(list.map((d) => [String(d.id), fullName(d)])),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!scheduledAt) {
      toast.error("Indiquez l'heure de départ");
      return;
    }
    const km = distance.trim() ? Number(distance) : null;
    if (km !== null && (!Number.isFinite(km) || km < 0)) {
      toast.error("Distance invalide");
      return;
    }
    // N'envoyer que les champs modifiés : changer l'équipage ou l'heure annule le bon de sortie.
    const body: Parameters<typeof updateDeparture>[1] = {};
    if (scheduledAt !== toLocalInput(dep.scheduled_at)) body.scheduled_at = `${scheduledAt}:00`;
    if ((routeLabel.trim() || null) !== dep.route_label) body.route_label = routeLabel.trim() || null;
    if (km !== dep.distance_km) body.distance_km = km;
    const nextDriver = driverId !== NONE ? Number(driverId) : null;
    const nextConveyor = conveyorId !== NONE ? Number(conveyorId) : null;
    if (nextDriver !== dep.driver_id) body.driver_id = nextDriver;
    if (nextConveyor !== dep.conveyor_id) body.conveyor_id = nextConveyor;
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      onSaved(await updateDeparture(dep.id, body));
    } catch (err: any) {
      toast.error(err.message || "Modification impossible");
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier le départ</DialogTitle>
          <DialogDescription>
            {dep.status === "authorized"
              ? "Changer l'heure ou l'équipage annule le bon de sortie émis."
              : "Ligne, horaire, distance et équipage."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Heure de départ" htmlFor="edit-scheduled-at" required>
              <Input
                id="edit-scheduled-at"
                type="datetime-local"
                className="tabular"
                required
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </Field>
            <Field label="Distance de l'étape (km)" htmlFor="edit-distance" hint="Pour vérifier le carburant">
              <Input
                id="edit-distance"
                type="number"
                inputMode="numeric"
                min={0}
                className="tabular"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
              />
            </Field>
            <Field label="Ligne" htmlFor="edit-route" className="sm:col-span-2">
              <Input id="edit-route" value={routeLabel} onChange={(e) => setRouteLabel(e.target.value)} placeholder="Abidjan → Bouaké" />
            </Field>
            <Field label="Chauffeur" htmlFor="edit-driver">
              <Select items={personItems(drivers)} value={driverId} onValueChange={(v) => setDriverId(v ? String(v) : NONE)}>
                <SelectTrigger id="edit-driver">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Non assigné</SelectItem>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {fullName(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Convoyeur" htmlFor="edit-conveyor">
              <Select items={personItems(conveyors)} value={conveyorId} onValueChange={(v) => setConveyorId(v ? String(v) : NONE)}>
                <SelectTrigger id="edit-conveyor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Non assigné</SelectItem>
                  {conveyors.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {fullName(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving || !scheduledAt}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
