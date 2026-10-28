"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Calendar,
  Car,
  ClipboardCheck,
  ClipboardList,
  Droplets,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
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
  Wallet,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { AppShell, useCurrentUser } from "@/components/layout/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DetailList,
  EmptyState,
  Field,
  FormSection,
  PageHeader,
  Panel,
  Plate,
  SegmentButton,
  StatCard,
  StatusBadge,
  toneText,
} from "@/components/app/primitives";
import { cn } from "@/lib/utils";
import {
  api,
  assetUrl,
  uploadVehicleDocument,
  updateVehicleDocument,
  updateVehicle,
  listTollExpenses,
  createTollExpense,
  listFuelExpenses,
  createFuelExpense,
  deleteFuelExpense,
  uploadVehiclePhoto,
  deleteVehiclePhoto,
  getOperationsSettings,
  listNeeds,
  createNeed,
  listInspections,
} from "@/lib/api";
import { canRunInspections } from "@/lib/roles";
import {
  documentTypeLabels,
  energyLabels,
  fuelLabels,
  inspectionKindLabels,
  inspectionVerdict,
  needOriginLabels,
  needPriority,
  needStatus,
  requiredVehicleDocuments,
  tollMethodLabels,
  vehicleStatus,
  vehicleTypeLabels,
  workOrderStatus,
  workOrderType,
  type Tone,
  DOCUMENT_ACCEPT,
} from "@/lib/labels";
import { expiryTone, formatDate, formatMoney, formatNumber, formatRelativeDays, fullName, initials } from "@/lib/format";
import { toast } from "sonner";
import type {
  Document,
  Driver,
  Vehicle,
  WorkOrder,
  VehicleStatus,
  VehicleType,
  EnergyType,
  TollExpense,
  TollPaymentMethod,
  FuelExpense,
  FuelType,
  InspectionListItem,
  NeedPriority,
  VehicleNeed,
} from "@/types";

const statusItems = Object.fromEntries(
  (Object.keys(vehicleStatus) as VehicleStatus[]).map((s) => [s, vehicleStatus[s].label])
) as Record<string, string>;

const IMAGE_RE = /\.(jpg|jpeg|png|webp|gif)$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Ton et libellé d'échéance d'un document. */
function expiryState(expiry: string | null): { tone: Tone; label: string } | null {
  if (!expiry) return null;
  const date = new Date(expiry);
  if (date.getTime() < Date.now()) return { tone: "danger", label: "Expiré" };
  if (date <= new Date(Date.now() + 30 * DAY_MS)) return { tone: "warning", label: `Expire ${formatRelativeDays(expiry)}` };
  return { tone: "neutral", label: `Jusqu'au ${formatDate(expiry, "short")}` };
}

const DEFAULT_OIL_WARNING_KM = 2000;
const DEFAULT_DOC_WARNING_DAYS = 30;

/** État de la vidange à partir des km restants calculés par le serveur. */
function oilChangeState(dueInKm: number | null, warnKm: number): { tone: Tone; label: string } {
  if (dueInKm === null || dueInKm === undefined) return { tone: "neutral", label: "non renseignée" };
  if (dueInKm < 0) return { tone: "danger", label: `dépassée de ${formatNumber(-dueInKm, "km")}` };
  return { tone: dueInKm <= warnKm ? "warning" : "success", label: `dans ${formatNumber(dueInKm, "km")}` };
}

/** Conformité d'un document obligatoire : on retient le plus récent (expiration la plus lointaine). */
function requiredDocState(docs: Document[], type: string, warnDays: number): { tone: Tone; status: string } {
  const ofType = docs.filter((d) => d.document_type === type);
  if (ofType.length === 0) return { tone: "danger", status: "Manquant" };
  const latest = [...ofType].sort((a, b) => {
    const ta = a.expiry_date ? new Date(a.expiry_date).getTime() : -Infinity;
    const tb = b.expiry_date ? new Date(b.expiry_date).getTime() : -Infinity;
    return tb - ta;
  })[0];
  if (!latest.expiry_date) return { tone: "success", status: "Présent, sans échéance" };
  const tone = expiryTone(latest.expiry_date, warnDays + 1);
  if (tone === "danger") return { tone, status: "Expiré" };
  if (tone === "warning") return { tone, status: `Expire ${formatRelativeDays(latest.expiry_date)}` };
  return { tone: "success", status: `Valide jusqu'au ${formatDate(latest.expiry_date, "short")}` };
}

function numOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function HeroFact({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  tone?: Tone | null;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 text-subtle-foreground" />
        {label}
      </p>
      <p className={cn("mt-1 truncate text-sm font-semibold tabular", tone && toneText(tone))}>{value}</p>
    </div>
  );
}

