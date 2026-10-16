"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CreditCard, Landmark, Plus, Search, Trash2, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Field, PageHeader, Panel, Plate, StatCard, Toolbar } from "@/components/app/primitives";
import {
  createTollExpense,
  deleteTollExpense,
  listTollExpenses,
  listVehicles,
  updateTollExpense,
  api,
} from "@/lib/api";
import { tollMethodLabels } from "@/lib/labels";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { Driver, TollExpense, TollPaymentMethod, Vehicle } from "@/types";
import { toast } from "sonner";

const driverName = (d: Driver) => `${d.first_name} ${d.last_name}`.trim();

const emptyForm = {
  vehicle_id: "",
  driver_id: "",
  toll_name: "",
  amount: "",
  payment_method: "cash" as TollPaymentMethod,
  expense_date: new Date().toISOString().slice(0, 10),
  mileage: "",
  notes: "",
};

export default function TollsPage() {
  const [tolls, setTolls] = useState<TollExpense[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [tollsRes, vehiclesRes, driversRes] = await Promise.all([
        listTollExpenses(),
        listVehicles(),
        api.get<Driver[]>("/drivers"),
      ]);
      setTolls(tollsRes);
      setVehicles(vehiclesRes.items);
      setDrivers(driversRes);
    } catch (err: any) {
      toast.error(err.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function update(key: keyof typeof emptyForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreateDialog() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(toll: TollExpense) {
    setEditingId(toll.id);
    setForm({
      vehicle_id: String(toll.vehicle_id),
      driver_id: toll.driver_id ? String(toll.driver_id) : "",
      toll_name: toll.toll_name,
      amount: String(toll.amount),
      payment_method: toll.payment_method,
      expense_date: toll.expense_date.slice(0, 10),
      mileage: toll.mileage ? String(toll.mileage) : "",
      notes: toll.notes || "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vehicle_id || !form.toll_name || !form.amount) {
      toast.error("Véhicule, nom du péage et montant sont requis");
      return;
    }
    setSaving(true);
    try {
      const body = {
        vehicle_id: Number(form.vehicle_id),
        driver_id: form.driver_id ? Number(form.driver_id) : null,
        toll_name: form.toll_name,
        amount: Number(form.amount),
        payment_method: form.payment_method,
        expense_date: form.expense_date,
        mileage: form.mileage ? Number(form.mileage) : null,
        notes: form.notes || null,
      };
      if (editingId) {
        await updateTollExpense(editingId, body as any);
        toast.success("Dépense de péage mise à jour");
      } else {
        await createTollExpense(body as any);
        toast.success("Dépense de péage ajoutée");
      }
      setDialogOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Supprimer cette dépense de péage ?")) return;
    try {
      await deleteTollExpense(id);
      setTolls((prev) => prev.filter((t) => t.id !== id));
      toast.success("Dépense supprimée");
    } catch (err: any) {
      toast.error(err.message || "Erreur de suppression");
    }
  }

  const filteredTolls = useMemo(() => {
    return tolls.filter((t) => {
      const matchesSearch = !search || t.toll_name.toLowerCase().includes(search.toLowerCase());
      const matchesVehicle = !vehicleFilter || t.vehicle_id === Number(vehicleFilter);
      return matchesSearch && matchesVehicle;
    });
  }, [tolls, search, vehicleFilter]);

  const totalAmount = useMemo(() => tolls.reduce((sum, t) => sum + Number(t.amount), 0), [tolls]);

  const totalThisMonth = useMemo(() => {
    const now = new Date();
    return tolls
      .filter((t) => {
        const d = new Date(t.expense_date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }, [tolls]);

  const badgeCount = useMemo(() => tolls.filter((t) => t.payment_method === "badge").length, [tolls]);

  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const driverById = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
  const hasFilters = Boolean(search || vehicleFilter);

  // Libellés affichés dans les déclencheurs de Select (sinon la valeur brute — un id — apparaît).
  const vehicleItems = useMemo(
    () => Object.fromEntries(vehicles.map((v) => [String(v.id), `${v.registration} — ${v.brand} ${v.model}`])),
    [vehicles]
  );
  const vehicleFilterItems = useMemo(() => ({ "": "Tous les véhicules", ...vehicleItems }), [vehicleItems]);
  const driverItems = useMemo(
    () => ({ "": "Aucun", ...Object.fromEntries(drivers.map((d) => [String(d.id), driverName(d)])) }),
    [drivers]
  );

  return (
    <AppShell>
      <PageHeader
        title="Péages"
        description={`${tolls.length} dépense(s) enregistrée(s)`}
        actions={
          <Button onClick={openCreateDialog}>
            <Plus className="size-4" />
            Nouvelle dépense
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Passages enregistrés" value={formatNumber(tolls.length)} icon={Landmark} />
        <StatCard label="Montant total" value={formatMoney(totalAmount)} icon={Wallet} />
        <StatCard label="Ce mois" value={formatMoney(totalThisMonth)} icon={CalendarDays} />
        <StatCard
          label="Via badge / télépéage"
          value={formatNumber(badgeCount)}
          hint={tolls.length ? `${Math.round((badgeCount / tolls.length) * 100)} % des passages` : undefined}
          icon={CreditCard}
        />
      </div>

      <Panel flush>
        <Toolbar className="justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
            <Input
              placeholder="Rechercher un péage…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <Select items={vehicleFilterItems} value={vehicleFilter} onValueChange={(v) => setVehicleFilter(v || "")}>
            <SelectTrigger className="h-9 w-full sm:w-60">
              <SelectValue placeholder="Tous les véhicules" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Tous les véhicules</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={String(v.id)}>
                  {v.registration} — {v.brand} {v.model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Toolbar>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredTolls.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title={hasFilters ? "Aucune dépense ne correspond" : "Aucune dépense de péage"}
            description={hasFilters ? "Modifiez la recherche ou le filtre véhicule." : "Enregistrez un premier passage pour suivre les frais de péage."}
            action={
              !hasFilters ? (
                <Button onClick={openCreateDialog}>
                  <Plus className="size-4" />
                  Nouvelle dépense
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Péage</TableHead>
                <TableHead>Véhicule</TableHead>
                <TableHead className="hidden lg:table-cell">Conducteur</TableHead>
                <TableHead className="hidden md:table-cell">Paiement</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTolls.map((toll) => {
                const vehicle = vehicleById.get(toll.vehicle_id);
                const driver = toll.driver_id ? driverById.get(toll.driver_id) : undefined;
                return (
                  <TableRow key={toll.id} className="cursor-pointer" onClick={() => openEditDialog(toll)}>
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular">
                      {formatDate(toll.expense_date, "short")}
                    </TableCell>
                    <TableCell className="font-medium">{toll.toll_name}</TableCell>
                    <TableCell>
                      {vehicle ? (
                        <div className="flex items-center gap-2">
                          <Plate value={vehicle.registration} size="sm" />
                          <span className="hidden truncate text-muted-foreground xl:inline">
                            {vehicle.brand} {vehicle.model}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Véhicule #{toll.vehicle_id}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {driver ? driverName(driver) : "—"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {tollMethodLabels[toll.payment_method] ?? toll.payment_method}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular">{formatMoney(toll.amount)}</TableCell>
                    <TableCell className="pr-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Supprimer la dépense"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(toll.id);
                        }}
                        className="text-subtle-foreground hover:text-danger"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier la dépense" : "Nouvelle dépense de péage"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Véhicule" required>
                <Select items={vehicleItems} value={form.vehicle_id} onValueChange={(v) => { if (v) update("vehicle_id", v); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sélectionner un véhicule" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.registration} — {v.brand} {v.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Conducteur">
                <Select items={driverItems} value={form.driver_id} onValueChange={(v) => update("driver_id", v || "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Aucun" />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.first_name} {d.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Nom du péage" htmlFor="toll_name" required className="sm:col-span-2">
                <Input
                  id="toll_name"
                  required
                  placeholder="Ex : Péage Autoroute A1"
                  value={form.toll_name}
                  onChange={(e) => update("toll_name", e.target.value)}
                />
              </Field>
              <Field label="Montant (FCFA)" htmlFor="amount" required>
                <Input
                  id="amount"
                  type="number"
                  required
                  value={form.amount}
                  onChange={(e) => update("amount", e.target.value)}
                />
              </Field>
              <Field label="Moyen de paiement">
                <Select items={tollMethodLabels} value={form.payment_method} onValueChange={(v) => { if (v) update("payment_method", v); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(tollMethodLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Date" htmlFor="expense_date" required>
                <Input
                  id="expense_date"
                  type="date"
                  required
                  value={form.expense_date}
                  onChange={(e) => update("expense_date", e.target.value)}
                />
              </Field>
              <Field label="Kilométrage" htmlFor="mileage">
                <Input
                  id="mileage"
                  type="number"
                  value={form.mileage}
                  onChange={(e) => update("mileage", e.target.value)}
                />
              </Field>
              <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
                <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
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
