"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Car,
  Droplets,
  Euro,
  FileText,
  Fuel,
  Gauge,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  User,
  Wrench,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api, uploadVehicleDocument, updateVehicleDocument, updateVehicle, listTollExpenses, createTollExpense, listFuelExpenses, createFuelExpense, deleteFuelExpense, uploadVehiclePhoto, deleteVehiclePhoto } from "@/lib/api";
import { toast } from "sonner";
import type { Document, Driver, Vehicle, WorkOrder, VehicleStatus, VehicleType, EnergyType, TollExpense, TollPaymentMethod, FuelExpense, FuelType } from "@/types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api/v1").replace("/api/v1", "");

const statusBadges: Record<VehicleStatus, { bg: string; text: string; label: string }> = {
  available: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Disponible" },
  in_mission: { bg: "bg-blue-50", text: "text-blue-700", label: "En mission" },
  in_maintenance: { bg: "bg-amber-50", text: "text-amber-700", label: "En maintenance" },
  out_of_service: { bg: "bg-rose-50", text: "text-rose-700", label: "Hors service" },
};

const typeLabels: Record<string, string> = {
  registration_card: "Carte grise",
  insurance: "Assurance",
  technical_control: "Contrôle technique",
  vignette: "Vignette",
  transport_authorization: "Autorisation de transport",
  license: "Permis",
  id_card: "Pièce d'identité",
  medical: "Visite médicale",
  other: "Autre",
};

const vehicleTypeLabels: Record<VehicleType, string> = {
  car: "Voiture",
  van: "Utilitaire",
  truck: "Camion",
  bus: "Bus",
  motorcycle: "Moto",
  other: "Autre",
};

const energyLabels: Record<EnergyType, string> = {
  diesel: "Diesel",
  petrol: "Essence",
  electric: "Électrique",
  hybrid: "Hybride",
  lpg: "GPL",
  other: "Autre",
};

const statusLabels: Record<VehicleStatus, string> = {
  available: "Disponible",
  in_mission: "En mission",
  in_maintenance: "En maintenance",
  out_of_service: "Hors service",
};

const tollMethodLabels: Record<TollPaymentMethod, string> = {
  cash: "Espèces",
  card: "Carte",
  badge: "Badge / Télépéage",
  other: "Autre",
};

const fuelLabels: Record<FuelType, string> = {
  diesel: "Diesel",
  petrol: "Essence",
  other: "Autre",
};

