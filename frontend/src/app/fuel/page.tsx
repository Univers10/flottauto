"use client";

import { useEffect, useMemo, useState } from "react";
import { Droplets, Fuel, Plus, Search, Trash2, Truck, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  createFuelExpense,
  deleteFuelExpense,
  listFuelExpenses,
  listVehicles,
  updateFuelExpense,
  api,
} from "@/lib/api";
import type { Driver, FuelExpense, FuelType, Vehicle } from "@/types";
import { toast } from "sonner";

const fuelLabels: Record<FuelType, string> = {
  diesel: "Diesel",
  petrol: "Essence",
  other: "Autre",
};

const fuelBadges: Record<FuelType, { bg: string; text: string }> = {
  diesel: { bg: "bg-slate-100", text: "text-slate-700" },
  petrol: { bg: "bg-amber-50", text: "text-amber-700" },
  other: { bg: "bg-slate-100", text: "text-slate-700" },
};

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

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Carburant</h1>
            <p className="mt-1 text-sm text-muted-foreground">{refuels.length} plein(s) enregistré(s)</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={
                <Button onClick={openCreateDialog} className="h-10 gap-2 rounded-xl px-5 shadow-md shadow-primary/20">
                  <Plus className="h-4 w-4" />
                  Nouveau plein
                </Button>
              }
            />
            <DialogContent className="max-w-md sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingId ? "Modifier le plein" : "Nouveau plein de carburant"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Véhicule *</Label>
                    <Select value={form.vehicle_id} onValueChange={(v) => { if (v) update("vehicle_id", v); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicles.map((v) => (
                          <SelectItem key={v.id} value={String(v.id)}>
                            {v.registration} — {v.brand} {v.model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Conducteur</Label>
                    <Select value={form.driver_id} onValueChange={(v) => update("driver_id", v || "")}>
                      <SelectTrigger>
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
                  </div>
                  <div className="space-y-2">
                    <Label>Type de carburant</Label>
                    <Select value={form.fuel_type} onValueChange={(v) => { if (v) update("fuel_type", v); }}>
                      <SelectTrigger>
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
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="liters">Litres *</Label>
                    <Input
                      id="liters"
                      type="number"
                      step="0.01"
                      required
                      placeholder="Ex: 40"
                      value={form.liters}
                      onChange={(e) => update("liters", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price_per_liter">Prix / litre (FCFA)</Label>
                    <Input
                      id="price_per_liter"
                      type="number"
                      step="0.01"
                      value={form.price_per_liter}
                      onChange={(e) => update("price_per_liter", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Montant total (FCFA)</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      placeholder="Calculé si vide"
                      value={form.amount}
                      onChange={(e) => update("amount", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="refuel_date">Date *</Label>
                    <Input
                      id="refuel_date"
                      type="date"
                      required
                      value={form.refuel_date}
                      onChange={(e) => update("refuel_date", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="station_name">Station</Label>
                    <Input
                      id="station_name"
                      value={form.station_name}
                      placeholder="Ex: Total Yan Kadiogo"
                      onChange={(e) => update("station_name", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mileage">Kilométrage</Label>
                    <Input
                      id="mileage"
                      type="number"
                      value={form.mileage}
                      onChange={(e) => update("mileage", e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-3 pt-6">
                    <Switch
                      id="full_tank"
                      checked={form.full_tank}
                      onCheckedChange={(checked) => update("full_tank", Boolean(checked))}
                    />
                    <Label htmlFor="full_tank" className="cursor-pointer font-normal">
                      Plein complet
                    </Label>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Input
                      id="notes"
                      value={form.notes}
                      onChange={(e) => update("notes", e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">
                    Annuler
                  </Button>
                  <Button type="submit" disabled={saving} className="gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 shadow-lg shadow-primary/25">
                    {saving ? "Enregistrement..." : "Enregistrer"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Fuel className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pleins enregistrés</p>
                <p className="text-2xl font-bold">{refuels.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                <Droplets className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Litres total</p>
                <p className="text-2xl font-bold">{totalLiters.toLocaleString("fr-FR")} L</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                <Wallet className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Coût total</p>
                <p className="text-2xl font-bold">{totalAmount.toLocaleString("fr-FR")} FCFA</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50">
                <Truck className="h-6 w-6 text-violet-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Prix moyen / litre</p>
                <p className="text-2xl font-bold">{avgPrice.toLocaleString("fr-FR")} FCFA</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Historique des pleins</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Rechercher une station..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-11 rounded-xl pl-10"
                />
              </div>
              <Select value={vehicleFilter} onValueChange={(v) => setVehicleFilter(v || "")}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Véhicule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tous les véhicules</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.brand} {v.model} - {v.registration}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : filteredRefuels.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                Aucun plein de carburant trouvé.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium">Véhicule</th>
                      <th className="pb-3 font-medium">Station</th>
                      <th className="pb-3 font-medium">Carburant</th>
                      <th className="pb-3 font-medium text-right">Litres</th>
                      <th className="pb-3 font-medium text-right">Montant</th>
                      <th className="pb-3 font-medium text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRefuels.map((refuel) => {
                      const vehicle = vehicles.find((v) => v.id === refuel.vehicle_id);
                      const badge = fuelBadges[refuel.fuel_type] ?? fuelBadges.other;
                      return (
                        <tr
                          key={refuel.id}
                          onClick={() => openEditDialog(refuel)}
                          className="cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/40"
                        >
                          <td className="py-4 text-muted-foreground">
                            {new Date(refuel.refuel_date).toLocaleDateString("fr-FR")}
                          </td>
                          <td className="py-4">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Truck className="h-4 w-4" />
                              {vehicle ? `${vehicle.brand} ${vehicle.model}` : `Véhicule #${refuel.vehicle_id}`}
                            </div>
                          </td>
                          <td className="py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{refuel.station_name || "—"}</span>
                              {refuel.full_tank && (
                                <Badge className="rounded-lg border-0 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                                  Plein
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-4">
                            <Badge className={cn("rounded-lg border-0 px-2.5 py-0.5 font-medium", badge.bg, badge.text)}>
                              {fuelLabels[refuel.fuel_type]}
                            </Badge>
                          </td>
                          <td className="py-4 text-right font-medium">
                            {Number(refuel.liters).toLocaleString("fr-FR")} L
                          </td>
                          <td className="py-4 text-right font-medium">
                            {Number(refuel.amount).toLocaleString("fr-FR")} FCFA
                          </td>
                          <td className="py-4 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(refuel.id);
                              }}
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
