"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Car,
  FileText,
  IdCard,
  Pencil,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  api,
  getDriver,
  updateDriver,
  deleteDriver,
  listVehicles,
  listDriverDocuments,
  uploadDriverDocument,
  updateDriverDocument,
  deleteDriverDocument,
} from "@/lib/api";
import { toast } from "sonner";
import type { Document, Driver, Vehicle } from "@/types";

const driverDocTypeLabels: Record<string, string> = {
  license: "Permis de conduire",
  id_card: "Pièce d'identité",
  medical: "Visite médicale",
  insurance: "Assurance",
  other: "Autre",
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api/v1").replace("/api/v1", "");

export default function DriverProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const driverId = Number(params.id);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseCategories, setLicenseCategories] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [medicalCheckDate, setMedicalCheckDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [original, setOriginal] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    licenseNumber: "",
    licenseCategories: "",
    licenseExpiry: "",
    medicalCheckDate: "",
    isActive: true,
  });
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState("license");
  const [uploadFormKey, setUploadFormKey] = useState(0);
  const [docEditOpen, setDocEditOpen] = useState(false);
  const [savingDocEdit, setSavingDocEdit] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [docEditForm, setDocEditForm] = useState({
    name: "",
    document_type: "license",
    issue_date: "",
    expiry_date: "",
    reminder_days: "30",
  });

  function applyDriverToForm(d: Driver) {
    const nextFirstName = d.first_name;
    const nextLastName = d.last_name;
    const nextEmail = d.email || "";
    const nextPhone = d.phone || "";
    const nextLicenseNumber = d.license_number || "";
    const nextLicenseCategories = d.license_categories || "";
    const nextLicenseExpiry = d.license_expiry ? d.license_expiry.slice(0, 10) : "";
    const nextMedicalCheckDate = d.medical_check_date ? d.medical_check_date.slice(0, 10) : "";
    const nextIsActive = d.is_active;

    setFirstName(nextFirstName);
    setLastName(nextLastName);
    setEmail(nextEmail);
    setPhone(nextPhone);
    setLicenseNumber(nextLicenseNumber);
    setLicenseCategories(nextLicenseCategories);
    setLicenseExpiry(nextLicenseExpiry);
    setMedicalCheckDate(nextMedicalCheckDate);
    setIsActive(nextIsActive);
    setOriginal({
      firstName: nextFirstName,
      lastName: nextLastName,
      email: nextEmail,
      phone: nextPhone,
      licenseNumber: nextLicenseNumber,
      licenseCategories: nextLicenseCategories,
      licenseExpiry: nextLicenseExpiry,
      medicalCheckDate: nextMedicalCheckDate,
      isActive: nextIsActive,
    });
  }

  async function load() {
    setLoading(true);
    try {
      const d = await getDriver(driverId);
      setDriver(d);
      applyDriverToForm(d);

      const [vehiclesRes, docs] = await Promise.all([
        listVehicles(),
        listDriverDocuments(driverId).catch(() => [] as Document[]),
      ]);
      const assigned = vehiclesRes.items.find((v) => v.driver_id === driverId);
      setVehicle(assigned || null);
      setDocuments(docs);
    } catch (err: any) {
      toast.error(err.message || "Erreur de chargement");
      router.push("/drivers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [driverId]);

  function resetForm() {
    setFirstName(original.firstName);
    setLastName(original.lastName);
    setEmail(original.email);
    setPhone(original.phone);
    setLicenseNumber(original.licenseNumber);
    setLicenseCategories(original.licenseCategories);
    setLicenseExpiry(original.licenseExpiry);
    setMedicalCheckDate(original.medicalCheckDate);
    setIsActive(original.isActive);
    toast.info("Formulaire réinitialisé");
  }

  async function handleDocUpload(e: React.FormEvent<HTMLFormElement>) {
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
      await uploadDriverDocument(driverId, formData);
      toast.success(files.length > 1 ? `${files.length} documents ajoutés` : "Document ajouté");
      setUploadOpen(false);
      setDocType("license");
      setUploadFormKey((k) => k + 1);
      const docs = await listDriverDocuments(driverId);
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
      const updated = await updateDriverDocument(driverId, selectedDoc.id, {
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

  async function deleteDoc(doc: Document) {
    if (!confirm(`Supprimer ${doc.name} ?`)) return;
    try {
      await deleteDriverDocument(driverId, doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      if (selectedDoc?.id === doc.id) setSelectedDoc(null);
      toast.success("Document supprimé");
    } catch (err: any) {
      toast.error(err.message || "Erreur de suppression");
    }
  }

  async function save() {
    if (!driver) return;
    setSaving(true);
    try {
      const updated = await updateDriver(driver.id, {
        first_name: firstName,
        last_name: lastName,
        email: email || null,
        phone: phone || null,
        license_number: licenseNumber || null,
        license_categories: licenseCategories || null,
        license_expiry: licenseExpiry || null,
        medical_check_date: medicalCheckDate || null,
        is_active: isActive,
      } as Partial<Driver>);
      setDriver(updated);
      applyDriverToForm(updated);
      toast.success("Conducteur mis à jour");
    } catch (err: any) {
      toast.error(err.message || "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!driver) return;
    if (!confirm(`Supprimer ${driver.first_name} ${driver.last_name} ?`)) return;
    try {
      await deleteDriver(driver.id);
      toast.success("Conducteur supprimé");
      router.push("/drivers");
    } catch (err: any) {
      toast.error(err.message || "Erreur de suppression");
    }
  }

  if (loading || !driver) {
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

  const licenseExpired = licenseExpiry && new Date(licenseExpiry) < new Date();
  const licenseExpiringSoon =
    licenseExpiry &&
    !licenseExpired &&
    new Date(licenseExpiry) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/drivers">
              <Button variant="ghost" size="icon" className="rounded-xl">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {driver.first_name} {driver.last_name}
              </h1>
              <p className="text-sm text-muted-foreground">{driver.email || "Aucun email"}</p>
            </div>
          </div>
          <Badge className={cn("rounded-lg border-0 px-3 py-1 font-medium", isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
            {isActive ? "Actif" : "Inactif"}
          </Badge>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="overflow-hidden rounded-2xl border-none bg-card shadow-sm shadow-black/5 lg:col-span-2">
            <div className="relative h-32 bg-gradient-to-br from-primary to-blue-600">
              <div className="absolute -bottom-10 left-6 flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-card bg-card text-2xl font-bold text-primary shadow-lg">
                {driver.first_name[0]}{driver.last_name[0]}
              </div>
            </div>
            <CardContent className="pt-14">
              <CardTitle className="mb-4 text-lg font-semibold">Informations</CardTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Prénom</Label>
                  <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Nom</Label>
                  <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Téléphone</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license">Numéro de permis</Label>
                  <Input id="license" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="categories">Catégories</Label>
                  <Input id="categories" value={licenseCategories} onChange={(e) => setLicenseCategories(e.target.value)} placeholder="B, C, D..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="licenseExpiry">Expiration du permis</Label>
                  <DateInput
                    id="licenseExpiry"
                    value={licenseExpiry}
                    onValueChange={setLicenseExpiry}
                    className={cn(licenseExpired && "border-rose-400 text-rose-600", licenseExpiringSoon && "border-amber-400 text-amber-600")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="medical">Visite médicale</Label>
                  <DateInput id="medical" value={medicalCheckDate} onValueChange={setMedicalCheckDate} />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between rounded-xl bg-muted/40 p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Conducteur actif</span>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <Button variant="outline" onClick={resetForm} className="h-11 gap-2 rounded-xl px-5">
                  <RotateCcw className="h-4 w-4" />
                  Réinitialiser
                </Button>
                <Button variant="destructive" onClick={remove} className="h-11 gap-2 rounded-xl px-5">
                  <Trash2 className="h-4 w-4" />
                  Supprimer
                </Button>
                <Button onClick={save} disabled={saving} className="h-11 gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 px-5 shadow-lg shadow-primary/25">
                  <Save className="h-4 w-4" />
                  {saving ? "Sauvegarde..." : "Enregistrer"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Car className="h-5 w-5 text-primary" />
                  Véhicule affecté
                </CardTitle>
              </CardHeader>
              <CardContent>
                {vehicle ? (
                  <div className="space-y-3">
                    <p className="text-lg font-semibold">
                      {vehicle.brand} {vehicle.model}
                    </p>
                    <p className="text-sm text-muted-foreground">{vehicle.registration}</p>
                    <Link href={`/vehicles/${vehicle.id}`}>
                      <Button variant="outline" className="mt-2 w-full rounded-xl">
                        Voir la fiche véhicule
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="flex h-24 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                    Aucun véhicule affecté.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Calendar className="h-5 w-5 text-primary" />
                  Échéances
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <IdCard className="h-4 w-4" />
                    Permis
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      licenseExpired && "text-rose-600",
                      licenseExpiringSoon && "text-amber-600"
                    )}
                  >
                    {driver.license_expiry ? new Date(driver.license_expiry).toLocaleDateString("fr-FR") : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" />
                    Visite médicale
                  </span>
                  <span className="text-sm font-semibold">
                    {driver.medical_check_date ? new Date(driver.medical_check_date).toLocaleDateString("fr-FR") : "—"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <FileText className="h-5 w-5 text-primary" />
              Pièces du conducteur ({documents.length})
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setUploadOpen(true)}
                className="h-10 gap-2 rounded-xl px-4"
              >
                <Upload className="h-4 w-4" />
                Ajouter un document
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                Aucune pièce jointe. Ajoutez le permis, la pièce d&apos;identité, etc.
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => {
                  const fullUrl = doc.file_url?.startsWith("http") ? doc.file_url : `${API_BASE_URL}${doc.file_url || ""}`;
                  return (
                    <div
                      key={doc.id}
                      className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{doc.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {driverDocTypeLabels[doc.document_type] || doc.document_type}
                          {doc.expiry_date ? ` · Échéance ${new Date(doc.expiry_date).toLocaleDateString("fr-FR")}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {doc.file_url ? (
                          <a href={fullUrl} target="_blank" rel="noreferrer">
                            <Button variant="outline" className="h-9 rounded-xl px-3">
                              Ouvrir
                            </Button>
                          </a>
                        ) : null}
                        <Button variant="outline" onClick={() => openDocEdit(doc)} className="h-9 gap-1 rounded-xl px-3">
                          <Pencil className="h-3.5 w-3.5" />
                          Modifier
                        </Button>
                        <Button variant="destructive" onClick={() => deleteDoc(doc)} className="h-9 gap-1 rounded-xl px-3">
                          <Trash2 className="h-3.5 w-3.5" />
                          Supprimer
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent className="rounded-2xl border-none p-6 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Ajouter une pièce du conducteur</DialogTitle>
            </DialogHeader>
            <form key={uploadFormKey} onSubmit={handleDocUpload} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="driver-doc-name">Nom</Label>
                <Input id="driver-doc-name" name="name" placeholder="Permis B (optionnel si plusieurs fichiers)" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="driver-doc-type">Type</Label>
                <Select value={docType} onValueChange={(v) => setDocType(v || "license")}>
                  <SelectTrigger id="driver-doc-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(driverDocTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="driver-doc-issue">Date d&apos;émission</Label>
                  <Input id="driver-doc-issue" name="issue_date" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="driver-doc-expiry">Date d&apos;expiration</Label>
                  <Input id="driver-doc-expiry" name="expiry_date" type="date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="driver-doc-files">Fichiers</Label>
                <Input id="driver-doc-files" name="files" type="file" multiple required />
                <p className="text-xs text-muted-foreground">
                  Permis, pièce d&apos;identité, certificat médical… vous pouvez en joindre plusieurs.
                </p>
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
                <Label htmlFor="edit-driver-doc-name">Nom</Label>
                <Input
                  id="edit-driver-doc-name"
                  required
                  value={docEditForm.name}
                  onChange={(e) => setDocEditForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-driver-doc-type">Type</Label>
                <Select
                  value={docEditForm.document_type}
                  onValueChange={(v) => setDocEditForm((p) => ({ ...p, document_type: v || "other" }))}
                >
                  <SelectTrigger id="edit-driver-doc-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(driverDocTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-driver-doc-issue">Date d&apos;émission</Label>
                  <Input
                    id="edit-driver-doc-issue"
                    type="date"
                    value={docEditForm.issue_date}
                    onChange={(e) => setDocEditForm((p) => ({ ...p, issue_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-driver-doc-expiry">Date d&apos;expiration</Label>
                  <Input
                    id="edit-driver-doc-expiry"
                    type="date"
                    value={docEditForm.expiry_date}
                    onChange={(e) => setDocEditForm((p) => ({ ...p, expiry_date: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-driver-doc-reminder">Rappel (jours avant)</Label>
                <Input
                  id="edit-driver-doc-reminder"
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
      </div>
    </AppShell>
  );
}
