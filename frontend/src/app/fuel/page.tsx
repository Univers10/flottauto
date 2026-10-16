"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Droplets, Fuel, Gauge, Plus, Search, Trash2, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Field, PageHeader, Panel, Plate, StatCard, Toolbar } from "@/components/app/primitives";
import {
  createFuelExpense,
  deleteFuelExpense,
  listFuelExpenses,
  listVehicles,
  updateFuelExpense,
  api,
} from "@/lib/api";
import { fuelLabels } from "@/lib/labels";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { Driver, FuelExpense, FuelType, Vehicle } from "@/types";
import { toast } from "sonner";

const driverName = (d: Driver) => `${d.first_name} ${d.last_name}`.trim();

const emptyForm = {
  vehicle_id: "",
  driver_id: "",
  fuel_type: "diesel" as FuelType,
  liters: "",
  price_per_liter: "",
  amount: "",
  full_tank: false,
  station_name: "",
  refuel_date: new Date().toISOString().slice(0, 10),
  mileage: "",
  notes: "",
};

export default function FuelPage() {
  const [refuels, setRefuels] = useState<FuelExpense[]>([]);
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
      const [fuelRes, vehiclesRes, driversRes] = await Promise.all([
        listFuelExpenses(),
        listVehicles(),
        api.get<Driver[]>("/drivers"),
      ]);
      setRefuels(fuelRes);
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

  function update(key: keyof typeof emptyForm, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreateDialog() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(refuel: FuelExpense) {
    setEditingId(refuel.id);
    setForm({
      vehicle_id: String(refuel.vehicle_id),
      driver_id: refuel.driver_id ? String(refuel.driver_id) : "",
      fuel_type: refuel.fuel_type,
      liters: String(refuel.liters),
      price_per_liter: refuel.price_per_liter ? String(refuel.price_per_liter) : "",
      amount: String(refuel.amount),
      full_tank: refuel.full_tank,
      station_name: refuel.station_name || "",
      refuel_date: refuel.refuel_date.slice(0, 10),
      mileage: refuel.mileage ? String(refuel.mileage) : "",
      notes: refuel.notes || "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vehicle_id || !form.liters) {
      toast.error("Véhicule et litres sont requis");
      return;
    }
    setSaving(true);
    try {
      const body = {
        vehicle_id: Number(form.vehicle_id),
        driver_id: form.driver_id ? Number(form.driver_id) : null,
        fuel_type: form.fuel_type,
        liters: Number(form.liters),
        price_per_liter: form.price_per_liter ? Number(form.price_per_liter) : null,
        amount: form.amount ? Number(form.amount) : null,
        full_tank: form.full_tank,
        station_name: form.station_name || null,
        refuel_date: form.refuel_date,
        mileage: form.mileage ? Number(form.mileage) : null,
        notes: form.notes || null,
      };
      if (editingId) {
        await updateFuelExpense(editingId, body as any);
        toast.success("Plein de carburant mis à jour");
      } else {
        await createFuelExpense(body as any);
        toast.success("Plein de carburant ajouté");
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
    if (!confirm("Supprimer ce plein de carburant ?")) return;
    try {
      await deleteFuelExpense(id);
      setRefuels((prev) => prev.filter((r) => r.id !== id));
      toast.success("Plein supprimé");
    } catch (err: any) {
      toast.error(err.message || "Erreur de suppression");
    }
  }

  const filteredRefuels = useMemo(() => {
    return refuels.filter((r) => {
      const matchesSearch = !search || (r.station_name || "").toLowerCase().includes(search.toLowerCase());
      const matchesVehicle = !vehicleFilter || r.vehicle_id === Number(vehicleFilter);
      return matchesSearch && matchesVehicle;
    });
  }, [refuels, search, vehicleFilter]);

  const totalLiters = useMemo(() => refuels.reduce((sum, r) => sum + Number(r.liters), 0), [refuels]);

  const totalAmount = useMemo(() => refuels.reduce((sum, r) => sum + Number(r.amount), 0), [refuels]);

  const totalThisMonth = useMemo(() => {
    const now = new Date();
    return refuels
      .filter((r) => {
        const d = new Date(r.refuel_date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, r) => sum + Number(r.amount), 0);
  }, [refuels]);

  const avgPrice = useMemo(() => {
    const withPrice = refuels.filter((r) => r.price_per_liter);
    if (!withPrice.length) return 0;
    const liters = withPrice.reduce((sum, r) => sum + Number(r.liters), 0);
    if (!liters) return 0;
    return withPrice.reduce((sum, r) => sum + Number(r.amount), 0) / liters;
  }, [refuels]);

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
        title="Carburant"
        description={`${refuels.length} plein(s) enregistré(s)`}
        actions={
          <Button onClick={openCreateDialog}>
            <Plus className="size-4" />
            Nouveau plein
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pleins enregistrés" value={formatNumber(refuels.length)} icon={Fuel} />
        <StatCard label="Volume total" value={formatNumber(totalLiters, "L")} icon={Droplets} />
        <StatCard
          label="Coût total"
          value={formatMoney(totalAmount)}
          hint={
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" />
              Ce mois : <span className="font-medium text-foreground tabular">{formatMoney(totalThisMonth)}</span>
            </span>
          }
          icon={Wallet}
        />
        <StatCard
          label="Prix moyen / litre"
          value={avgPrice ? formatMoney(avgPrice) : "—"}
          hint="Sur les pleins avec prix renseigné"
          icon={Gauge}
        />
      </div>

      <Panel flush>
        <Toolbar className="justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
            <Input
              placeholder="Rechercher une station…"
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
        ) : filteredRefuels.length === 0 ? (
          <EmptyState
            icon={Fuel}
            title={hasFilters ? "Aucun plein ne correspond" : "Aucun plein enregistré"}
            description={hasFilters ? "Modifiez la recherche ou le filtre véhicule." : "Enregistrez un premier plein pour suivre la consommation de la flotte."}
            action={
              !hasFilters ? (
                <Button onClick={openCreateDialog}>
                  <Plus className="size-4" />
                  Nouveau plein
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Véhicule</TableHead>
                <TableHead className="hidden lg:table-cell">Conducteur</TableHead>
                <TableHead>Station</TableHead>
                <TableHead className="hidden md:table-cell">Carburant</TableHead>
                <TableHead className="text-right">Litres</TableHead>
                <TableHead className="hidden text-right md:table-cell">Prix / L</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRefuels.map((refuel) => {
                const vehicle = vehicleById.get(refuel.vehicle_id);
                const driver = refuel.driver_id ? driverById.get(refuel.driver_id) : undefined;
                return (
                  <TableRow key={refuel.id} className="cursor-pointer" onClick={() => openEditDialog(refuel)}>
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular">
                      {formatDate(refuel.refuel_date, "short")}
                    </TableCell>
                    <TableCell>
                      {vehicle ? (
                        <div className="flex items-center gap-2">
                          <Plate value={vehicle.registration} size="sm" />
                          <span className="hidden truncate text-muted-foreground xl:inline">
                            {vehicle.brand} {vehicle.model}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Véhicule #{refuel.vehicle_id}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {driver ? driverName(driver) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{refuel.station_name || "—"}</span>
                        {refuel.full_tank && <Badge variant="outline">Plein complet</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {fuelLabels[refuel.fuel_type] ?? refuel.fuel_type}
                    </TableCell>
                    <TableCell className="text-right tabular">{formatNumber(refuel.liters, "L")}</TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular md:table-cell">
                      {refuel.price_per_liter ? formatMoney(refuel.price_per_liter) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular">{formatMoney(refuel.amount)}</TableCell>
                    <TableCell className="pr-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Supprimer le plein"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(refuel.id);
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
            <DialogTitle>{editingId ? "Modifier le plein" : "Nouveau plein de carburant"}</DialogTitle>
            <DialogDescription>Le montant total est calculé automatiquement s&apos;il est laissé vide.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Véhicule" required className="sm:col-span-2">
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
                    <SelectItem value="">Aucun</SelectItem>
                    {drivers.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.first_name} {d.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Type de carburant">
                <Select items={fuelLabels} value={form.fuel_type} onValueChange={(v) => { if (v) update("fuel_type", v); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(fuelLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Litres" htmlFor="liters" required>
                <Input
                  id="liters"
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ex : 40"
                  value={form.liters}
                  onChange={(e) => update("liters", e.target.value)}
                />
              </Field>
              <Field label="Prix / litre (FCFA)" htmlFor="price_per_liter">
                <Input
                  id="price_per_liter"
                  type="number"
                  step="0.01"
                  value={form.price_per_liter}
                  onChange={(e) => update("price_per_liter", e.target.value)}
                />
              </Field>
              <Field label="Montant total (FCFA)" htmlFor="amount">
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="Calculé si vide"
                  value={form.amount}
                  onChange={(e) => update("amount", e.target.value)}
                />
              </Field>
              <Field label="Date" htmlFor="refuel_date" required>
                <Input
                  id="refuel_date"
                  type="date"
                  required
                  value={form.refuel_date}
                  onChange={(e) => update("refuel_date", e.target.value)}
                />
              </Field>
              <Field label="Station" htmlFor="station_name">
                <Input
                  id="station_name"
                  value={form.station_name}
                  placeholder="Ex : Total Yan Kadiogo"
                  onChange={(e) => update("station_name", e.target.value)}
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
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-surface-sunken px-3 py-2.5 sm:col-span-2">
                <label htmlFor="full_tank" className="cursor-pointer">
                  <span className="block text-[13px] font-medium">Plein complet</span>
                  <span className="block text-xs text-muted-foreground">Le réservoir a été rempli entièrement.</span>
                </label>
                <Switch
                  id="full_tank"
                  checked={form.full_tank}
                  onCheckedChange={(checked) => update("full_tank", Boolean(checked))}
                />
              </div>
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