function CountChip({ value }: { value: number }) {
  return <span className="rounded bg-muted px-1.5 text-[11px] font-medium text-muted-foreground tabular">{value}</span>;
}

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
  const [tab, setTab] = useState<string>("info");
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
    last_oil_change_km: "",
    oil_change_interval_km: "10000",
    fuel_tank_liters: "",
    fuel_consumption_l_100km: "",
    itts_bus_id: "",
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
  const [oilWarningKm, setOilWarningKm] = useState(DEFAULT_OIL_WARNING_KM);
  const [docWarningDays, setDocWarningDays] = useState(DEFAULT_DOC_WARNING_DAYS);
  const [needs, setNeeds] = useState<VehicleNeed[]>([]);
  const [needsTotal, setNeedsTotal] = useState(0);
  const [inspections, setInspections] = useState<InspectionListItem[]>([]);

  useEffect(() => {
    // Les mécaniciens n'ont pas accès aux paramètres (403) : on garde les seuils par défaut.
    getOperationsSettings()
      .then((settings) => {
        setOilWarningKm(settings.oil_change_warning_km ?? DEFAULT_OIL_WARNING_KM);
        setDocWarningDays(settings.document_warning_days ?? DEFAULT_DOC_WARNING_DAYS);
      })
      .catch(() => {});
  }, []);

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
      last_oil_change_km: v.last_oil_change_km != null ? String(v.last_oil_change_km) : "",
      oil_change_interval_km: String(v.oil_change_interval_km ?? 10000),
      fuel_tank_liters: v.fuel_tank_liters != null ? String(v.fuel_tank_liters) : "",
      fuel_consumption_l_100km: v.fuel_consumption_l_100km != null ? String(Number(v.fuel_consumption_l_100km)) : "",
      itts_bus_id: v.itts_bus_id || "",
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

  /** Besoins ouverts et états des lieux : chargés à part, un refus (rôle) ne bloque pas la fiche. */
  async function loadNeeds() {
    try {
      const res = await listNeeds({ vehicle_id: vehicleId, open_only: true });
      setNeeds(res.items);
      setNeedsTotal(res.total_estimated);
    } catch {
      setNeeds([]);
      setNeedsTotal(0);
    }
  }

  async function loadInspections() {
    try {
      setInspections(await listInspections({ vehicle_id: vehicleId }));
    } catch {
      setInspections([]);
    }
  }

  useEffect(() => {
    loadNeeds();
    loadInspections();
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
        last_oil_change_km: numOrNull(infoForm.last_oil_change_km),
        oil_change_interval_km: Number(infoForm.oil_change_interval_km || 10000),
        fuel_tank_liters: numOrNull(infoForm.fuel_tank_liters),
        fuel_consumption_l_100km: numOrNull(infoForm.fuel_consumption_l_100km),
        itts_bus_id: infoForm.itts_bus_id.trim() || null,
      } as unknown as Partial<Vehicle>);
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

  const totalTollCost = useMemo(() => tolls.reduce((sum, t) => sum + Number(t.amount || 0), 0), [tolls]);

  const totalFuelCost = useMemo(() => fuelExpenses.reduce((sum, f) => sum + Number(f.amount || 0), 0), [fuelExpenses]);

  const totalFuelLiters = useMemo(() => fuelExpenses.reduce((sum, f) => sum + Number(f.liters || 0), 0), [fuelExpenses]);

  const driverItems = useMemo(
    () => ({ "": "Aucun", ...Object.fromEntries(drivers.map((d) => [String(d.id), fullName(d)])) }),
    [drivers]
  );

  if (loading || !vehicle) {
    return (
      <AppShell>
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-7 w-64" />
          </div>
          <Skeleton className="h-52 w-full rounded-xl" />
          <div className="grid gap-6 xl:grid-cols-3">
            <Skeleton className="h-96 w-full rounded-xl xl:col-span-2" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </AppShell>
    );
  }

  const status = vehicleStatus[vehicle.status];
  const photoUrl = assetUrl(vehicle.photo_url);
  const vehicleName = `${vehicle.brand} ${vehicle.model}`;
  const totalCost = totalMaintenanceCost + totalTollCost + totalFuelCost;
  const typeLabel = vehicleTypeLabels[vehicle.vehicle_type] || vehicle.vehicle_type;
  const energyLabel = energyLabels[vehicle.energy] || vehicle.energy;
  const oilState = oilChangeState(vehicle.oil_change_due_in_km, oilWarningKm);
  const requiredDocs = requiredVehicleDocuments.map((type) => ({
    type,
    name: documentTypeLabels[type] || type,
    ...requiredDocState(documents, type, docWarningDays),
  }));

  function startEditing() {
    setTab("info");
    setEditingInfo(true);
  }

  return (
    <AppShell>
      <PageHeader
        title={vehicleName}
        breadcrumb={[{ label: "Véhicules", href: "/vehicles" }, { label: vehicleName }]}
        actions={
          <>
            <Link href={`/maintenance/new?vehicle_id=${vehicle.id}`} className={buttonVariants({ variant: "outline" })}>
              <Wrench className="size-4" />
              Nouvelle intervention
            </Link>
            <Button onClick={startEditing} disabled={editingInfo}>
              <Pencil className="size-4" />
              Modifier
            </Button>
          </>
        }
      />

      {/* ─────────── Hero ─────────── */}
      <section className="overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="grid md:grid-cols-[300px_1fr]">
          <div className="group relative h-52 border-b bg-surface-sunken md:h-full md:min-h-52 md:border-r md:border-b-0">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={vehicleName} className="absolute inset-0 size-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-subtle-foreground">
                <Car className="size-10" />
                <span className="text-xs">Aucune photo</span>
              </div>
            )}
            <div className="absolute right-3 bottom-3 flex gap-2">
              <label
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "cursor-pointer bg-card",
                  photoUploading && "pointer-events-none opacity-70"
                )}
              >
                {photoUploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                {vehicle.photo_url ? "Changer" : "Ajouter une photo"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoUpload} disabled={photoUploading} />
              </label>
              {vehicle.photo_url && (
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={handlePhotoDelete}
                  className="bg-card text-muted-foreground hover:text-danger"
                  title="Supprimer la photo"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-between gap-6 p-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Plate value={vehicle.registration} size="lg" />
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{vehicleName}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {typeLabel} · {energyLabel}
                  {vehicle.year ? ` · ${vehicle.year}` : ""}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-5 sm:grid-cols-3 lg:grid-cols-5">
              <HeroFact icon={Gauge} label="Kilométrage" value={formatNumber(vehicle.mileage, "km")} />
              <HeroFact icon={Calendar} label="Année" value={vehicle.year ?? "—"} />
              <HeroFact icon={Zap} label="Énergie" value={energyLabel} />
              <HeroFact icon={User} label="Chauffeur" value={driver ? fullName(driver) : "Non affecté"} />
              <HeroFact
                icon={Droplets}
                label="Vidange"
                value={oilState.label}
                tone={oilState.tone === "danger" || oilState.tone === "warning" ? oilState.tone : null}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── Corps ─────────── */}
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="gap-4">
            <div className="no-scrollbar overflow-x-auto border-b">
              <TabsList variant="line" className="h-10 gap-1 p-0">
                <TabsTrigger value="info" className="px-2.5">
                  Informations
                </TabsTrigger>
                <TabsTrigger value="documents" className="px-2.5">
                  Documents <CountChip value={documents.length} />
                </TabsTrigger>
                <TabsTrigger value="driver" className="px-2.5">
                  Chauffeur
                </TabsTrigger>
                <TabsTrigger value="maintenance" className="px-2.5">
                  Maintenance <CountChip value={workOrders.length} />
                </TabsTrigger>
                <TabsTrigger value="needs" className="px-2.5">
                  Besoins <CountChip value={needs.length} />
                </TabsTrigger>
                <TabsTrigger value="inspections" className="px-2.5">
                  États des lieux <CountChip value={inspections.length} />
                </TabsTrigger>
                <TabsTrigger value="tolls" className="px-2.5">
                  Péages <CountChip value={tolls.length} />
                </TabsTrigger>
                <TabsTrigger value="fuel" className="px-2.5">
                  Carburant <CountChip value={fuelExpenses.length} />
                </TabsTrigger>
                <TabsTrigger value="costs" className="px-2.5">
                  Coûts
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ── Informations ── */}
            <TabsContent value="info">
              {!editingInfo ? (
                <Panel
                  title="Détails du véhicule"
                  actions={
                    <Button variant="outline" size="sm" onClick={() => setEditingInfo(true)}>
                      <Pencil className="size-3.5" />
                      Modifier
                    </Button>
                  }
                >
                  <div className="grid gap-x-10 gap-y-2.5 md:grid-cols-2">
                    <DetailList
                      items={[
                        { label: "Immatriculation", value: <Plate value={vehicle.registration} size="sm" /> },
                        { label: "Marque", value: vehicle.brand },
                        { label: "Modèle", value: vehicle.model },
                        { label: "VIN", value: vehicle.vin ? <span className="font-mono text-xs">{vehicle.vin}</span> : "—" },
                        { label: "Année", value: vehicle.year || "—" },
                      ]}
                    />
                    <DetailList
                      className="border-t pt-2.5 md:border-t-0 md:pt-0"
                      items={[
                        { label: "Type", value: typeLabel },
                        { label: "Énergie", value: energyLabel },
                        { label: "Statut", value: <StatusBadge tone={status.tone}>{status.label}</StatusBadge> },
                        { label: "Kilométrage", value: formatNumber(vehicle.mileage, "km") },
                        { label: "Mise en circulation", value: formatDate(vehicle.first_registration_date) },
                        { label: "Prix d'achat", value: vehicle.purchase_price ? formatMoney(vehicle.purchase_price) : "—" },
                      ]}
                    />
                  </div>
                  <h3 className="mt-6 mb-2.5 text-[13px] font-medium text-muted-foreground">Entretien et carburant</h3>
                  <div className="grid gap-x-10 gap-y-2.5 md:grid-cols-2">
                    <DetailList
                      items={[
                        { label: "Dernière vidange", value: formatNumber(vehicle.last_oil_change_km, "km") },
                        { label: "Intervalle de vidange", value: formatNumber(vehicle.oil_change_interval_km, "km") },
                        { label: "Prochaine vidange", value: <StatusBadge tone={oilState.tone}>{oilState.label}</StatusBadge> },
                      ]}
                    />
                    <DetailList
                      className="border-t pt-2.5 md:border-t-0 md:pt-0"
                      items={[
                        { label: "Capacité du réservoir", value: formatNumber(vehicle.fuel_tank_liters, "L") },
                        { label: "Consommation moyenne", value: formatNumber(vehicle.fuel_consumption_l_100km, "L/100 km") },
                        {
                          label: "Identifiant ITTS",
                          value: vehicle.itts_bus_id ? <span className="font-mono text-xs">{vehicle.itts_bus_id}</span> : "—",
                        },
                      ]}
                    />
                  </div>
                  {vehicle.notes && (
                    <div className="mt-5 rounded-lg border bg-surface-sunken p-4">
                      <p className="text-xs font-medium text-muted-foreground">Notes</p>
                      <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{vehicle.notes}</p>
                    </div>
                  )}
                </Panel>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveVehicleInfo();
                  }}
                >
                  <Panel title="Modifier le véhicule" description="Les champs marqués d'un astérisque sont obligatoires.">
                    <div className="divide-y">
                      <FormSection title="Identification">
                        <Field label="Immatriculation" htmlFor="v-registration" required>
                          <Input
                            id="v-registration"
                            required
                            className="font-mono uppercase"
                            value={infoForm.registration}
                            onChange={(e) => setInfoForm((p) => ({ ...p, registration: e.target.value }))}
                          />
                        </Field>
                        <Field label="VIN" htmlFor="v-vin">
                          <Input
                            id="v-vin"
                            className="font-mono"
                            value={infoForm.vin}
                            onChange={(e) => setInfoForm((p) => ({ ...p, vin: e.target.value }))}
                          />
                        </Field>
                        <Field label="Marque" htmlFor="v-brand" required>
                          <Input
                            id="v-brand"
                            required
                            value={infoForm.brand}
                            onChange={(e) => setInfoForm((p) => ({ ...p, brand: e.target.value }))}
                          />
                        </Field>
                        <Field label="Modèle" htmlFor="v-model" required>
                          <Input
                            id="v-model"
                            required
                            value={infoForm.model}
                            onChange={(e) => setInfoForm((p) => ({ ...p, model: e.target.value }))}
                          />
                        </Field>
                        <Field label="Année" htmlFor="v-year">
                          <Input
                            id="v-year"
                            type="number"
                            value={infoForm.year}
                            onChange={(e) => setInfoForm((p) => ({ ...p, year: e.target.value }))}
                          />
                        </Field>
                        <Field label="Mise en circulation" htmlFor="v-first-reg">
                          <Input
                            id="v-first-reg"
                            type="date"
                            value={infoForm.first_registration_date}
                            onChange={(e) => setInfoForm((p) => ({ ...p, first_registration_date: e.target.value }))}
                          />
                        </Field>
                      </FormSection>

                      <FormSection title="Caractéristiques">
                        <Field label="Type" htmlFor="v-type">
                          <Select
                            items={vehicleTypeLabels}
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
                        </Field>
                        <Field label="Énergie" htmlFor="v-energy">
                          <Select
                            items={energyLabels}
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
                        </Field>
                        <Field label="Statut" htmlFor="v-status">
                          <Select
                            items={statusItems}
                            value={infoForm.status}
                            onValueChange={(v) => setInfoForm((p) => ({ ...p, status: (v || "available") as VehicleStatus }))}
                          >
                            <SelectTrigger id="v-status">
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
                        <Field label="Kilométrage (km)" htmlFor="v-mileage">
                          <Input
                            id="v-mileage"
                            type="number"
                            className="tabular"
                            value={infoForm.mileage}
                            onChange={(e) => setInfoForm((p) => ({ ...p, mileage: e.target.value }))}
                          />
                        </Field>
                        <Field label="Prix d'achat (FCFA)" htmlFor="v-price">
                          <Input
                            id="v-price"
                            type="number"
                            className="tabular"
                            value={infoForm.purchase_price}
                            onChange={(e) => setInfoForm((p) => ({ ...p, purchase_price: e.target.value }))}
                          />
                        </Field>
                      </FormSection>

                      <FormSection title="Entretien et carburant" description="Suivi des vidanges et de la consommation.">
                        <Field label="Kilométrage à la dernière vidange (km)" htmlFor="v-last-oil">
                          <Input
                            id="v-last-oil"
                            type="number"
                            min={0}
                            className="tabular"
                            value={infoForm.last_oil_change_km}
                            onChange={(e) => setInfoForm((p) => ({ ...p, last_oil_change_km: e.target.value }))}
                          />
                        </Field>
                        <Field label="Intervalle de vidange (km)" htmlFor="v-oil-interval" required>
                          <Input
                            id="v-oil-interval"
                            type="number"
                            min={500}
                            max={100000}
                            required
                            className="tabular"
                            value={infoForm.oil_change_interval_km}
                            onChange={(e) => setInfoForm((p) => ({ ...p, oil_change_interval_km: e.target.value }))}
                          />
                        </Field>
                        <Field label="Capacité du réservoir (L)" htmlFor="v-tank">
                          <Input
                            id="v-tank"
                            type="number"
                            min={0}
                            max={2000}
                            className="tabular"
                            value={infoForm.fuel_tank_liters}
                            onChange={(e) => setInfoForm((p) => ({ ...p, fuel_tank_liters: e.target.value }))}
                          />
                        </Field>
                        <Field label="Consommation moyenne (L/100 km)" htmlFor="v-consumption">
                          <Input
                            id="v-consumption"
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min={0}
                            max={200}
                            className="tabular"
                            value={infoForm.fuel_consumption_l_100km}
                            onChange={(e) => setInfoForm((p) => ({ ...p, fuel_consumption_l_100km: e.target.value }))}
                          />
                        </Field>
                        <Field label="Identifiant ITTS (car)" htmlFor="v-itts" hint="Facultatif.">
                          <Input
                            id="v-itts"
                            className="font-mono"
                            value={infoForm.itts_bus_id}
                            onChange={(e) => setInfoForm((p) => ({ ...p, itts_bus_id: e.target.value }))}
                          />
                        </Field>
                      </FormSection>

                      <FormSection title="Notes">
                        <Field label="Notes" htmlFor="v-notes" className="sm:col-span-2">
                          <Textarea
                            id="v-notes"
                            rows={4}
                            value={infoForm.notes}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInfoForm((p) => ({ ...p, notes: e.target.value }))}
                          />
                        </Field>
                      </FormSection>
                    </div>

                    <div className="-mx-5 mt-6 -mb-5 flex justify-end gap-2 border-t bg-surface-sunken px-5 py-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          applyVehicleToInfoForm(vehicle);
                          setEditingInfo(false);
                        }}
                      >
                        Annuler
                      </Button>
                      <Button type="submit" disabled={savingInfo}>
                        {savingInfo ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                        {savingInfo ? "Sauvegarde…" : "Enregistrer"}
                      </Button>
                    </div>
                  </Panel>
                </form>
              )}
            </TabsContent>

            {/* ── Documents ── */}
            <TabsContent value="documents" className="space-y-4">
              <Panel
                title="Documents"
                description="Carte grise, assurance, contrôle technique et autres pièces du véhicule."
                actions={
                  <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                    <DialogTrigger
                      render={
                        <Button size="sm">
                          <Upload className="size-3.5" />
                          Ajouter
                        </Button>
                      }
                    />
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Nouveau document</DialogTitle>
                      </DialogHeader>
                      <form key={uploadFormKey} onSubmit={handleUpload} className="space-y-4">
                        <Field label="Nom" htmlFor="docName" hint="Facultatif si vous envoyez plusieurs fichiers.">
                          <Input id="docName" name="name" placeholder="Carte grise 2026" />
                        </Field>
                        <Field label="Type" htmlFor="docType">
                          <Select items={documentTypeLabels} value={docType} onValueChange={(v) => setDocType(v || "registration_card")}>
                            <SelectTrigger id="docType">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(documentTypeLabels).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <div className="grid grid-cols-2 gap-4">
                          <Field label="Date d'émission" htmlFor="issueDate">
                            <Input id="issueDate" name="issue_date" type="date" />
                          </Field>
                          <Field label="Date d'expiration" htmlFor="expiryDate">
                            <Input id="expiryDate" name="expiry_date" type="date" />
                          </Field>
                        </div>
                        <Field label="Fichiers" htmlFor="files" required hint="Vous pouvez sélectionner plusieurs documents en même temps.">
                          <Input id="files" name="files" type="file" accept={DOCUMENT_ACCEPT} multiple required />
                        </Field>
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>
                            Annuler
                          </Button>
                          <Button type="submit" disabled={uploading}>
                            {uploading && <Loader2 className="size-4 animate-spin" />}
                            {uploading ? "Envoi…" : "Enregistrer"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                }
              >
                <Dialog open={docEditOpen} onOpenChange={setDocEditOpen}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Modifier le document</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleDocEditSubmit} className="space-y-4">
                      <Field label="Nom" htmlFor="edit-doc-name" required>
                        <Input
                          id="edit-doc-name"
                          required
                          value={docEditForm.name}
                          onChange={(e) => setDocEditForm((p) => ({ ...p, name: e.target.value }))}
                        />
                      </Field>
                      <Field label="Type" htmlFor="edit-doc-type">
                        <Select
                          items={documentTypeLabels}
                          value={docEditForm.document_type}
                          onValueChange={(v) => setDocEditForm((p) => ({ ...p, document_type: v || "other" }))}
                        >
                          <SelectTrigger id="edit-doc-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(documentTypeLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Date d'émission" htmlFor="edit-doc-issue">
                          <Input
                            id="edit-doc-issue"
                            type="date"
                            value={docEditForm.issue_date}
                            onChange={(e) => setDocEditForm((p) => ({ ...p, issue_date: e.target.value }))}
                          />
                        </Field>
                        <Field label="Date d'expiration" htmlFor="edit-doc-expiry">
                          <Input
                            id="edit-doc-expiry"
                            type="date"
                            value={docEditForm.expiry_date}
                            onChange={(e) => setDocEditForm((p) => ({ ...p, expiry_date: e.target.value }))}
                          />
                        </Field>
                      </div>
                      <Field label="Rappel (jours avant l'échéance)" htmlFor="edit-doc-reminder">
                        <Input
                          id="edit-doc-reminder"
                          type="number"
                          min={0}
                          value={docEditForm.reminder_days}
                          onChange={(e) => setDocEditForm((p) => ({ ...p, reminder_days: e.target.value }))}
                        />
                      </Field>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setDocEditOpen(false)}>
                          Annuler
                        </Button>
                        <Button type="submit" disabled={savingDocEdit}>
                          {savingDocEdit ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                          {savingDocEdit ? "Sauvegarde…" : "Enregistrer"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>

                {documents.length === 0 ? (
                  <EmptyState
                    icon={FileText}
                    title="Aucun document"
                    description="Ajoutez la carte grise, l'assurance ou le contrôle technique pour suivre leurs échéances."
                    className="py-10"
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {documents.map((doc) => {
                      const fileUrl = assetUrl(doc.file_url);
                      const isImage = IMAGE_RE.test(doc.file_url || "");
                      const expiry = expiryState(doc.expiry_date);
                      const selected = selectedDoc?.id === doc.id;
                      return (
                        <button
                          type="button"
                          key={doc.id}
                          onClick={() => openDoc(doc)}
                          className={cn(
                            "group overflow-hidden rounded-xl border bg-card text-left transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop focus-visible:ring-3 focus-visible:ring-primary/25 focus-visible:outline-none",
                            selected && "border-primary ring-1 ring-primary"
                          )}
                        >
                          <div className="relative h-32 overflow-hidden border-b bg-surface-sunken">
                            {isImage && fileUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={fileUrl} alt={doc.name} className="size-full object-cover" />
                            ) : (
                              <div className="flex size-full items-center justify-center text-subtle-foreground">
                                <FileText className="size-8" />
                              </div>
                            )}
                            {expiry && (
                              <StatusBadge tone={expiry.tone} className="absolute top-2.5 right-2.5 bg-card">
                                {expiry.label}
                              </StatusBadge>
                            )}
                          </div>
                          <div className="space-y-0.5 px-3.5 py-3">
                            <p className="truncate text-sm font-medium">{doc.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {documentTypeLabels[doc.document_type] || doc.document_type}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Panel>

              {selectedDoc &&
                (() => {
                  const fileUrl = assetUrl(selectedDoc.file_url);
                  const isImage = IMAGE_RE.test(selectedDoc.file_url || "");
                  const expiry = expiryState(selectedDoc.expiry_date);
                  return (
                    <Panel
                      title={selectedDoc.name}
                      description={documentTypeLabels[selectedDoc.document_type] || selectedDoc.document_type}
                      actions={
                        <Button variant="ghost" size="icon-sm" onClick={() => setSelectedDoc(null)} title="Fermer">
                          <X className="size-4" />
                        </Button>
                      }
                    >
                      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                        <div className="relative flex h-72 items-center justify-center overflow-hidden rounded-lg border bg-surface-sunken">
                          {isImage && fileUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={fileUrl} alt={selectedDoc.name} className="size-full object-contain" />
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-subtle-foreground">
                              <FileText className="size-10" />
                              <span className="text-xs">Aperçu non disponible</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col justify-between gap-6">
                          <DetailList
                            items={[
                              {
                                label: "Échéance",
                                value: expiry ? (
                                  <span className="inline-flex items-center gap-2">
                                    {formatDate(selectedDoc.expiry_date)}
                                    {expiry.tone !== "neutral" && <StatusBadge tone={expiry.tone}>{expiry.label}</StatusBadge>}
                                  </span>
                                ) : (
                                  "—"
                                ),
                              },
                              { label: "Date d'émission", value: formatDate(selectedDoc.issue_date) },
                              { label: "Rappel", value: `${selectedDoc.reminder_days} jours avant` },
                              {
                                label: "Fichier",
                                value: fileUrl ? (
                                  <a
                                    href={fileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-primary hover:underline"
                                  >
                                    Ouvrir
                                    <ExternalLink className="size-3.5" />
                                  </a>
                                ) : (
                                  "—"
                                ),
                              },
                            ]}
                          />
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              variant="outline"
                              className="text-danger hover:text-danger"
                              onClick={() => {
                                deleteDoc(selectedDoc);
                                setSelectedDoc(null);
                              }}
                            >
                              <Trash2 className="size-4" />
                              Supprimer
                            </Button>
                            <Button variant="outline" onClick={() => openDocEdit(selectedDoc)}>
                              <Pencil className="size-4" />
                              Modifier
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Panel>
                  );
                })()}
            </TabsContent>

            {/* ── Chauffeur ── */}
            <TabsContent value="driver">
              <Panel title="Chauffeur affecté" description="Conducteur attitré de ce véhicule.">
                {driver ? (
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                    <div className="flex items-center gap-3 sm:w-52 sm:flex-col sm:items-start">
                      <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary-subtle text-lg font-semibold text-primary">
                        {initials(driver.first_name, driver.last_name)}
                      </span>
                      <div className="min-w-0">
                        <Link href={`/drivers/${driver.id}`} className="block truncate font-medium hover:underline">
                          {fullName(driver)}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">{driver.email || "Pas d'e-mail"}</p>
                      </div>
                    </div>
                    <DetailList
                      className="flex-1"
                      items={[
                        { label: "Téléphone", value: driver.phone || "—" },
                        { label: "N° de permis", value: driver.license_number || "—" },
                        { label: "Catégories", value: driver.license_categories || "—" },
                        { label: "Expiration du permis", value: formatDate(driver.license_expiry) },
                      ]}
                    />
                  </div>
                ) : (
                  <EmptyState
                    icon={User}
                    title="Aucun chauffeur affecté"
                    description="Choisissez un conducteur ci-dessous pour l'affecter à ce véhicule."
                    className="py-8"
                  />
                )}
                <div className="-mx-5 mt-5 -mb-5 flex flex-col gap-2 border-t bg-surface-sunken px-5 py-4 sm:flex-row sm:items-center">
                  <Select items={driverItems} value={selectedDriverId} onValueChange={(v) => setSelectedDriverId(v || "")}>
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
                  <Button onClick={() => assignDriver(selectedDriverId)}>
                    <Plus className="size-4" />
                    Affecter
                  </Button>
                </div>
              </Panel>
            </TabsContent>

            {/* ── Maintenance ── */}
            <TabsContent value="maintenance">
              <Panel
                flush
                title="Ordres de travail"
                description="Interventions préventives et curatives sur ce véhicule."
                actions={
                  <Link href={`/maintenance/new?vehicle_id=${vehicle.id}`} className={buttonVariants({ size: "sm" })}>
                    <Plus className="size-3.5" />
                    Nouvelle intervention
                  </Link>
                }
              >
                {workOrders.length === 0 ? (
                  <EmptyState icon={Wrench} title="Aucun ordre de travail" description="Les interventions sur ce véhicule apparaîtront ici." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Intervention</TableHead>
                        <TableHead className="hidden sm:table-cell">Type</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Coût</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workOrders.map((wo) => {
                        const woStatus = workOrderStatus[wo.status];
                        return (
                          <TableRow key={wo.id} className="group cursor-pointer" onClick={() => router.push(`/maintenance/${wo.id}`)}>
                            <TableCell className="max-w-0 w-full">
                              <p className="truncate font-medium">{wo.title}</p>
                              <p className="truncate text-xs text-muted-foreground">{wo.description || "—"}</p>
                            </TableCell>
                            <TableCell className="hidden text-muted-foreground sm:table-cell">{workOrderType[wo.type] ?? wo.type}</TableCell>
                            <TableCell>
                              {woStatus ? <StatusBadge tone={woStatus.tone}>{woStatus.label}</StatusBadge> : wo.status}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular">{wo.total_cost ? formatMoney(wo.total_cost) : "—"}</TableCell>
                            <TableCell className="pr-4">
                              <ChevronRight className="size-4 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </Panel>
            </TabsContent>

            {/* ── Besoins ── */}
            <TabsContent value="needs">
              <VehicleNeedsPanel vehicleId={vehicle.id} needs={needs} total={needsTotal} onCreated={loadNeeds} />
            </TabsContent>

            {/* ── États des lieux ── */}
            <TabsContent value="inspections">
              <VehicleInspectionsPanel vehicleId={vehicle.id} inspections={inspections} />
            </TabsContent>

            {/* ── Péages ── */}
            <TabsContent value="tolls">
              <Panel
                flush
                title="Dépenses de péage"
                description={tolls.length ? `${formatMoney(totalTollCost)} au total` : undefined}
                actions={
                  <Dialog open={tollDialogOpen} onOpenChange={setTollDialogOpen}>
                    <DialogTrigger
                      render={
                        <Button size="sm" onClick={openTollDialog}>
                          <Plus className="size-3.5" />
                          Nouvelle dépense
                        </Button>
                      }
                    />
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Nouvelle dépense de péage</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleTollSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <Field label="Véhicule" className="sm:col-span-2">
                            <Input value={`${vehicle.registration} — ${vehicleName}`} disabled />
                          </Field>
                          <Field label="Conducteur" className="sm:col-span-2">
                            <Select items={driverItems} value={tollForm.driver_id} onValueChange={(v) => updateTollForm("driver_id", v || "")}>
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
                          </Field>
                          <Field label="Nom du péage" htmlFor="toll_name" required className="sm:col-span-2">
                            <Input
                              id="toll_name"
                              required
                              placeholder="Ex. : Péage autoroute du Nord"
                              value={tollForm.toll_name}
                              onChange={(e) => updateTollForm("toll_name", e.target.value)}
                            />
                          </Field>
                          <Field label="Montant (FCFA)" htmlFor="toll_amount" required>
                            <Input
                              id="toll_amount"
                              type="number"
                              required
                              value={tollForm.amount}
                              onChange={(e) => updateTollForm("amount", e.target.value)}
                            />
                          </Field>
                          <Field label="Moyen de paiement">
                            <Select
                              items={tollMethodLabels}
                              value={tollForm.payment_method}
                              onValueChange={(v) => {
                                if (v) updateTollForm("payment_method", v);
                              }}
                            >
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
                          </Field>
                          <Field label="Date" htmlFor="expense_date" required>
                            <Input
                              id="expense_date"
                              type="date"
                              required
                              value={tollForm.expense_date}
                              onChange={(e) => updateTollForm("expense_date", e.target.value)}
                            />
                          </Field>
                          <Field label="Kilométrage" htmlFor="toll_mileage">
                            <Input
                              id="toll_mileage"
                              type="number"
                              value={tollForm.mileage}
                              onChange={(e) => updateTollForm("mileage", e.target.value)}
                            />
                          </Field>
                          <Field label="Notes" htmlFor="toll_notes" className="sm:col-span-2">
                            <Input id="toll_notes" value={tollForm.notes} onChange={(e) => updateTollForm("notes", e.target.value)} />
                          </Field>
                        </div>
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setTollDialogOpen(false)}>
                            Annuler
                          </Button>
                          <Button type="submit" disabled={savingToll}>
                            {savingToll && <Loader2 className="size-4 animate-spin" />}
                            {savingToll ? "Enregistrement…" : "Enregistrer"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                }
              >
                {tolls.length === 0 ? (
                  <EmptyState icon={Landmark} title="Aucune dépense de péage" description="Enregistrez les passages au péage pour suivre ces frais." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Péage</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="hidden sm:table-cell">Paiement</TableHead>
                        <TableHead className="text-right">Montant</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tolls.map((toll) => (
                        <TableRow key={toll.id}>
                          <TableCell className="font-medium">{toll.toll_name}</TableCell>
                          <TableCell className="text-muted-foreground tabular">{formatDate(toll.expense_date)}</TableCell>
                          <TableCell className="hidden text-muted-foreground sm:table-cell">
                            {tollMethodLabels[toll.payment_method] ?? toll.payment_method}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular">{formatMoney(toll.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Panel>
            </TabsContent>

            {/* ── Carburant ── */}
            <TabsContent value="fuel">
              <Panel
                flush
                title="Pleins de carburant"
                description={
                  fuelExpenses.length ? `${formatNumber(totalFuelLiters, "L")} · ${formatMoney(totalFuelCost)} au total` : undefined
                }
                actions={
                  <Dialog open={fuelDialogOpen} onOpenChange={setFuelDialogOpen}>
                    <DialogTrigger
                      render={
                        <Button size="sm" onClick={openFuelDialog}>
                          <Plus className="size-3.5" />
                          Nouveau plein
                        </Button>
                      }
                    />
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Nouveau plein de carburant</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleFuelSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <Field label="Véhicule" className="sm:col-span-2">
                            <Input value={`${vehicle.registration} — ${vehicleName}`} disabled />
                          </Field>
                          <Field label="Conducteur">
                            <Select items={driverItems} value={fuelForm.driver_id} onValueChange={(v) => updateFuelForm("driver_id", v || "")}>
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
                          </Field>
                          <Field label="Carburant">
                            <Select
                              items={fuelLabels}
                              value={fuelForm.fuel_type}
                              onValueChange={(v) => {
                                if (v) updateFuelForm("fuel_type", v);
                              }}
                            >
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
                          </Field>
                          <Field label="Litres" htmlFor="liters" required>
                            <Input
                              id="liters"
                              type="number"
                              step="0.01"
                              required
                              value={fuelForm.liters}
                              onChange={(e) => updateFuelForm("liters", e.target.value)}
                            />
                          </Field>
                          <Field label="Prix / litre (FCFA)" htmlFor="price_per_liter">
                            <Input
                              id="price_per_liter"
                              type="number"
                              step="0.01"
                              value={fuelForm.price_per_liter}
                              onChange={(e) => updateFuelForm("price_per_liter", e.target.value)}
                            />
                          </Field>
                          <Field label="Montant total (FCFA)" htmlFor="fuel_amount" hint="Calculé automatiquement si vide.">
                            <Input
                              id="fuel_amount"
                              type="number"
                              step="0.01"
                              value={fuelForm.amount}
                              onChange={(e) => updateFuelForm("amount", e.target.value)}
                            />
                          </Field>
                          <Field label="Date" htmlFor="refuel_date" required>
                            <Input
                              id="refuel_date"
                              type="date"
                              required
                              value={fuelForm.refuel_date}
                              onChange={(e) => updateFuelForm("refuel_date", e.target.value)}
                            />
                          </Field>
                          <Field label="Station" htmlFor="station_name">
                            <Input id="station_name" value={fuelForm.station_name} onChange={(e) => updateFuelForm("station_name", e.target.value)} />
                          </Field>
                          <Field label="Kilométrage" htmlFor="fuel_mileage">
                            <Input
                              id="fuel_mileage"
                              type="number"
                              value={fuelForm.mileage}
                              onChange={(e) => updateFuelForm("mileage", e.target.value)}
                            />
                          </Field>
                          <label
                            htmlFor="full_tank"
                            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-surface-sunken px-3 py-2.5 sm:col-span-2"
                          >
                            <span>
                              <span className="block text-[13px] font-medium">Plein complet</span>
                              <span className="block text-xs text-muted-foreground">Réservoir rempli à ras, utile au calcul de consommation.</span>
                            </span>
                            <Switch
                              id="full_tank"
                              checked={fuelForm.full_tank}
                              onCheckedChange={(checked) => updateFuelForm("full_tank", Boolean(checked))}
                            />
                          </label>
                          <Field label="Notes" htmlFor="fuel_notes" className="sm:col-span-2">
                            <Input id="fuel_notes" value={fuelForm.notes} onChange={(e) => updateFuelForm("notes", e.target.value)} />
                          </Field>
                        </div>
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setFuelDialogOpen(false)}>
                            Annuler
                          </Button>
                          <Button type="submit" disabled={savingFuel}>
                            {savingFuel && <Loader2 className="size-4 animate-spin" />}
                            {savingFuel ? "Enregistrement…" : "Enregistrer"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                }
              >
                {fuelExpenses.length === 0 ? (
                  <EmptyState icon={Fuel} title="Aucun plein enregistré" description="Ajoutez les pleins pour suivre la consommation et les dépenses de carburant." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Station</TableHead>
                        <TableHead className="hidden sm:table-cell">Carburant</TableHead>
                        <TableHead className="text-right">Litres</TableHead>
                        <TableHead className="text-right">Montant</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fuelExpenses.map((refuel) => (
                        <TableRow key={refuel.id}>
                          <TableCell className="text-muted-foreground tabular">{formatDate(refuel.refuel_date)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{refuel.station_name || "—"}</span>
                              {refuel.full_tank && <StatusBadge tone="success">Plein</StatusBadge>}
                            </div>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground sm:table-cell">
                            {fuelLabels[refuel.fuel_type] ?? refuel.fuel_type}
                          </TableCell>
                          <TableCell className="text-right tabular">{formatNumber(refuel.liters, "L")}</TableCell>
                          <TableCell className="text-right font-medium tabular">{formatMoney(refuel.amount)}</TableCell>
                          <TableCell className="pr-3 text-right">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleFuelDelete(refuel.id)}
                              className="text-muted-foreground hover:text-danger"
                              title="Supprimer ce plein"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Panel>
            </TabsContent>

            {/* ── Coûts ── */}
            <TabsContent value="costs" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard label="Coût total véhicule" value={formatMoney(totalCost)} icon={Wallet} hint="Maintenance, carburant et péages" />
                <StatCard label="Maintenance" value={formatMoney(totalMaintenanceCost)} icon={Wrench} hint={`${workOrders.length} intervention(s)`} />
                <StatCard
                  label="Coût moyen / intervention"
                  value={formatMoney(workOrders.length ? Math.round(totalMaintenanceCost / workOrders.length) : 0)}
                  icon={Gauge}
                />
                <StatCard label="Carburant" value={formatMoney(totalFuelCost)} icon={Fuel} hint={`${formatNumber(totalFuelLiters, "L")} au total`} />
                <StatCard label="Péages" value={formatMoney(totalTollCost)} icon={Landmark} hint={`${tolls.length} passage(s)`} />
                <StatCard label="Interventions" value={formatNumber(workOrders.length)} icon={Calendar} />
              </div>

              <Panel flush title="Historique des coûts de maintenance">
                {workOrders.length === 0 ? (
                  <EmptyState icon={Wallet} title="Aucune donnée de coût" description="Les coûts des interventions apparaîtront ici." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Intervention</TableHead>
                        <TableHead className="hidden sm:table-cell">Type</TableHead>
                        <TableHead className="text-right">Coût</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workOrders.map((wo) => (
                        <TableRow key={wo.id}>
                          <TableCell className="text-muted-foreground tabular">{formatDate(wo.completed_at || wo.created_at)}</TableCell>
                          <TableCell className="font-medium">{wo.title}</TableCell>
                          <TableCell className="hidden text-muted-foreground sm:table-cell">{workOrderType[wo.type] ?? wo.type}</TableCell>
                          <TableCell className="text-right font-medium tabular">{formatMoney(wo.total_cost || 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Panel>
            </TabsContent>
          </Tabs>
        </div>

        {/* ─────────── Colonne latérale ─────────── */}
        <aside className="space-y-6">
          <Panel title="Conformité pour le départ" actions={<ShieldCheck className="size-4 text-subtle-foreground" />}>
            <DetailList
              items={[
                ...requiredDocs.map((d) => ({
                  label: d.name,
                  value: <StatusBadge tone={d.tone}>{d.status}</StatusBadge>,
                })),
                {
                  label: "Vidange",
                  value: (
                    <StatusBadge tone={oilState.tone}>
                      {oilState.label.charAt(0).toUpperCase() + oilState.label.slice(1)}
                    </StatusBadge>
                  ),
                },
              ]}
            />
            <p className="mt-4 text-xs text-muted-foreground">Contrôlé automatiquement avant chaque départ.</p>
          </Panel>

          <Panel title="Synthèse des coûts" actions={<Wallet className="size-4 text-subtle-foreground" />}>
            <p className="text-[1.5rem] leading-none font-semibold tracking-tight tabular">{formatMoney(totalCost)}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">Coût cumulé enregistré pour ce véhicule</p>
            <DetailList
              className="mt-4 border-t pt-2.5"
              items={[
                { label: "Maintenance", value: formatMoney(totalMaintenanceCost) },
                { label: "Carburant", value: formatMoney(totalFuelCost) },
                { label: "Péages", value: formatMoney(totalTollCost) },
                { label: "Volume carburant", value: formatNumber(totalFuelLiters, "L") },
              ]}
            />
          </Panel>

          <Panel
            title="Chauffeur"
            actions={
              <Button variant="ghost" size="sm" onClick={() => setTab("driver")}>
                {driver ? "Changer" : "Affecter"}
              </Button>
            }
          >
            {driver ? (
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary-subtle text-sm font-semibold text-primary">
                  {initials(driver.first_name, driver.last_name)}
                </span>
                <div className="min-w-0">
                  <Link href={`/drivers/${driver.id}`} className="block truncate text-sm font-medium hover:underline">
                    {fullName(driver)}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">{driver.phone || driver.email || "—"}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun chauffeur affecté à ce véhicule.</p>
            )}
          </Panel>

          <Panel title="Fiche technique">
            <DetailList
              items={[
                { label: "Type", value: typeLabel },
                { label: "VIN", value: vehicle.vin ? <span className="font-mono text-xs">{vehicle.vin}</span> : "—" },
                { label: "Mise en circulation", value: formatDate(vehicle.first_registration_date) },
                { label: "Prix d'achat", value: vehicle.purchase_price ? formatMoney(vehicle.purchase_price) : "—" },
                { label: "Documents", value: formatNumber(documents.length) },
              ]}
            />
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}

/* ───────────────────────── Besoins du car ───────────────────────── */

function VehicleNeedsPanel({
  vehicleId,
  needs,
  total,
  onCreated,
}: {
  vehicleId: number;
  needs: VehicleNeed[];
  total: number;
  onCreated: () => void;
}) {
  const user = useCurrentUser();
  const canWrite = user ? canRunInspections(user.role) : false;
  const [open, setOpen] = useState(false);

  return (
    <Panel
      flush
      title="Besoins ouverts"
      description={needs.length ? `${formatMoney(total)} à prévoir` : "Ce qu'il faut prévoir sur ce car avant une dépense."}
      actions={
        <>
          <Link href={`/needs?vehicle_id=${vehicleId}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
            Tout voir
          </Link>
          {canWrite && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger
                render={
                  <Button size="sm">
                    <Plus className="size-3.5" />
                    Ajouter un besoin
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Ajouter un besoin</DialogTitle>
                </DialogHeader>
                <VehicleNeedForm
                  vehicleId={vehicleId}
                  onClose={() => setOpen(false)}
                  onCreated={() => {
                    toast.success("Besoin ajouté");
                    onCreated();
                  }}
                />
              </DialogContent>
            </Dialog>
          )}
        </>
      }
    >
      {needs.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Aucun besoin ouvert" description="Les besoins relevés lors des états des lieux apparaîtront ici." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Besoin</TableHead>
              <TableHead className="hidden sm:table-cell">Priorité</TableHead>
              <TableHead className="hidden md:table-cell">Origine</TableHead>
              <TableHead className="text-right">Coût estimé</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {needs.map((n) => {
              const prio = needPriority[n.priority];
              const st = needStatus[n.status];
              return (
                <TableRow key={n.id}>
                  <TableCell className="max-w-0 w-full">
                    <p className="truncate font-medium">{n.title}</p>
                    {n.details && <p className="truncate text-xs text-muted-foreground">{n.details}</p>}
                    <StatusBadge tone={prio.tone} className="mt-1 sm:hidden">
                      {prio.label}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <StatusBadge tone={prio.tone}>{prio.label}</StatusBadge>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{n.origin_label || needOriginLabels[n.origin]}</TableCell>
                  <TableCell className="text-right font-medium tabular">{n.estimated_cost != null ? formatMoney(n.estimated_cost) : "—"}</TableCell>
                  <TableCell>
                    {n.work_order_id ? (
                      <Link href={`/maintenance/${n.work_order_id}`} title="Voir l'intervention">
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      </Link>
                    ) : (
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={5}>
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">Total à prévoir</span>
                  <span className="font-semibold tabular">{formatMoney(total)}</span>
                </div>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </Panel>
  );
}

function VehicleNeedForm({ vehicleId, onCreated, onClose }: { vehicleId: number; onCreated: () => void; onClose: () => void }) {
  const [form, setForm] = useState({ title: "", priority: "this_week" as NeedPriority, estimated_cost: "", details: "" });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.title.trim().length < 2) {
      toast.error("L'intitulé doit faire au moins 2 caractères");
      return;
    }
    setSaving(true);
    try {
      await createNeed({
        vehicle_id: vehicleId,
        title: form.title.trim(),
        details: form.details.trim() || null,
        priority: form.priority,
        estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : null,
      });
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
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

/* ───────────────────────── États des lieux du car ───────────────────────── */

function VehicleInspectionsPanel({ vehicleId, inspections }: { vehicleId: number; inspections: InspectionListItem[] }) {
  const router = useRouter();
  const user = useCurrentUser();
  const canWrite = user ? canRunInspections(user.role) : false;

  return (
    <Panel
      flush
      title="États des lieux"
      description="Contrôles de départ et d'arrivée de ce car."
      actions={
        canWrite ? (
          <Link href={`/inspections/new?vehicle_id=${vehicleId}&kind=departure`} className={buttonVariants({ size: "sm" })}>
            <Plus className="size-3.5" />
            Nouvel état des lieux
          </Link>
        ) : undefined
      }
    >
      {inspections.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Aucun état des lieux" description="Les états des lieux de départ et d'arrivée apparaîtront ici." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="hidden sm:table-cell">Numéro</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Verdict</TableHead>
              <TableHead className="hidden md:table-cell">Statut</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {inspections.map((i) => {
              const verdict = i.verdict ? inspectionVerdict[i.verdict] : null;
              return (
                <TableRow key={i.id} className="group cursor-pointer" onClick={() => router.push(`/inspections/${i.id}`)}>
                  <TableCell className="tabular">
                    <Link href={`/inspections/${i.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {formatDate(i.scheduled_departure_at || i.created_at)}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">{i.number}</TableCell>
                  <TableCell>
                    <StatusBadge tone={i.kind === "departure" ? "info" : "neutral"}>{inspectionKindLabels[i.kind]}</StatusBadge>
                  </TableCell>
                  <TableCell>
                    {verdict ? (
                      <span className="inline-flex items-center gap-2">
                        <StatusBadge tone={verdict.tone}>{verdict.label}</StatusBadge>
                        {i.score != null && <span className="text-xs text-muted-foreground tabular">{i.score}/100</span>}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <StatusBadge tone={i.status === "validated" ? "success" : "warning"}>{i.status === "validated" ? "Validé" : "Brouillon"}</StatusBadge>
                  </TableCell>
                  <TableCell className="pr-4">
                    <ChevronRight className="size-4 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
