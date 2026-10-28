"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck, CircleDollarSign, ClipboardList, Hourglass, Loader2, MoreHorizontal, Plus, ShieldAlert, Wrench } from "lucide-react";
import { AppShell, useCurrentUser } from "@/components/layout/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Field, PageHeader, Panel, Plate, SegmentButton, StatCard, StatusBadge, Toolbar } from "@/components/app/primitives";
import { createNeed, createWorkOrderFromNeed, listNeeds, listVehicles, updateNeed } from "@/lib/api";
import { needOriginLabels, needPriority, needStatus } from "@/lib/labels";
import { canRunInspections, canValidateNeeds } from "@/lib/roles";
import { formatMoney } from "@/lib/format";
import type { NeedPriority, NeedStatus, Vehicle, VehicleNeed } from "@/types";
import { toast } from "sonner";

const ALL = "__all__";
const CLOSED: NeedStatus[] = ["done", "cancelled"];

type StatusFilter = "open" | "validation_requested" | "validated" | "scheduled" | "all";

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "Ouverts" },
  { value: "validation_requested", label: "Validation demandée" },
  { value: "validated", label: "Validés" },
  { value: "scheduled", label: "Planifiés" },
  { value: "all", label: "Tous" },
];

function isOpen(n: VehicleNeed) {
  return !CLOSED.includes(n.status);
}

function matchesStatus(n: VehicleNeed, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "open") return isOpen(n);
  return n.status === filter;
}

function sumCost(needs: VehicleNeed[]) {
  return needs.reduce((sum, n) => sum + Number(n.estimated_cost || 0), 0);
}

export default function NeedsPage() {
  return (
    <Suspense fallback={null}>
      <AppShell>
        <NeedsContent />
      </AppShell>
    </Suspense>
  );
}

function NeedsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useCurrentUser();
  const canWrite = user ? canRunInspections(user.role) : false;
  const canValidate = user ? canValidateNeeds(user.role) : false;

  const [needs, setNeeds] = useState<VehicleNeed[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [vehicleFilter, setVehicleFilter] = useState<string>(searchParams.get("vehicle_id") || "");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await listNeeds({
        vehicle_id: vehicleFilter ? Number(vehicleFilter) : undefined,
        priority: priorityFilter || undefined,
      });
      setNeeds(res.items);
    } catch (err: any) {
      toast.error(err.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [vehicleFilter, priorityFilter]);

  useEffect(() => {
    listVehicles({ size: 100 })
      .then((res) => setVehicles(res.items))
      .catch(() => {});
  }, []);

  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const openNeeds = useMemo(() => needs.filter(isOpen), [needs]);
  const visible = useMemo(() => needs.filter((n) => matchesStatus(n, statusFilter)), [needs, statusFilter]);

  const counts = useMemo(() => {
    const c = {} as Record<StatusFilter, number>;
    statusFilters.forEach((f) => (c[f.value] = needs.filter((n) => matchesStatus(n, f.value)).length));
    return c;
  }, [needs]);

  const beforeDeparture = openNeeds.filter((n) => n.priority === "before_departure").length;

  const vehicleItems: Record<string, string> = {
    [ALL]: "Tous les cars",
    ...Object.fromEntries(vehicles.map((v) => [String(v.id), `${v.registration} — ${v.brand} ${v.model}`])),
  };
  const priorityItems: Record<string, string> = {
    [ALL]: "Toutes les priorités",
    ...Object.fromEntries((Object.keys(needPriority) as NeedPriority[]).map((p) => [p, needPriority[p].label])),
  };

  function replaceNeed(updated: VehicleNeed) {
    setNeeds((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }

  async function changeStatus(need: VehicleNeed, status: NeedStatus, message: string) {
    setBusyId(need.id);
    try {
      replaceNeed(await updateNeed(need.id, { status }));
      toast.success(message);
    } catch (err: any) {
      toast.error(err.message || "Action impossible");
    } finally {
      setBusyId(null);
    }
  }

  async function createIntervention(need: VehicleNeed) {
    setBusyId(need.id);
    try {
      const wo = await createWorkOrderFromNeed(need.id);
      replaceNeed({ ...need, status: "scheduled", work_order_id: wo.id });
      toast.success("Intervention créée", {
        action: { label: "Ouvrir", onClick: () => router.push(`/maintenance/${wo.id}`) },
      });
    } catch (err: any) {
      toast.error(err.message || "Création de l'intervention impossible");
    } finally {
      setBusyId(null);
    }
  }

  const hasFilters = statusFilter !== "open" || !!vehicleFilter || !!priorityFilter;

  return (
    <>
      <PageHeader
        title="Besoins des cars"
        description="Ce qu'il faut prévoir sur chaque car, de l'état des lieux à l'intervention."
        actions={
          canWrite ? (
            <NeedDialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              vehicles={vehicles}
              defaultVehicleId={vehicleFilter}
              onCreated={(n) => {
                setNeeds((prev) => [...prev, n]);
                toast.success("Besoin ajouté");
              }}
            />
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Avant le départ"
          value={loading ? "—" : beforeDeparture}
          hint="Besoins ouverts bloquants"
          icon={ShieldAlert}
          tone={beforeDeparture > 0 ? "danger" : undefined}
        />
        <StatCard
          label="Validation demandée"
          value={loading ? "—" : counts.validation_requested}
          hint="En attente du superviseur"
          icon={Hourglass}
        />
        <StatCard label="Total à prévoir" value={loading ? "—" : formatMoney(sumCost(openNeeds))} hint="Coût estimé des besoins ouverts" icon={CircleDollarSign} />
        <StatCard label="Planifiés" value={loading ? "—" : counts.scheduled} hint="Intervention créée" icon={CalendarCheck} />
      </div>

      <Panel flush className="mt-6">
        <Toolbar className="flex-wrap justify-between">
          <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
            {statusFilters.map((f) => (
              <SegmentButton key={f.value} active={statusFilter === f.value} onClick={() => setStatusFilter(f.value)} count={counts[f.value]}>
                {f.label}
              </SegmentButton>
            ))}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Select items={vehicleItems} value={vehicleFilter || ALL} onValueChange={(v) => setVehicleFilter(!v || v === ALL ? "" : String(v))}>
              <SelectTrigger className="h-9 sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(vehicleItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select items={priorityItems} value={priorityFilter || ALL} onValueChange={(v) => setPriorityFilter(!v || v === ALL ? "" : String(v))}>
              <SelectTrigger className="h-9 sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(priorityItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Toolbar>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={hasFilters ? "Aucun besoin ne correspond" : "Aucun besoin ouvert"}
            description={
              hasFilters ? "Modifiez les filtres." : "Les besoins relevés lors des états des lieux ou ajoutés à la main apparaîtront ici."
            }
            action={
              !hasFilters && canWrite ? (
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="size-4" />
                  Ajouter un besoin
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden md:table-cell">Priorité</TableHead>
                <TableHead className="hidden md:table-cell">Car</TableHead>
                <TableHead>Besoin</TableHead>
                <TableHead className="hidden lg:table-cell">Origine</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Coût estimé</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((n) => {
                const vehicle = vehicleById.get(n.vehicle_id);
                const prio = needPriority[n.priority];
                const st = needStatus[n.status];
                const busy = busyId === n.id;
                const closed = !isOpen(n);
                return (
                  <TableRow key={n.id}>
                    <TableCell className="hidden md:table-cell">
                      <StatusBadge tone={prio.tone}>{prio.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Link href={`/vehicles/${n.vehicle_id}`} className="flex items-center gap-2.5 hover:underline">
                        {vehicle ? (
                          <>
                            <Plate value={vehicle.registration} size="sm" />
                            <span className="hidden truncate text-muted-foreground xl:inline">{vehicle.model}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Car #{n.vehicle_id}</span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-80 min-w-40 whitespace-normal">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5 md:hidden">
                        {vehicle && (
                          <Link href={`/vehicles/${n.vehicle_id}`}>
                            <Plate value={vehicle.registration} size="sm" />
                          </Link>
                        )}
                        <StatusBadge tone={prio.tone}>{prio.label}</StatusBadge>
                      </div>
                      <p className="font-medium">{n.title}</p>
                      {n.details && <p className="line-clamp-2 text-xs text-muted-foreground">{n.details}</p>}
                      <p className="text-xs text-muted-foreground tabular sm:hidden">
                        {n.estimated_cost != null ? formatMoney(n.estimated_cost) : "Coût non estimé"}
                      </p>
                    </TableCell>
                    <TableCell className="hidden whitespace-normal text-muted-foreground lg:table-cell max-w-56">
                      {n.inspection_id ? (
                        <Link href={`/inspections/${n.inspection_id}`} className="hover:underline">
                          {n.origin_label || needOriginLabels[n.origin]}
                        </Link>
                      ) : (
                        n.origin_label || needOriginLabels[n.origin]
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right font-medium tabular sm:table-cell">
                      {n.estimated_cost != null ? formatMoney(n.estimated_cost) : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        {busy && <Loader2 className="size-4 animate-spin text-subtle-foreground" />}
                        {canWrite && !canValidate && n.status === "open" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            title="Demander la validation au superviseur"
                            onClick={() => changeStatus(n, "validation_requested", "Validation demandée")}
                          >
                            Faire valider
                          </Button>
                        )}
                        {canValidate && (n.status === "open" || n.status === "validation_requested") && (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => changeStatus(n, "validated", "Besoin validé")}>
                            Valider
                          </Button>
                        )}
                        {canWrite && n.status === "validated" && !n.work_order_id && (
                          <Button size="sm" disabled={busy} onClick={() => createIntervention(n)}>
                            <Wrench className="size-3.5" />
                            Créer l&apos;intervention
                          </Button>
                        )}
                        {n.work_order_id && (
                          <Link href={`/maintenance/${n.work_order_id}`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                            <Wrench className="size-3.5" />
                            Intervention
                          </Link>
                        )}
                        {canWrite && !closed && (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button size="icon-sm" variant="ghost" aria-label="Autres actions" disabled={busy}>
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end" className="w-auto min-w-40">
                              {canValidate && n.status === "open" && (
                                <DropdownMenuItem onClick={() => changeStatus(n, "validation_requested", "Validation demandée")}>
                                  Demander la validation
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => changeStatus(n, "done", "Besoin marqué comme fait")}>Marquer fait</DropdownMenuItem>
                              <DropdownMenuItem variant="destructive" onClick={() => changeStatus(n, "cancelled", "Besoin annulé")}>
                                Annuler
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium">Total à prévoir</span>
                    <span className="font-semibold tabular">{formatMoney(sumCost(visible.filter(isOpen)))}</span>
                  </div>
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </Panel>
    </>
  );
}

function NeedDialog({
  open,
  onOpenChange,
  vehicles,
  defaultVehicleId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicles: Vehicle[];
  defaultVehicleId: string;
  onCreated: (need: VehicleNeed) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" />
            Ajouter un besoin
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un besoin</DialogTitle>
        </DialogHeader>
        <NeedForm vehicles={vehicles} defaultVehicleId={defaultVehicleId} onCreated={onCreated} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function NeedForm({
  vehicles,
  defaultVehicleId,
  onCreated,
  onClose,
}: {
  vehicles: Vehicle[];
  defaultVehicleId: string;
  onCreated: (need: VehicleNeed) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ vehicle_id: defaultVehicleId, title: "", priority: "this_week" as NeedPriority, estimated_cost: "", details: "" });
  const [saving, setSaving] = useState(false);

  const vehicleItems = Object.fromEntries(vehicles.map((v) => [String(v.id), `${v.registration} — ${v.brand} ${v.model}`]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vehicle_id) {
      toast.error("Choisissez un car");
      return;
    }
    if (form.title.trim().length < 2) {
      toast.error("L'intitulé doit faire au moins 2 caractères");
      return;
    }
    setSaving(true);
    try {
      const need = await createNeed({
        vehicle_id: Number(form.vehicle_id),
        title: form.title.trim(),
        details: form.details.trim() || null,
        priority: form.priority,
        estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : null,
      });
      onCreated(need);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Car" required>
        <Select items={vehicleItems} value={form.vehicle_id || null} onValueChange={(v) => setForm((f) => ({ ...f, vehicle_id: v ? String(v) : "" }))}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choisir un car" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(vehicleItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Intitulé" htmlFor="need_title" required>
        <Input
          id="need_title"
          required
          minLength={2}
          placeholder="Ex. : Remplacer les plaquettes avant"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
      </Field>
      <Field label="Priorité">
        <div className="flex flex-wrap gap-1">
          {(Object.keys(needPriority) as NeedPriority[]).map((p) => (
            <SegmentButton key={p} active={form.priority === p} onClick={() => setForm((f) => ({ ...f, priority: p }))}>
              {needPriority[p].label}
            </SegmentButton>
          ))}
        </div>
      </Field>
      <Field label="Coût estimé (FCFA)" htmlFor="need_cost" hint="Facultatif">
        <Input
          id="need_cost"
          type="number"
          min={0}
          className="tabular"
          value={form.estimated_cost}
          onChange={(e) => setForm((f) => ({ ...f, estimated_cost: e.target.value }))}
        />
      </Field>
      <Field label="Détails" htmlFor="need_details">
        <Textarea id="need_details" rows={3} value={form.details} onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Enregistrer
        </Button>
      </DialogFooter>
    </form>
  );
}