export default function VehicleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const vehicleId = Number(params.id);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [tolls, setTolls] = useState<TollExpense[]>([]);
  const [fuelExpenses, setFuelExpenses] = useState<FuelExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [docType, setDocType] = useState<string>("registration_card");
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [tollDialogOpen, setTollDialogOpen] = useState(false);
  const [savingToll, setSavingToll] = useState(false);
  const [tollForm, setTollForm] = useState({
    driver_id: "",
    toll_name: "",
    amount: "",
    payment_method: "cash" as TollPaymentMethod,
    expense_date: new Date().toISOString().slice(0, 10),
    mileage: "",
    notes: "",
  });
  const [fuelDialogOpen, setFuelDialogOpen] = useState(false);
  const [savingFuel, setSavingFuel] = useState(false);
  const [fuelForm, setFuelForm] = useState({
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
  });
  const [editingInfo, setEditingInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({
    registration: "",
    vin: "",
    brand: "",
    model: "",
    year: "",
    vehicle_type: "car" as VehicleType,
    energy: "diesel" as EnergyType,
    first_registration_date: "",
    mileage: "",
    status: "available" as VehicleStatus,
    purchase_price: "",
    notes: "",
  });
  const [docEditOpen, setDocEditOpen] = useState(false);
  const [savingDocEdit, setSavingDocEdit] = useState(false);
  const [docEditForm, setDocEditForm] = useState({
    name: "",
    document_type: "other",
    issue_date: "",
    expiry_date: "",
    reminder_days: "30",
  });
  const [uploadFormKey, setUploadFormKey] = useState(0);

  function applyVehicleToInfoForm(v: Vehicle) {
    setInfoForm({
      registration: v.registration || "",
      vin: v.vin || "",
      brand: v.brand || "",
      model: v.model || "",
      year: v.year ? String(v.year) : "",
      vehicle_type: v.vehicle_type || "car",
      energy: v.energy || "diesel",
      first_registration_date: v.first_registration_date ? v.first_registration_date.slice(0, 10) : "",
      mileage: v.mileage != null ? String(v.mileage) : "",
      status: v.status || "available",
      purchase_price: v.purchase_price != null ? String(v.purchase_price) : "",
      notes: v.notes || "",
    });
  }

  async function load() {
    setLoading(true);
    try {
      const [v, docs, orders, allDrivers, tollExpenses, fuelRes] = await Promise.all([
        api.get<Vehicle>(`/vehicles/${vehicleId}`),
        api.get<Document[]>(`/vehicles/${vehicleId}/documents`),
        api.get<WorkOrder[]>(`/maintenance/work-orders?vehicle_id=${vehicleId}`),
        api.get<Driver[]>("/drivers"),
        listTollExpenses({ vehicle_id: vehicleId }),
        listFuelExpenses({ vehicle_id: vehicleId }),
      ]);
      setVehicle(v);
      applyVehicleToInfoForm(v);
      setDocuments(docs);
      setWorkOrders(orders);
      setDrivers(allDrivers);
      setTolls(tollExpenses);
      setFuelExpenses(fuelRes);
      setEditingInfo(false);
      if (v.driver_id) {
        const d = allDrivers.find((x) => x.id === v.driver_id);
        setDriver(d || null);
        setSelectedDriverId(String(v.driver_id));
      } else {
        setDriver(null);
        setSelectedDriverId("");
      }
    } catch (err: any) {
      toast.error(err.message || "Erreur de chargement");
      router.push("/vehicles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [vehicleId]);

  async function saveVehicleInfo() {
    if (!vehicle) return;
    if (!infoForm.registration.trim() || !infoForm.brand.trim() || !infoForm.model.trim()) {
      toast.error("Immatriculation, marque et modèle sont obligatoires");
      return;
    }
    setSavingInfo(true);
    try {
      const updated = await updateVehicle(vehicle.id, {
        registration: infoForm.registration.trim(),
        vin: infoForm.vin.trim() || null,
        brand: infoForm.brand.trim(),
        model: infoForm.model.trim(),
        year: infoForm.year ? Number(infoForm.year) : null,
        vehicle_type: infoForm.vehicle_type,
        energy: infoForm.energy,
        first_registration_date: infoForm.first_registration_date || null,
        mileage: infoForm.mileage ? Number(infoForm.mileage) : 0,
        status: infoForm.status,
        purchase_price: infoForm.purchase_price ? Number(infoForm.purchase_price) : null,
        notes: infoForm.notes.trim() || null,
      } as Partial<Vehicle>);
      setVehicle(updated);
      applyVehicleToInfoForm(updated);
      setEditingInfo(false);
      toast.success("Véhicule mis à jour");
    } catch (err: any) {
      toast.error(err.message || "Erreur de sauvegarde");
    } finally {
      setSavingInfo(false);
    }
  }

  async function assignDriver(driverId: string) {
    if (!vehicle) return;
    try {
      const updated = await updateVehicle(vehicle.id, { driver_id: driverId ? Number(driverId) : null });
      setVehicle(updated);
      setDriver(drivers.find((d) => d.id === Number(driverId)) || null);
      toast.success("Chauffeur affecté");
    } catch (err: any) {
      toast.error(err.message || "Erreur d'affectation");
    }
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) {
      toast.error("Veuillez sélectionner au moins un fichier");
      return;
    }
    formData.delete("files");
    for (const file of files) {
      formData.append("files", file);
    }
    formData.set("document_type", docType);
    setUploading(true);
    try {
      await uploadVehicleDocument(vehicleId, formData);
      toast.success(files.length > 1 ? `${files.length} documents ajoutés` : "Document ajouté");
      setUploadOpen(false);
      setDocType("registration_card");
      setUploadFormKey((k) => k + 1);
      const docs = await api.get<Document[]>(`/vehicles/${vehicleId}/documents`);
      setDocuments(docs);
    } catch (err: any) {
      toast.error(err.message || "Erreur d'upload");
    } finally {
      setUploading(false);
    }
  }

  function openDocEdit(doc: Document) {
    setSelectedDoc(doc);
    setDocEditForm({
      name: doc.name || "",
      document_type: doc.document_type || "other",
      issue_date: doc.issue_date ? doc.issue_date.slice(0, 10) : "",
      expiry_date: doc.expiry_date ? doc.expiry_date.slice(0, 10) : "",
      reminder_days: String(doc.reminder_days ?? 30),
    });
    setDocEditOpen(true);
  }

  async function handleDocEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedDoc) return;
    if (!docEditForm.name.trim()) {
      toast.error("Le nom du document est obligatoire");
      return;
    }
    setSavingDocEdit(true);
    try {
      const updated = await updateVehicleDocument(vehicleId, selectedDoc.id, {
        name: docEditForm.name.trim(),
        document_type: docEditForm.document_type,
        issue_date: docEditForm.issue_date || null,
        expiry_date: docEditForm.expiry_date || null,
        reminder_days: Number(docEditForm.reminder_days) || 30,
      });
      setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setSelectedDoc(updated);
      setDocEditOpen(false);
      toast.success("Document mis à jour");
    } catch (err: any) {
      toast.error(err.message || "Erreur de mise à jour");
    } finally {
      setSavingDocEdit(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const updated = await uploadVehiclePhoto(vehicleId, formData);
      setVehicle(updated);
      toast.success("Photo mise à jour");
    } catch (err: any) {
      toast.error(err.message || "Erreur d'upload de la photo");
    } finally {
      setPhotoUploading(false);
      e.target.value = "";
    }
  }

  async function handlePhotoDelete() {
    if (!vehicle?.photo_url) return;
    if (!confirm("Supprimer cette photo ?")) return;
    try {
      const updated = await deleteVehiclePhoto(vehicleId);
      setVehicle(updated);
      toast.success("Photo supprimée");
    } catch (err: any) {
      toast.error(err.message || "Erreur");
    }
  }

  async function deleteDoc(doc: Document) {
    if (!confirm(`Supprimer ${doc.name} ?`)) return;
    try {
      await api.delete(`/vehicles/${vehicleId}/documents/${doc.id}`);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      toast.success("Document supprimé");
    } catch (err: any) {
      toast.error(err.message || "Erreur de suppression");
    }
  }

  function openDoc(doc: Document) {
    setSelectedDoc(doc);
  }

  function openTollDialog() {
    setTollForm({
      driver_id: driver ? String(driver.id) : "",
      toll_name: "",
      amount: "",
      payment_method: "cash",
      expense_date: new Date().toISOString().slice(0, 10),
      mileage: "",
      notes: "",
    });
    setTollDialogOpen(true);
  }

  function updateTollForm(key: keyof typeof tollForm, value: string) {
    setTollForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleTollSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tollForm.toll_name || !tollForm.amount) {
      toast.error("Nom du péage et montant sont requis");
      return;
    }
    setSavingToll(true);
    try {
      const created = await createTollExpense({
        vehicle_id: vehicleId,
        driver_id: tollForm.driver_id ? Number(tollForm.driver_id) : null,
        toll_name: tollForm.toll_name,
        amount: Number(tollForm.amount) as any,
        payment_method: tollForm.payment_method,
        expense_date: tollForm.expense_date,
        mileage: tollForm.mileage ? Number(tollForm.mileage) : null,
        notes: tollForm.notes || null,
      });
      setTolls((prev) => [created, ...prev]);
      toast.success("Dépense de péage ajoutée");
      setTollDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'enregistrement");
    } finally {
      setSavingToll(false);
    }
  }

  function openFuelDialog() {
    setFuelForm({
      driver_id: driver ? String(driver.id) : "",
      fuel_type: "diesel",
      liters: "",
      price_per_liter: "",
      amount: "",
      full_tank: false,
      station_name: "",
      refuel_date: new Date().toISOString().slice(0, 10),
      mileage: "",
      notes: "",
    });
    setFuelDialogOpen(true);
  }

  function updateFuelForm(key: keyof typeof fuelForm, value: string | boolean) {
    setFuelForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleFuelSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fuelForm.liters) {
      toast.error("Les litres sont requis");
      return;
    }
    setSavingFuel(true);
    try {
      const created = await createFuelExpense({
        vehicle_id: vehicleId,
        driver_id: fuelForm.driver_id ? Number(fuelForm.driver_id) : null,
        fuel_type: fuelForm.fuel_type,
        liters: Number(fuelForm.liters) as any,
        price_per_liter: fuelForm.price_per_liter ? Number(fuelForm.price_per_liter) : null,
        amount: fuelForm.amount ? Number(fuelForm.amount) : null,
        full_tank: fuelForm.full_tank,
        station_name: fuelForm.station_name || null,
        refuel_date: fuelForm.refuel_date,
        mileage: fuelForm.mileage ? Number(fuelForm.mileage) : null,
        notes: fuelForm.notes || null,
      } as any);
      setFuelExpenses((prev) => [created, ...prev]);
      toast.success("Plein de carburant ajouté");
      setFuelDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'enregistrement");
    } finally {
      setSavingFuel(false);
    }
  }

  async function handleFuelDelete(id: number) {
    if (!confirm("Supprimer ce plein de carburant ?")) return;
    try {
      await deleteFuelExpense(id);
      setFuelExpenses((prev) => prev.filter((f) => f.id !== id));
      toast.success("Plein supprimé");
    } catch (err: any) {
      toast.error(err.message || "Erreur de suppression");
    }
  }

  const totalMaintenanceCost = useMemo(
    () => workOrders.reduce((sum, wo) => sum + Number(wo.total_cost || 0), 0),
    [workOrders]
  );

  const totalTollCost = useMemo(
    () => tolls.reduce((sum, t) => sum + Number(t.amount || 0), 0),
    [tolls]
  );

  const totalFuelCost = useMemo(
    () => fuelExpenses.reduce((sum, f) => sum + Number(f.amount || 0), 0),
    [fuelExpenses]
  );

  const totalFuelLiters = useMemo(
    () => fuelExpenses.reduce((sum, f) => sum + Number(f.liters || 0), 0),
    [fuelExpenses]
  );

  if (loading || !vehicle) {
    return (
      <AppShell>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  const status = statusBadges[vehicle.status];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/vehicles">
            <Button variant="ghost" size="icon" className="rounded-xl">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-sm font-medium text-muted-foreground">Retour à la flotte</h1>
        </div>

        <Card className="overflow-hidden rounded-2xl border-none bg-card shadow-sm shadow-black/5">
          <div className="grid gap-0 lg:grid-cols-[320px_1fr]">
            <div className="relative h-56 overflow-hidden bg-gradient-to-br from-muted to-muted/60 lg:h-full">
              {vehicle.photo_url ? (
                <img
                  src={vehicle.photo_url.startsWith("http") ? vehicle.photo_url : `${API_BASE_URL}${vehicle.photo_url}`}
                  alt={`${vehicle.brand} ${vehicle.model}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Car className="h-16 w-16 opacity-40" />
                </div>
              )}
              <Badge className={cn("absolute top-4 right-4 rounded-lg border-0 px-3 py-1 font-medium", status.bg, status.text)}>
                {status.label}
              </Badge>
              <div className="absolute bottom-4 right-4 flex gap-2">
                <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-card/90 px-4 text-sm font-medium text-foreground shadow-sm ring-1 ring-border/60 backdrop-blur transition-colors hover:bg-card">
                  {photoUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 text-primary" />
                  )}
                  {vehicle.photo_url ? "Changer la photo" : "Ajouter une photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={photoUploading}
                  />
                </label>
                {vehicle.photo_url && (
                  <button
                    onClick={handlePhotoDelete}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-card/90 text-rose-600 shadow-sm ring-1 ring-border/60 backdrop-blur transition-colors hover:bg-rose-50"
                    title="Supprimer la photo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-col justify-center gap-4 p-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  {vehicle.brand} {vehicle.model}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">{vehicle.registration}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-2 text-sm">
                  <Gauge className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{vehicle.mileage.toLocaleString("fr-FR")} km</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-2 text-sm capitalize">
                  <Car className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{vehicle.vehicle_type}</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-2 text-sm capitalize">
                  <Wrench className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{vehicle.energy}</span>
                </div>
                {driver && (
                  <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-2 text-sm">
                    <User className="h-4 w-4 text-primary" />
                    <span className="font-semibold">{driver.first_name} {driver.last_name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Tabs defaultValue="info" className="space-y-5">
          <TabsList className="h-12 flex-wrap rounded-2xl bg-muted/60 p-1">
            <TabsTrigger value="info" className="rounded-xl px-4 py-2 text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm">
              Informations
            </TabsTrigger>
            <TabsTrigger value="documents" className="rounded-xl px-4 py-2 text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm">
              Documents ({documents.length})
            </TabsTrigger>
            <TabsTrigger value="driver" className="rounded-xl px-4 py-2 text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm">
              Chauffeur
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="rounded-xl px-4 py-2 text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm">
              Maintenance ({workOrders.length})
            </TabsTrigger>
            <TabsTrigger value="tolls" className="rounded-xl px-4 py-2 text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm">
              Péages ({tolls.length})
            </TabsTrigger>
            <TabsTrigger value="fuel" className="rounded-xl px-4 py-2 text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm">
              Carburant ({fuelExpenses.length})
            </TabsTrigger>
            <TabsTrigger value="costs" className="rounded-xl px-4 py-2 text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm">
              Coûts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-lg font-semibold">Détails du véhicule</CardTitle>
                {!editingInfo ? (
                  <Button variant="outline" onClick={() => setEditingInfo(true)} className="h-10 gap-2 rounded-xl px-4">
                    <Pencil className="h-4 w-4" />
                    Modifier
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                {!editingInfo ? (
                  <>
                    <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        { label: "Immatriculation", value: vehicle.registration },
                        { label: "Marque / Modèle", value: `${vehicle.brand} ${vehicle.model}` },
                        { label: "VIN", value: vehicle.vin || "—" },
                        { label: "Année", value: vehicle.year || "—" },
                        { label: "Type", value: vehicleTypeLabels[vehicle.vehicle_type] || vehicle.vehicle_type },
                        { label: "Énergie", value: energyLabels[vehicle.energy] || vehicle.energy },
                        { label: "Statut", value: statusLabels[vehicle.status] || vehicle.status },
                        { label: "Kilométrage", value: `${vehicle.mileage.toLocaleString()} km` },
                        {
                          label: "Mise en circulation",
                          value: vehicle.first_registration_date
                            ? new Date(vehicle.first_registration_date).toLocaleDateString("fr-FR")
                            : "—",
                        },
                        {
                          label: "Prix d'achat",
                          value: vehicle.purchase_price
                            ? `${Number(vehicle.purchase_price).toLocaleString("fr-FR")} FCFA`
                            : "—",
                        },
                      ].map((item) => (
                        <div key={item.label} className="rounded-xl bg-muted/40 p-3">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</dt>
                          <dd className="mt-1 text-sm font-semibold capitalize">{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {vehicle.notes && (
                      <div className="mt-6 rounded-xl bg-muted/40 p-4">
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</dt>
                        <dd className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{vehicle.notes}</dd>
                      </div>
                    )}
                  </>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveVehicleInfo();
                    }}
                    className="space-y-5"
                  >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="v-registration">Immatriculation *</Label>
                        <Input
                          id="v-registration"
                          required
                          value={infoForm.registration}
                          onChange={(e) => setInfoForm((p) => ({ ...p, registration: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="v-vin">VIN</Label>
                        <Input id="v-vin" value={infoForm.vin} onChange={(e) => setInfoForm((p) => ({ ...p, vin: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="v-brand">Marque *</Label>
                        <Input
                          id="v-brand"
                          required
                          value={infoForm.brand}
                          onChange={(e) => setInfoForm((p) => ({ ...p, brand: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="v-model">Modèle *</Label>
                        <Input
                          id="v-model"
                          required
                          value={infoForm.model}
                          onChange={(e) => setInfoForm((p) => ({ ...p, model: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="v-year">Année</Label>
                        <Input
                          id="v-year"
                          type="number"
                          value={infoForm.year}
                          onChange={(e) => setInfoForm((p) => ({ ...p, year: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="v-type">Type</Label>
                        <Select
                          value={infoForm.vehicle_type}
                          onValueChange={(v) => setInfoForm((p) => ({ ...p, vehicle_type: (v || "car") as VehicleType }))}
                        >
                          <SelectTrigger id="v-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(vehicleTypeLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="v-energy">Énergie</Label>
                        <Select
                          value={infoForm.energy}
                          onValueChange={(v) => setInfoForm((p) => ({ ...p, energy: (v || "diesel") as EnergyType }))}
                        >
                          <SelectTrigger id="v-energy">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(energyLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="v-status">Statut</Label>
                        <Select
                          value={infoForm.status}
                          onValueChange={(v) => setInfoForm((p) => ({ ...p, status: (v || "available") as VehicleStatus }))}
                        >
                          <SelectTrigger id="v-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(statusLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="v-mileage">Kilométrage</Label>
                        <Input
                          id="v-mileage"
                          type="number"
                          value={infoForm.mileage}
                          onChange={(e) => setInfoForm((p) => ({ ...p, mileage: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="v-first-reg">Mise en circulation</Label>
                        <Input
                          id="v-first-reg"
                          type="date"
                          value={infoForm.first_registration_date}
                          onChange={(e) => setInfoForm((p) => ({ ...p, first_registration_date: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="v-price">Prix d&apos;achat (FCFA)</Label>
                        <Input
                          id="v-price"
                          type="number"
                          value={infoForm.purchase_price}
                          onChange={(e) => setInfoForm((p) => ({ ...p, purchase_price: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="v-notes">Notes</Label>
                      <textarea
                        id="v-notes"
                        value={infoForm.notes}
                        onChange={(e) => setInfoForm((p) => ({ ...p, notes: e.target.value }))}
                        rows={4}
                        className="w-full rounded-xl border border-border/60 bg-muted/50 px-3.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          applyVehicleToInfoForm(vehicle);
                          setEditingInfo(false);
                        }}
                        className="h-11 rounded-xl border-border/60 px-5"
                      >
                        Annuler
                      </Button>
                      <Button
                        type="submit"
                        disabled={savingInfo}
                        className="h-11 gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 px-5 shadow-lg shadow-primary/25"
                      >
                        <Save className="h-4 w-4" />
                        {savingInfo ? "Sauvegarde..." : "Enregistrer"}
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents">
            <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <FileText className="h-5 w-5 text-primary" />
                  Documents
                </CardTitle>
                <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                  <DialogTrigger
                    render={
                      <Button className="h-10 gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 px-4 shadow-lg shadow-primary/25">
                        <Upload className="h-4 w-4" />
                        Ajouter
                      </Button>
                    }
                  />
                  <DialogContent className="rounded-2xl border-none p-6 sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-lg font-semibold">Nouveau document</DialogTitle>
                    </DialogHeader>
                    <form key={uploadFormKey} onSubmit={handleUpload} className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="docName">Nom</Label>
                        <Input id="docName" name="name" placeholder="Carte grise 2026 (optionnel si plusieurs fichiers)" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="docType">Type</Label>
                        <Select value={docType} onValueChange={(v) => setDocType(v || "registration_card")}>
                          <SelectTrigger id="docType">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(typeLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="issueDate">Date d&apos;émission</Label>
                          <Input id="issueDate" name="issue_date" type="date" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="expiryDate">Date d&apos;expiration</Label>
                          <Input id="expiryDate" name="expiry_date" type="date" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="files">Fichiers</Label>
                        <Input id="files" name="files" type="file" multiple required />
                        <p className="text-xs text-muted-foreground">Vous pouvez sélectionner plusieurs documents en même temps.</p>
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="outline" onClick={() => setUploadOpen(false)} className="h-11 rounded-xl border-border/60 px-5">
                          Annuler
                        </Button>
                        <Button type="submit" disabled={uploading} className="h-11 gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 px-5 shadow-lg shadow-primary/25">
                          {uploading ? "Envoi..." : "Enregistrer"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>

                <Dialog open={docEditOpen} onOpenChange={setDocEditOpen}>
                  <DialogContent className="rounded-2xl border-none p-6 sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-lg font-semibold">Modifier le document</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleDocEditSubmit} className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="edit-doc-name">Nom</Label>
                        <Input
                          id="edit-doc-name"
                          required
                          value={docEditForm.name}
                          onChange={(e) => setDocEditForm((p) => ({ ...p, name: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-doc-type">Type</Label>
                        <Select
                          value={docEditForm.document_type}
                          onValueChange={(v) => setDocEditForm((p) => ({ ...p, document_type: v || "other" }))}
                        >
                          <SelectTrigger id="edit-doc-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(typeLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit-doc-issue">Date d&apos;émission</Label>
                          <Input
                            id="edit-doc-issue"
                            type="date"
                            value={docEditForm.issue_date}
                            onChange={(e) => setDocEditForm((p) => ({ ...p, issue_date: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-doc-expiry">Date d&apos;expiration</Label>
                          <Input
                            id="edit-doc-expiry"
                            type="date"
                            value={docEditForm.expiry_date}
                            onChange={(e) => setDocEditForm((p) => ({ ...p, expiry_date: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-doc-reminder">Rappel (jours avant)</Label>
                        <Input
                          id="edit-doc-reminder"
                          type="number"
                          min={0}
                          value={docEditForm.reminder_days}
                          onChange={(e) => setDocEditForm((p) => ({ ...p, reminder_days: e.target.value }))}
                        />
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="outline" onClick={() => setDocEditOpen(false)} className="h-11 rounded-xl border-border/60 px-5">
                          Annuler
                        </Button>
                        <Button type="submit" disabled={savingDocEdit} className="h-11 gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 px-5 shadow-lg shadow-primary/25">
                          <Save className="h-4 w-4" />
                          {savingDocEdit ? "Sauvegarde..." : "Enregistrer"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                    Aucun document enregistré.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {documents.map((doc) => {
                        const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(doc.file_url || "");
                        const fullUrl = doc.file_url?.startsWith("http") ? doc.file_url : `${API_BASE_URL}${doc.file_url}`;
                        const expiringSoon = doc.expiry_date && new Date(doc.expiry_date) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                        return (
                          <Card
                            key={doc.id}
                            onClick={() => openDoc(doc)}
                            className={cn(
                              "group cursor-pointer overflow-hidden rounded-2xl border bg-card shadow-sm shadow-black/5 transition-all hover:-translate-y-1 hover:shadow-lg",
                              selectedDoc?.id === doc.id ? "border-primary ring-1 ring-primary" : "border-border/60",
                            )}
                          >
                            <div className="relative h-40 overflow-hidden bg-gradient-to-br from-muted to-muted/60">
                              {isImage && fullUrl ? (
                                <img src={fullUrl} alt={doc.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                              ) : (
                                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                                  <FileText className="h-12 w-12 opacity-40" />
                                  <span className="text-xs font-medium uppercase tracking-wide">{typeLabels[doc.document_type] || doc.document_type}</span>
                                </div>
                              )}
                              {doc.expiry_date && (
                                <span
                                  className={cn(
                                    "absolute top-3 right-3 rounded-lg px-2.5 py-0.5 text-xs font-medium",
                                    expiringSoon ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700",
                                  )}
                                >
                                  {new Date(doc.expiry_date).toLocaleDateString("fr-FR")}
                                </span>
                              )}
                            </div>
                            <CardContent className="space-y-1 p-4">
                              <h3 className="truncate font-semibold">{doc.name}</h3>
                              <p className="text-sm text-muted-foreground">{typeLabels[doc.document_type] || doc.document_type}</p>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>

                    {selectedDoc && (() => {
                      const fullUrl = selectedDoc.file_url?.startsWith("http") ? selectedDoc.file_url : `${API_BASE_URL}${selectedDoc.file_url}`;
                      const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(selectedDoc.file_url || "");
                      return (
                        <Card className="mt-6 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm shadow-black/5">
                          <div className="grid gap-6 p-6 lg:grid-cols-[1fr_1.2fr]">
                            <div className="relative h-80 w-full overflow-hidden rounded-2xl bg-gradient-to-br from-muted to-muted/60 lg:h-auto">
                              {isImage && fullUrl ? (
                                <img src={fullUrl} alt={selectedDoc.name} className="h-full w-full object-contain" />
                              ) : (
                                <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground">
                                  <FileText className="h-24 w-24 opacity-40" />
                                  <span className="text-sm font-medium">Aperçu non disponible</span>
                                </div>
                              )}
                            </div>
                            <div className="space-y-4">
                              <div>
                                <h2 className="text-2xl font-bold">{selectedDoc.name}</h2>
                                <p className="text-base text-muted-foreground">{typeLabels[selectedDoc.document_type] || selectedDoc.document_type}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="rounded-xl bg-muted/40 p-3">
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Échéance</p>
                                  <p className="mt-1 font-semibold">
                                    {selectedDoc.expiry_date ? new Date(selectedDoc.expiry_date).toLocaleDateString("fr-FR") : "—"}
                                  </p>
                                </div>
                                <div className="rounded-xl bg-muted/40 p-3">
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Date d&apos;émission</p>
                                  <p className="mt-1 font-semibold">
                                    {selectedDoc.issue_date ? new Date(selectedDoc.issue_date).toLocaleDateString("fr-FR") : "—"}
                                  </p>
                                </div>
                                <div className="rounded-xl bg-muted/40 p-3">
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Rappel</p>
                                  <p className="mt-1 font-semibold">{selectedDoc.reminder_days} jours avant</p>
                                </div>
                                <div className="rounded-xl bg-muted/40 p-3">
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Fichier</p>
                                  <a href={fullUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block font-semibold text-primary hover:underline">
                                    Télécharger / Ouvrir
                                  </a>
                                </div>
                              </div>
                              <div className="flex flex-wrap justify-end gap-3 pt-2">
                                <Button variant="outline" onClick={() => setSelectedDoc(null)} className="h-11 rounded-xl px-5">
                                  Fermer
                                </Button>
                                <Button variant="outline" onClick={() => openDocEdit(selectedDoc)} className="h-11 gap-2 rounded-xl px-5">
                                  <Pencil className="h-4 w-4" />
                                  Modifier
                                </Button>
                                <Button variant="destructive" onClick={() => { deleteDoc(selectedDoc); setSelectedDoc(null); }} className="h-11 gap-2 rounded-xl px-5">
                                  <Trash2 className="h-4 w-4" />
                                  Supprimer
                                </Button>
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })()}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="driver">
            <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <User className="h-5 w-5 text-primary" />
                  Chauffeur affecté
                </CardTitle>
              </CardHeader>
              <CardContent>
                {driver ? (
                  <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-blue-600 text-3xl font-bold text-primary-foreground">
                      {driver.first_name[0]}{driver.last_name[0]}
                    </div>
                    <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="rounded-xl bg-muted/40 p-3">
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nom</dt>
                        <dd className="mt-1 text-sm font-semibold">{driver.first_name} {driver.last_name}</dd>
                      </div>
                      <div className="rounded-xl bg-muted/40 p-3">
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</dt>
                        <dd className="mt-1 text-sm font-semibold">{driver.email || "—"}</dd>
                      </div>
                      <div className="rounded-xl bg-muted/40 p-3">
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Téléphone</dt>
                        <dd className="mt-1 text-sm font-semibold">{driver.phone || "—"}</dd>
                      </div>
                      <div className="rounded-xl bg-muted/40 p-3">
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Permis</dt>
                        <dd className="mt-1 text-sm font-semibold">{driver.license_number || "—"}</dd>
                      </div>
                      <div className="rounded-xl bg-muted/40 p-3">
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Catégories</dt>
                        <dd className="mt-1 text-sm font-semibold">{driver.license_categories || "—"}</dd>
                      </div>
                      <div className="rounded-xl bg-muted/40 p-3">
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Expiration permis</dt>
                        <dd className="mt-1 text-sm font-semibold">
                          {driver.license_expiry ? new Date(driver.license_expiry).toLocaleDateString("fr-FR") : "—"}
                        </dd>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                    Aucun chauffeur affecté.
                  </div>
                )}
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Select value={selectedDriverId} onValueChange={(v) => setSelectedDriverId(v || "")}>
                    <SelectTrigger className="sm:w-72">
                      <SelectValue placeholder="Choisir un chauffeur" />
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
                  <Button onClick={() => assignDriver(selectedDriverId)} className="h-11 gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 px-5 shadow-lg shadow-primary/25">
                    <Plus className="h-4 w-4" />
                    Affecter
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="maintenance">
            <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Wrench className="h-5 w-5 text-primary" />
                  Ordres de travail
                </CardTitle>
                <Button onClick={() => router.push(`/maintenance/new?vehicle_id=${vehicle.id}`)} className="h-10 gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 px-4 shadow-lg shadow-primary/25">
                  <Plus className="h-4 w-4" />
                  Nouvelle intervention
                </Button>
              </CardHeader>
              <CardContent>
                {workOrders.length === 0 ? (
                  <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                    Aucun ordre de travail.
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {workOrders.map((wo) => (
                      <div key={wo.id} className="rounded-2xl border border-border/60 p-4 transition-colors hover:bg-muted/40">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold">{wo.title}</h3>
                          <Badge variant="outline" className="rounded-lg capitalize">
                            {wo.status}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{wo.description || "—"}</p>
                        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-2 py-1">
                            <Calendar className="h-4 w-4" />
                            {wo.type === "preventive" ? "Préventif" : "Curatif"}
                          </span>
                          {wo.total_cost && (
                            <span className="font-medium text-foreground">
                              {Number(wo.total_cost).toLocaleString("fr-FR")} FCFA
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tolls">
            <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Landmark className="h-5 w-5 text-primary" />
                  Dépenses de péage
                </CardTitle>
                <Dialog open={tollDialogOpen} onOpenChange={setTollDialogOpen}>
                  <DialogTrigger
                    render={
                      <Button onClick={openTollDialog} className="h-10 gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 px-4 shadow-lg shadow-primary/25">
                        <Plus className="h-4 w-4" />
                        Nouvelle dépense
                      </Button>
                    }
                  />
                  <DialogContent className="max-w-md sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Nouvelle dépense de péage</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleTollSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2 sm:col-span-2">
                          <Label>Véhicule</Label>
                          <Input value={`${vehicle.registration} — ${vehicle.brand} ${vehicle.model}`} disabled className="bg-muted/40" />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label>Conducteur</Label>
                          <Select value={tollForm.driver_id} onValueChange={(v) => updateTollForm("driver_id", v || "")}>
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
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="toll_name">Nom du péage *</Label>
                          <Input
                            id="toll_name"
                            required
                            placeholder="Ex: Péage Autoroute A1"
                            value={tollForm.toll_name}
                            onChange={(e) => updateTollForm("toll_name", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="amount">Montant (FCFA) *</Label>
                          <Input
                            id="amount"
                            type="number"
                            required
                            value={tollForm.amount}
                            onChange={(e) => updateTollForm("amount", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Méthode de paiement</Label>
                          <Select value={tollForm.payment_method} onValueChange={(v) => { if (v) updateTollForm("payment_method", v); }}>
                            <SelectTrigger>
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
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="expense_date">Date *</Label>
                          <Input
                            id="expense_date"
                            type="date"
                            required
                            value={tollForm.expense_date}
                            onChange={(e) => updateTollForm("expense_date", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="mileage">Kilométrage</Label>
                          <Input
                            id="mileage"
                            type="number"
                            value={tollForm.mileage}
                            onChange={(e) => updateTollForm("mileage", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="notes">Notes</Label>
                          <Input
                            id="notes"
                            value={tollForm.notes}
                            onChange={(e) => updateTollForm("notes", e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setTollDialogOpen(false)} className="rounded-xl">
                          Annuler
                        </Button>
                        <Button type="submit" disabled={savingToll} className="gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 shadow-lg shadow-primary/25">
                          {savingToll ? "Enregistrement..." : "Enregistrer"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {tolls.length === 0 ? (
                  <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                    Aucune dépense de péage enregistrée.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-3 font-medium">Péage</th>
                          <th className="pb-3 font-medium">Date</th>
                          <th className="pb-3 font-medium">Méthode</th>
                          <th className="pb-3 font-medium text-right">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tolls.map((toll) => (
                          <tr key={toll.id} className="border-b last:border-0 transition-colors hover:bg-muted/40">
                            <td className="py-4 font-semibold">{toll.toll_name}</td>
                            <td className="py-4 text-muted-foreground">
                              {new Date(toll.expense_date).toLocaleDateString("fr-FR")}
                            </td>
                            <td className="py-4">
                              <Badge variant="outline" className="rounded-lg">
                                {tollMethodLabels[toll.payment_method]}
                              </Badge>
                            </td>
                            <td className="py-4 text-right font-semibold">
                              {Number(toll.amount).toLocaleString("fr-FR")} FCFA
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fuel">
            <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Fuel className="h-5 w-5 text-primary" />
                  Pleins de carburant
                </CardTitle>
                <Dialog open={fuelDialogOpen} onOpenChange={setFuelDialogOpen}>
                  <DialogTrigger
                    render={
                      <Button onClick={openFuelDialog} className="h-10 gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 px-4 shadow-lg shadow-primary/25">
                        <Plus className="h-4 w-4" />
                        Nouveau plein
                      </Button>
                    }
                  />
                  <DialogContent className="max-w-md sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Nouveau plein de carburant</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleFuelSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2 sm:col-span-2">
                          <Label>Véhicule</Label>
                          <Input value={`${vehicle.registration} — ${vehicle.brand} ${vehicle.model}`} disabled className="bg-muted/40" />
                        </div>
                        <div className="space-y-2">
                          <Label>Conducteur</Label>
                          <Select value={fuelForm.driver_id} onValueChange={(v) => updateFuelForm("driver_id", v || "")}>
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
                          <Select value={fuelForm.fuel_type} onValueChange={(v) => { if (v) updateFuelForm("fuel_type", v); }}>
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
                            value={fuelForm.liters}
                            onChange={(e) => updateFuelForm("liters", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="price_per_liter">Prix / litre (FCFA)</Label>
                          <Input
                            id="price_per_liter"
                            type="number"
                            step="0.01"
                            value={fuelForm.price_per_liter}
                            onChange={(e) => updateFuelForm("price_per_liter", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="amount">Montant total (FCFA)</Label>
                          <Input
                            id="amount"
                            type="number"
                            step="0.01"
                            placeholder="Calculé si vide"
                            value={fuelForm.amount}
                            onChange={(e) => updateFuelForm("amount", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="refuel_date">Date *</Label>
                          <Input
                            id="refuel_date"
                            type="date"
                            required
                            value={fuelForm.refuel_date}
                            onChange={(e) => updateFuelForm("refuel_date", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="station_name">Station</Label>
                          <Input
                            id="station_name"
                            value={fuelForm.station_name}
                            onChange={(e) => updateFuelForm("station_name", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="mileage">Kilométrage</Label>
                          <Input
                            id="mileage"
                            type="number"
                            value={fuelForm.mileage}
                            onChange={(e) => updateFuelForm("mileage", e.target.value)}
                          />
                        </div>
                        <div className="flex items-center gap-3 pt-6">
                          <Switch
                            id="full_tank"
                            checked={fuelForm.full_tank}
                            onCheckedChange={(checked) => updateFuelForm("full_tank", Boolean(checked))}
                          />
                          <Label htmlFor="full_tank" className="cursor-pointer font-normal">
                            Plein complet
                          </Label>
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="notes">Notes</Label>
                          <Input
                            id="notes"
                            value={fuelForm.notes}
                            onChange={(e) => updateFuelForm("notes", e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setFuelDialogOpen(false)} className="rounded-xl">
                          Annuler
                        </Button>
                        <Button type="submit" disabled={savingFuel} className="gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 shadow-lg shadow-primary/25">
                          {savingFuel ? "Enregistrement..." : "Enregistrer"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {fuelExpenses.length === 0 ? (
                  <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                    Aucun plein de carburant enregistré.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-3 font-medium">Date</th>
                          <th className="pb-3 font-medium">Station</th>
                          <th className="pb-3 font-medium">Carburant</th>
                          <th className="pb-3 font-medium text-right">Litres</th>
                          <th className="pb-3 font-medium text-right">Montant</th>
                          <th className="pb-3 font-medium text-right"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {fuelExpenses.map((refuel) => (
                          <tr key={refuel.id} className="border-b last:border-0 transition-colors hover:bg-muted/40">
                            <td className="py-4 text-muted-foreground">
                              {new Date(refuel.refuel_date).toLocaleDateString("fr-FR")}
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
                            <td className="py-4 capitalize text-muted-foreground">{fuelLabels[refuel.fuel_type]}</td>
                            <td className="py-4 text-right font-medium">{Number(refuel.liters).toLocaleString("fr-FR")} L</td>
                            <td className="py-4 text-right font-semibold">
                              {Number(refuel.amount).toLocaleString("fr-FR")} FCFA
                            </td>
                            <td className="py-4 text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleFuelDelete(refuel.id)}
                                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="costs">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Coût total maintenance</p>
                  <p className="mt-1 text-2xl font-bold">{totalMaintenanceCost.toLocaleString("fr-FR")} FCFA</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Coût total carburant</p>
                  <p className="mt-1 text-2xl font-bold">{totalFuelCost.toLocaleString("fr-FR")} FCFA</p>
                  <p className="mt-1 text-xs text-muted-foreground">{totalFuelLiters.toLocaleString("fr-FR")} L au total</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Coût total péages</p>
                  <p className="mt-1 text-2xl font-bold">{totalTollCost.toLocaleString("fr-FR")} FCFA</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Interventions</p>
                  <p className="mt-1 text-2xl font-bold">{workOrders.length}</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Coût moyen / intervention</p>
                  <p className="mt-1 text-2xl font-bold">
                    {workOrders.length ? Math.round(totalMaintenanceCost / workOrders.length).toLocaleString("fr-FR") : 0} FCFA
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Coût total véhicule</p>
                  <p className="mt-1 text-2xl font-bold">
                    {(totalMaintenanceCost + totalTollCost + totalFuelCost).toLocaleString("fr-FR")} FCFA
                  </p>
                </CardContent>
              </Card>
            </div>
            <Card className="mt-5 rounded-2xl border-none bg-card shadow-sm shadow-black/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Euro className="h-5 w-5 text-primary" />
                  Historique des coûts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {workOrders.length === 0 ? (
                  <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                    Aucune donnée de coût.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-3 font-medium">Date</th>
                          <th className="pb-3 font-medium">Titre</th>
                          <th className="pb-3 font-medium">Type</th>
                          <th className="pb-3 font-medium text-right">Coût</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workOrders.map((wo) => (
                          <tr key={wo.id} className="border-b last:border-0 transition-colors hover:bg-muted/40">
                            <td className="py-4 text-muted-foreground">
                              {wo.completed_at
                                ? new Date(wo.completed_at).toLocaleDateString("fr-FR")
                                : new Date(wo.created_at).toLocaleDateString("fr-FR")}
                            </td>
                            <td className="py-4 font-semibold">{wo.title}</td>
                            <td className="py-4 capitalize text-muted-foreground">{wo.type}</td>
                            <td className="py-4 text-right font-semibold">
                              {Number(wo.total_cost || 0).toLocaleString("fr-FR")} FCFA
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
