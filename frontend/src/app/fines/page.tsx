"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Camera, CircleAlert, HandCoins, Plus, ReceiptText, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Field, PageHeader, Panel, SegmentButton, StatCard, StatusBadge, Toolbar } from "@/components/app/primitives";
import { api, assetUrl, listVehicles, uploadFile } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import type { Driver, Fine, FineBalance, FineStatus, RepaymentMethod, Vehicle } from "@/types";

const today = () => new Date().toISOString().slice(0, 10);
const driverName = (d: Driver) => `${d.first_name} ${d.last_name}`.trim();

const emptyFine = {
  vehicle_id: "",
  driver_id: "",
  fine_date: today(),
  place: "",
  reason: "",
  amount: "",
  charged_to_driver: true,
  status: "to_pay" as FineStatus,
  notes: "",
};

type Tab = "balances" | "fines";

export default function FinesPage() {
  const [tab, setTab] = useState<Tab>("balances");
  const [fines, setFines] = useState<Fine[]>([]);
  const [balances, setBalances] = useState<FineBalance[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | FineStatus>("all");

  const [fineOpen, setFineOpen] = useState(false);
  const [editing, setEditing] = useState<Fine | null>(null);
  const [form, setForm] = useState(emptyFine);
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [repay, setRepay] = useState<FineBalance | null>(null);
  const [repayForm, setRepayForm] = useState({ amount: "", repayment_date: today(), method: "cash" as RepaymentMethod, notes: "" });

  async function load() {
    try {
      const [f, b, v, d] = await Promise.all([
        api.get<Fine[]>("/fines"),
        api.get<FineBalance[]>("/fines/balances"),
        listVehicles({ size: 100 }),
        api.get<Driver[]>("/drivers?staff_type=driver"),
      ]);
      setFines(f);
      setBalances(b);
      setVehicles(v.items);
      setDrivers(d);
    } catch (err) {
      toast.error((err as Error).message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const vehicleItems = useMemo(() => Object.fromEntries(vehicles.map((v) => [String(v.id), v.fleet_number ? `${v.fleet_number} · ${v.registration}` : v.registration])), [vehicles]);
  const driverItems = useMemo(() => ({ "": "Aucun", ...Object.fromEntries(drivers.map((d) => [String(d.id), driverName(d)])) }), [drivers]);
  const statusItems: Record<FineStatus, string> = { to_pay: "À payer aux autorités", paid: "Payée aux autorités" };
  const methodItems: Record<RepaymentMethod, string> = { cash: "Versement", payroll: "Retenue sur salaire" };

  const totalDue = balances.reduce((s, b) => s + b.balance, 0);
  const toPay = fines.filter((f) => f.status === "to_pay");
  const visible = fines.filter((f) => statusFilter === "all" || f.status === statusFilter);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyFine, fine_date: today() });
    setPhoto(null);
    setFineOpen(true);
  }

  function openEdit(f: Fine) {
    setEditing(f);
    setForm({
      vehicle_id: String(f.vehicle_id),
      driver_id: f.driver_id ? String(f.driver_id) : "",
      fine_date: f.fine_date,
      place: f.place ?? "",
      reason: f.reason,
      amount: String(f.amount),
      charged_to_driver: f.charged_to_driver,
      status: f.status,
      notes: f.notes ?? "",
    });
    setPhoto(null);
    setFineOpen(true);
  }

  async function saveFine(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vehicle_id || !form.reason.trim() || !Number(form.amount)) {
      toast.error("Car, motif et montant sont obligatoires");
      return;
    }
    setSaving(true);
    try {
      const body = {
        vehicle_id: Number(form.vehicle_id),
        driver_id: form.driver_id ? Number(form.driver_id) : null,
        fine_date: form.fine_date,
        place: form.place.trim() || null,
        reason: form.reason.trim(),
        amount: Number(form.amount),
        charged_to_driver: form.charged_to_driver && Boolean(form.driver_id),
        status: form.status,
        notes: form.notes.trim() || null,
      };
      const saved = editing ? await api.put<Fine>(`/fines/${editing.id}`, body) : await api.post<Fine>("/fines", body);
      if (photo) {
        const fd = new FormData();
        fd.append("file", photo);
        await uploadFile<Fine>(`/fines/${saved.id}/photo`, fd);
      }
      toast.success(editing ? "Contravention modifiée" : "Contravention enregistrée");
      setFineOpen(false);
      await load();
    } catch (err) {
      toast.error((err as Error).message || "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  async function saveRepayment(e: React.FormEvent) {
    e.preventDefault();
    if (!repay || !Number(repayForm.amount)) return;
    setSaving(true);
    try {
      await api.post("/fines/repayments", {
        driver_id: repay.driver_id,
        amount: Number(repayForm.amount),
        repayment_date: repayForm.repayment_date,
        method: repayForm.method,
        notes: repayForm.notes.trim() || null,
      });
      toast.success("Remboursement enregistré");
      setRepay(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message || "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Contraventions"
        description="La compagnie paie l'amende ; le chauffeur rembourse ce qui est à sa charge."
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" />
            Nouvelle contravention
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Dû par les chauffeurs" value={formatMoney(totalDue)} icon={Wallet} tone={totalDue > 0 ? "warning" : undefined} />
        <StatCard label="À payer aux autorités" value={formatMoney(toPay.reduce((s, f) => s + f.amount, 0))} hint={`${toPay.length} contravention(s)`} icon={CircleAlert} />
        <StatCard label="Contraventions" value={String(fines.length)} icon={ReceiptText} />
      </div>

      <Panel flush>
        <Toolbar className="justify-between">
          <div className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1">
            <SegmentButton active={tab === "balances"} onClick={() => setTab("balances")} count={balances.length}>
              Soldes des chauffeurs
            </SegmentButton>
            <SegmentButton active={tab === "fines"} onClick={() => setTab("fines")} count={fines.length}>
              Contraventions
            </SegmentButton>
            {tab === "fines" ? (
              <>
                <span aria-hidden className="mx-1.5 h-5 w-px shrink-0 bg-border" />
                {(["all", "to_pay", "paid"] as const).map((s) => (
                  <SegmentButton key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                    {s === "all" ? "Toutes" : s === "to_pay" ? "À payer" : "Payées"}
                  </SegmentButton>
                ))}
              </>
            ) : null}
          </div>
        </Toolbar>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : tab === "balances" ? (
          balances.length === 0 ? (
            <EmptyState icon={Wallet} title="Aucun chauffeur ne doit de contravention" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chauffeur</TableHead>
                  <TableHead className="text-right">Amendes à sa charge</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Remboursé</TableHead>
                  <TableHead className="text-right">Reste dû</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map((b) => (
                  <TableRow key={b.driver_id}>
                    <TableCell>
                      <Link href={`/drivers/${b.driver_id}`} className="font-medium hover:underline">
                        {b.driver_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{b.fines} contravention(s)</p>
                    </TableCell>
                    <TableCell className="text-right tabular">{formatMoney(b.charged)}</TableCell>
                    <TableCell className="hidden text-right tabular sm:table-cell">{formatMoney(b.repaid)}</TableCell>
                    <TableCell className="text-right font-semibold tabular">{formatMoney(b.balance)}</TableCell>
                    <TableCell className="pr-4 text-right">
                      {b.balance > 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRepayForm({ amount: "", repayment_date: today(), method: "cash", notes: "" });
                            setRepay(b);
                          }}
                        >
                          <HandCoins className="size-4" />
                          Rembourser
                        </Button>
                      ) : (
                        <StatusBadge tone="success">Soldé</StatusBadge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        ) : visible.length === 0 ? (
          <EmptyState icon={ReceiptText} title="Aucune contravention" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Motif</TableHead>
                <TableHead className="hidden md:table-cell">Car</TableHead>
                <TableHead className="hidden sm:table-cell">Chauffeur</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((f) => (
                <TableRow key={f.id} className="cursor-pointer" onClick={() => openEdit(f)}>
                  <TableCell className="tabular">{formatDate(f.fine_date)}</TableCell>
                  <TableCell>
                    <p className="font-medium">{f.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.place || "—"}
                      {f.photo_url ? " · PV joint" : ""}
                    </p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{f.vehicle_label ?? "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {f.driver_name ?? "—"}
                    {f.driver_id && !f.charged_to_driver ? <p className="text-xs text-muted-foreground">Payée par la compagnie</p> : null}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular">{formatMoney(f.amount)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={f.status === "paid" ? "success" : "warning"}>{f.status === "paid" ? "Payée" : "À payer"}</StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Dialog open={fineOpen} onOpenChange={setFineOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier la contravention" : "Nouvelle contravention"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveFine} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Car" required>
                <Select items={vehicleItems} value={form.vehicle_id} onValueChange={(v) => v && setForm({ ...form, vehicle_id: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir le car" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {vehicleItems[String(v.id)]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Chauffeur">
                <Select items={driverItems} value={form.driver_id} onValueChange={(v) => setForm({ ...form, driver_id: v || "" })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Aucun" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Aucun</SelectItem>
                    {drivers.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {driverName(d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Date" htmlFor="fine_date" required>
                <Input id="fine_date" type="date" required value={form.fine_date} onChange={(e) => setForm({ ...form, fine_date: e.target.value })} />
              </Field>
              <Field label="Montant (FCFA)" htmlFor="amount" required>
                <Input id="amount" type="number" min={1} required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </Field>
              <Field label="Motif" htmlFor="reason" required className="sm:col-span-2">
                <Input id="reason" required placeholder="Ex : excès de vitesse, surcharge" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </Field>
              <Field label="Lieu" htmlFor="place">
                <Input id="place" placeholder="Ex : poste de Singrobo" value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} />
              </Field>
              <Field label="Statut">
                <Select items={statusItems} value={form.status} onValueChange={(v) => v && setForm({ ...form, status: v as FineStatus })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusItems).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
                <span>
                  <span className="block text-sm font-medium">À la charge du chauffeur</span>
                  <span className="block text-xs text-muted-foreground">Ajoutée à sa dette ; sinon la compagnie la garde.</span>
                </span>
                <Switch
                  checked={form.charged_to_driver && Boolean(form.driver_id)}
                  disabled={!form.driver_id}
                  onCheckedChange={(v) => setForm({ ...form, charged_to_driver: v })}
                />
              </label>
              <Field label="Photo du procès-verbal" htmlFor="pv" className="sm:col-span-2">
                <div className="flex items-center gap-3">
                  <Input id="pv" type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                  {editing?.photo_url ? (
                    <a href={assetUrl(editing.photo_url) ?? undefined} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-sm text-primary hover:underline">
                      <Camera className="size-4" />
                      Voir
                    </a>
                  ) : null}
                </div>
              </Field>
              <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
                <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFineOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={repay !== null} onOpenChange={(o) => !o && setRepay(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remboursement de {repay?.driver_name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveRepayment} className="space-y-4">
            <p className="text-sm text-muted-foreground">Reste dû : <span className="font-semibold text-foreground">{formatMoney(repay?.balance ?? 0)}</span></p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Montant (FCFA)" htmlFor="r_amount" required>
                <Input id="r_amount" type="number" min={1} max={repay?.balance} required value={repayForm.amount} onChange={(e) => setRepayForm({ ...repayForm, amount: e.target.value })} />
              </Field>
              <Field label="Date" htmlFor="r_date" required>
                <Input id="r_date" type="date" required value={repayForm.repayment_date} onChange={(e) => setRepayForm({ ...repayForm, repayment_date: e.target.value })} />
              </Field>
              <Field label="Moyen" className="sm:col-span-2">
                <Select items={methodItems} value={repayForm.method} onValueChange={(v) => v && setRepayForm({ ...repayForm, method: v as RepaymentMethod })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(methodItems).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Note" htmlFor="r_notes" className="sm:col-span-2">
                <Input id="r_notes" placeholder="Ex : salaire de novembre" value={repayForm.notes} onChange={(e) => setRepayForm({ ...repayForm, notes: e.target.value })} />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRepay(null)}>
                Annuler
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
