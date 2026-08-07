"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard, Landmark, Plus, Receipt, Search, Trash2, Truck, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  createTollExpense,
  deleteTollExpense,
  listTollExpenses,
  listVehicles,
  updateTollExpense,
  api,
} from "@/lib/api";
import type { Driver, TollExpense, TollPaymentMethod, Vehicle } from "@/types";
import { toast } from "sonner";

const methodLabels: Record<TollPaymentMethod, string> = {
  cash: "Espèces",
  card: "Carte",
  badge: "Badge / Télépéage",
  other: "Autre",
};

const methodBadges: Record<TollPaymentMethod, { bg: string; text: string }> = {
  cash: { bg: "bg-emerald-50", text: "text-emerald-700" },
  card: { bg: "bg-blue-50", text: "text-blue-700" },
  badge: { bg: "bg-violet-50", text: "text-violet-700" },
  other: { bg: "bg-slate-100", text: "text-slate-700" },
};

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

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Péages</h1>
            <p className="mt-1 text-sm text-muted-foreground">{tolls.length} dépense(s) enregistrée(s)</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={
                <Button onClick={openCreateDialog} className="h-10 gap-2 rounded-xl px-5 shadow-md shadow-primary/20">
                  <Plus className="h-4 w-4" />
                  Nouvelle dépense
                </Button>
              }
            />
            <DialogContent className="max-w-md sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingId ? "Modifier la dépense" : "Nouvelle dépense de péage"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
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
                        {drivers.map((d) => (
                          <SelectItem key={d.id} value={String(d.id)}>
                            {d.first_name} {d.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="toll_name">Nom du péage *</Label>
                    <Input
                      id="toll_name"
                      required
                      placeholder="Ex: Péage Autoroute A1"
                      value={form.toll_name}
                      onChange={(e) => update("toll_name", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Montant (FCFA) *</Label>
                    <Input
                      id="amount"
                      type="number"
                      required
                      value={form.amount}
                      onChange={(e) => update("amount", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Méthode de paiement</Label>
                    <Select value={form.payment_method} onValueChange={(v) => { if (v) update("payment_method", v); }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(methodLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expense_date">Date *</Label>
                    <Input
                      id="expense_date"
                      type="date"
                      required
                      value={form.expense_date}
                      onChange={(e) => update("expense_date", e.target.value)}
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
                <Landmark className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total dépenses</p>
                <p className="text-2xl font-bold">{tolls.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                <Wallet className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Montant total</p>
                <p className="text-2xl font-bold">{totalAmount.toLocaleString("fr-FR")} FCFA</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                <Receipt className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ce mois</p>
                <p className="text-2xl font-bold">{totalThisMonth.toLocaleString("fr-FR")} FCFA</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50">
                <CreditCard className="h-6 w-6 text-violet-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Via badge / télépéage</p>
                <p className="text-2xl font-bold">{badgeCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Historique des péages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un péage..."
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
            ) : filteredTolls.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                Aucune dépense de péage trouvée.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Péage</th>
                      <th className="pb-3 font-medium">Véhicule</th>
                      <th className="pb-3 font-medium">Méthode</th>
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium text-right">Montant</th>
                      <th className="pb-3 font-medium text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTolls.map((toll) => {
                      const vehicle = vehicles.find((v) => v.id === toll.vehicle_id);
                      const method = methodBadges[toll.payment_method] ?? methodBadges.other;
                      return (
                        <tr
                          key={toll.id}
                          onClick={() => openEditDialog(toll)}
                          className="cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/40"
                        >
                          <td className="py-4 font-semibold">{toll.toll_name}</td>
                          <td className="py-4">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Truck className="h-4 w-4" />
                              {vehicle ? `${vehicle.brand} ${vehicle.model}` : `Véhicule #${toll.vehicle_id}`}
                            </div>
                          </td>
                          <td className="py-4">
                            <Badge className={cn("rounded-lg border-0 px-2.5 py-0.5 font-medium", method.bg, method.text)}>
                              {methodLabels[toll.payment_method]}
                            </Badge>
                          </td>
                          <td className="py-4 text-muted-foreground">
                            {new Date(toll.expense_date).toLocaleDateString("fr-FR")}
                          </td>
                          <td className="py-4 text-right font-medium">
                            {Number(toll.amount).toLocaleString("fr-FR")} FCFA
                          </td>
                          <td className="py-4 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(toll.id);
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
