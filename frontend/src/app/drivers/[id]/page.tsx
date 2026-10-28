"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Car, ExternalLink, FileText, KeyRound, Mail, Pencil, Phone, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { AppShell, useCurrentUser } from "@/components/layout/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DetailList, EmptyState, Field, FormSection, PageHeader, Panel, Plate, StatusBadge, toneText } from "@/components/app/primitives";
import { cn } from "@/lib/utils";
import {
  assetUrl,
  getDriver,
  updateDriver,
  deleteDriver,
  listVehicles,
  listDriverDocuments,
  uploadDriverDocument,
  updateDriverDocument,
  deleteDriverDocument,
  setDriverPin,
} from "@/lib/api";
import { documentTypeLabels, staffTypeLabels, DOCUMENT_ACCEPT } from "@/lib/labels";
import { canManagePins } from "@/lib/roles";
import { formatDate, formatRelativeDays, fullName, initials, expiryTone } from "@/lib/format";
import { toast } from "sonner";
import type { Document, Driver, StaffType, Vehicle } from "@/types";

/** Types de pièces proposés pour un conducteur (libellés partagés). */
const driverDocTypes = ["license", "id_card", "medical", "insurance", "other"] as const;

/** Ton d'une échéance : expirée = danger, moins de 30 jours = warning. */
function ExpiryBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const tone = expiryTone(value);
  if (tone === "danger") return <StatusBadge tone="danger">Expiré</StatusBadge>;
  if (tone === "warning") return <StatusBadge tone="warning">{formatRelativeDays(value)}</StatusBadge>;
  return <StatusBadge tone="success">Valide</StatusBadge>;
}

const PIN_PATTERN = /^\d{4,6}$/;

/**
 * PIN de signature (états des lieux, autorisations de départ).
 * Rendu sous AppShell : useCurrentUser() y est disponible. Le PIN n'est jamais affiché ni conservé.
 */
function SignaturePinPanel({ driver, onUpdated }: { driver: Driver; onUpdated: (d: Driver) => void }) {
  const user = useCurrentUser();
  const canManage = user ? canManagePins(user.role) : false;
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  function openDialog(next: boolean) {
    // Les champs sont vidés à chaque ouverture/fermeture.
    setPin("");
    setConfirmPin("");
    setOpen(next);
  }

  const pinInvalid = pin !== "" && !PIN_PATTERN.test(pin);
  const mismatch = confirmPin !== "" && confirmPin !== pin;
  const canSubmit = PIN_PATTERN.test(pin) && pin === confirmPin && !savingPin;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!PIN_PATTERN.test(pin)) {
      toast.error("Le PIN doit comporter 4 à 6 chiffres");
      return;
    }
    if (pin !== confirmPin) {
      toast.error("Les deux PIN ne correspondent pas");
      return;
    }
    setSavingPin(true);
    try {
      const updated = await setDriverPin(driver.id, pin);
      onUpdated(updated);
      toast.success(driver.has_pin ? "PIN modifié" : "PIN défini");
      openDialog(false);
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'enregistrement du PIN");
    } finally {
      setSavingPin(false);
    }
  }

  return (
    <Panel title="PIN de signature">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg border",
              driver.has_pin ? "border-success-border bg-success-subtle text-success" : "border-warning-border bg-warning-subtle text-warning"
            )}
          >
            <KeyRound className="size-4" />
          </span>
          <div className="min-w-0">
            <StatusBadge tone={driver.has_pin ? "success" : "warning"}>{driver.has_pin ? "Défini" : "Non défini"}</StatusBadge>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">Sert à signer les états des lieux et les autorisations de départ.</p>
        {canManage && (
          <Button variant="outline" className="w-full" onClick={() => openDialog(true)}>
            <KeyRound className="size-4" />
            {driver.has_pin ? "Changer le PIN" : "Définir le PIN"}
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={openDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{driver.has_pin ? "Changer le PIN" : "Définir le PIN"}</DialogTitle>
            <DialogDescription>
              PIN de {fullName(driver)} : 4 à 6 chiffres. Il ne sera plus affiché après l&apos;enregistrement.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <Field
              label="Nouveau PIN"
              htmlFor="driver-pin"
              required
              hint={pinInvalid ? <span className={cn("font-medium", toneText("danger"))}>4 à 6 chiffres uniquement.</span> : undefined}
            >
              <Input
                id="driver-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                minLength={4}
                maxLength={6}
                autoComplete="new-password"
                required
                className="tabular tracking-[0.3em]"
                aria-invalid={pinInvalid || undefined}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </Field>
            <Field
              label="Confirmer le PIN"
              htmlFor="driver-pin-confirm"
              required
              hint={mismatch ? <span className={cn("font-medium", toneText("danger"))}>Les deux PIN ne correspondent pas.</span> : undefined}
            >
              <Input
                id="driver-pin-confirm"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                minLength={4}
                maxLength={6}
                autoComplete="new-password"
                required
                className="tabular tracking-[0.3em]"
                aria-invalid={mismatch || undefined}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => openDialog(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                <Save className="size-4" />
                {savingPin ? "Enregistrement…" : "Enregistrer le PIN"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

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
  const [medicalVisitExpiry, setMedicalVisitExpiry] = useState("");
  const [staffType, setStaffType] = useState<StaffType>("driver");
  const [ittsStaffId, setIttsStaffId] = useState("");
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
    medicalVisitExpiry: "",
    staffType: "driver" as StaffType,
    ittsStaffId: "",
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
    const nextMedicalVisitExpiry = d.medical_visit_expiry ? d.medical_visit_expiry.slice(0, 10) : "";
    const nextStaffType: StaffType = d.staff_type ?? "driver";
    const nextIttsStaffId = d.itts_staff_id || "";
    const nextIsActive = d.is_active;

    setFirstName(nextFirstName);
    setLastName(nextLastName);
    setEmail(nextEmail);
    setPhone(nextPhone);
    setLicenseNumber(nextLicenseNumber);
    setLicenseCategories(nextLicenseCategories);
    setLicenseExpiry(nextLicenseExpiry);
    setMedicalCheckDate(nextMedicalCheckDate);
    setMedicalVisitExpiry(nextMedicalVisitExpiry);
    setStaffType(nextStaffType);
    setIttsStaffId(nextIttsStaffId);
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
      medicalVisitExpiry: nextMedicalVisitExpiry,
      staffType: nextStaffType,
      ittsStaffId: nextIttsStaffId,
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
    setMedicalVisitExpiry(original.medicalVisitExpiry);
    setStaffType(original.staffType);
    setIttsStaffId(original.ittsStaffId);
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
        staff_type: staffType,
        first_name: firstName,
        last_name: lastName,
        email: email || null,
        phone: phone || null,
        license_number: licenseNumber || null,
        license_categories: licenseCategories || null,
        license_expiry: licenseExpiry || null,
        medical_check_date: medicalCheckDate || null,
        medical_visit_expiry: medicalVisitExpiry || null,
        itts_staff_id: ittsStaffId.trim() || null,
        is_active: isActive,
      } as Partial<Driver>);
      setDriver(updated);
      applyDriverToForm(updated);
      toast.success("Fiche mise à jour");
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
      toast.success("Personne supprimée");
      router.push("/drivers");
    } catch (err: any) {
      toast.error(err.message || "Erreur de suppression");
    }
  }

  if (loading || !driver) {
    return (
      <AppShell>
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-8 w-64" />
          </div>
          <Skeleton className="h-28 w-full rounded-xl" />
          <div className="grid gap-6 xl:grid-cols-3">
            <Skeleton className="h-96 w-full rounded-xl xl:col-span-2" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </AppShell>
    );
  }

  const name = fullName(driver);
  const formExpiryTone = expiryTone(licenseExpiry);
  const savedExpiryTone = expiryTone(driver.license_expiry);
  const formMedicalTone = expiryTone(medicalVisitExpiry);
  const savedMedicalTone = expiryTone(driver.medical_visit_expiry);
  const isDriverForm = staffType === "driver";
  const docTypeLabel = (type: string) => documentTypeLabels[type] ?? type;

  const docTypeSelectItems = (
    <SelectContent>
      {driverDocTypes.map((value) => (
        <SelectItem key={value} value={value}>
          {documentTypeLabels[value]}
        </SelectItem>
      ))}
    </SelectContent>
  );

  return (
    <AppShell>
      <PageHeader
        title={name}
        breadcrumb={[{ label: "Personnel", href: "/drivers" }, { label: name }]}
        actions={
          <>
            <StatusBadge tone="neutral">{staffTypeLabels[driver.staff_type] ?? driver.staff_type}</StatusBadge>
            <StatusBadge tone={driver.is_active ? "success" : "neutral"}>{driver.is_active ? "Actif" : "Inactif"}</StatusBadge>
            <Button variant="destructive" onClick={remove}>
              <Trash2 className="size-4" />
              Supprimer
            </Button>
          </>
        }
      />

      {/* Profil */}
      <section className="mb-6 flex flex-col gap-5 rounded-xl border bg-card p-5 shadow-card sm:flex-row sm:items-center">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-lg font-semibold text-primary">
          {initials(driver.first_name, driver.last_name)}
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="truncate text-base font-semibold">{name}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Phone className="size-3.5 text-subtle-foreground" />
              <span className="tabular">{driver.phone || "Aucun téléphone"}</span>
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <Mail className="size-3.5 text-subtle-foreground" />
              {driver.email ? (
                <a href={`mailto:${driver.email}`} className="truncate hover:text-foreground hover:underline">
                  {driver.email}
                </a>
              ) : (
                <span>Aucun email</span>
              )}
            </span>
          </div>
        </div>
        {driver.staff_type === "conveyor" ? (
          <dl className="grid shrink-0 grid-cols-2 gap-6 border-t pt-4 text-sm sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
            <div>
              <dt className="text-xs text-muted-foreground">Identifiant ITTS</dt>
              <dd className="mt-1 font-mono text-xs font-medium">{driver.itts_staff_id || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Visite médicale</dt>
              <dd className={cn("mt-1 font-medium tabular", savedMedicalTone && toneText(savedMedicalTone))}>{formatDate(driver.medical_visit_expiry)}</dd>
            </div>
          </dl>
        ) : (
          <dl className="grid shrink-0 grid-cols-3 gap-6 border-t pt-4 text-sm sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
            <div>
              <dt className="text-xs text-muted-foreground">Permis</dt>
              <dd className="mt-1 font-mono text-xs font-medium">{driver.license_number || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Catégories</dt>
              <dd className="mt-1 font-medium">{driver.license_categories || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Expiration</dt>
              <dd className={cn("mt-1 font-medium tabular", savedExpiryTone && toneText(savedExpiryTone))}>{formatDate(driver.license_expiry)}</dd>
            </div>
          </dl>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* Édition */}
          <Panel title="Informations" description="Modifiez la fiche puis enregistrez." bodyClassName="p-0">
            <div className="divide-y p-5">
              <FormSection title="Type" description="Chauffeur ou convoyeur.">
                <div role="radiogroup" aria-label="Type de personnel" className="flex gap-1 rounded-lg border bg-surface-sunken p-1 sm:col-span-2 sm:w-fit">
                  {(Object.keys(staffTypeLabels) as StaffType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={staffType === t}
                      onClick={() => setStaffType(t)}
                      className={cn(
                        "h-8 rounded-md px-3 text-[13px] font-medium transition-colors",
                        staffType === t ? "bg-card text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {staffTypeLabels[t]}
                    </button>
                  ))}
                </div>
              </FormSection>

              <FormSection title="Identité">
                <Field label="Prénom" htmlFor="firstName">
                  <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </Field>
                <Field label="Nom" htmlFor="lastName">
                  <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </Field>
              </FormSection>

              <FormSection title="Coordonnées">
                <Field label="Email" htmlFor="email">
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label="Téléphone" htmlFor="phone">
                  <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
              </FormSection>

              {(isDriverForm || licenseNumber || licenseExpiry) && (
                <FormSection
                  title="Permis de conduire"
                  description={isDriverForm ? "Numéro, catégories et date de validité du permis." : "Facultatif pour un convoyeur."}
                >
                  <Field label="Numéro de permis" htmlFor="license">
                    <Input id="license" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
                  </Field>
                  <Field label="Catégories" htmlFor="categories">
                    <Input id="categories" value={licenseCategories} onChange={(e) => setLicenseCategories(e.target.value)} placeholder="B, C, D…" />
                  </Field>
                  <Field
                    label="Expiration du permis"
                    htmlFor="licenseExpiry"
                    hint={
                      formExpiryTone ? (
                        <span className={cn("font-medium", toneText(formExpiryTone))}>
                          {formExpiryTone === "danger" ? "Permis expiré" : "Expire bientôt"} · {formatRelativeDays(licenseExpiry)}
                        </span>
                      ) : undefined
                    }
                  >
                    <DateInput
                      id="licenseExpiry"
                      value={licenseExpiry}
                      onValueChange={setLicenseExpiry}
                      className={cn(formExpiryTone === "danger" && "border-danger-border", formExpiryTone === "warning" && "border-warning-border")}
                    />
                  </Field>
                </FormSection>
              )}

              <FormSection title="Aptitude médicale" description="Date de la dernière visite et fin de validité de l'aptitude.">
                <Field label="Date de visite médicale" htmlFor="medical">
                  <DateInput id="medical" value={medicalCheckDate} onValueChange={setMedicalCheckDate} />
                </Field>
                <Field
                  label="Expiration de la visite médicale"
                  htmlFor="medicalVisitExpiry"
                  hint={
                    formMedicalTone ? (
                      <span className={cn("font-medium", toneText(formMedicalTone))}>
                        {formMedicalTone === "danger" ? "Visite expirée" : "Expire bientôt"} · {formatRelativeDays(medicalVisitExpiry)}
                      </span>
                    ) : undefined
                  }
                >
                  <DateInput
                    id="medicalVisitExpiry"
                    value={medicalVisitExpiry}
                    onValueChange={setMedicalVisitExpiry}
                    className={cn(formMedicalTone === "danger" && "border-danger-border", formMedicalTone === "warning" && "border-warning-border")}
                  />
                </Field>
              </FormSection>

              <FormSection title="Système ITTS" description="Identifiant dans le système ITTS, si la personne y est enregistrée.">
                <Field label="Identifiant ITTS" htmlFor="ittsStaffId" hint="Optionnel.">
                  <Input id="ittsStaffId" value={ittsStaffId} onChange={(e) => setIttsStaffId(e.target.value)} />
                </Field>
              </FormSection>

              <FormSection title="Statut">
                <label htmlFor="isActive" className="flex items-center justify-between gap-4 rounded-lg border bg-surface-sunken px-3.5 py-3 sm:col-span-2">
                  <span>
                    <span className="block text-[13px] font-medium">Personne active</span>
                    <span className="block text-xs text-muted-foreground">{isActive ? "La personne est active." : "La personne est désactivée."}</span>
                  </span>
                  <Switch id="isActive" checked={isActive} onCheckedChange={setIsActive} />
                </label>
              </FormSection>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t bg-surface-sunken px-5 py-3">
              <Button variant="outline" onClick={resetForm}>
                <RotateCcw className="size-4" />
                Réinitialiser
              </Button>
              <Button onClick={save} disabled={saving}>
                <Save className="size-4" />
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </Panel>

          {/* Pièces */}
          <Panel
            flush
            title={
              <span className="flex items-center gap-2">
                Pièces jointes
                <span className="rounded bg-muted px-1.5 text-[11px] font-medium text-muted-foreground tabular">{documents.length}</span>
              </span>
            }
            description="Permis, pièce d'identité, certificat médical…"
            actions={
              <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="size-3.5" />
                Ajouter
              </Button>
            }
          >
            {documents.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Aucune pièce jointe"
                description="Ajoutez le permis, la pièce d'identité ou le certificat médical."
                action={
                  <Button variant="outline" onClick={() => setUploadOpen(true)}>
                    <Upload className="size-4" />
                    Ajouter un document
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead className="w-0 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => {
                    const fileUrl = assetUrl(doc.file_url);
                    const tone = expiryTone(doc.expiry_date);
                    return (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-surface-sunken text-muted-foreground">
                              <FileText className="size-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="max-w-[260px] truncate font-medium">{doc.name}</p>
                              <p className="text-xs text-muted-foreground sm:hidden">{docTypeLabel(doc.document_type)}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">{docTypeLabel(doc.document_type)}</TableCell>
                        <TableCell>
                          {doc.expiry_date ? (
                            <>
                              <p className="tabular">{formatDate(doc.expiry_date)}</p>
                              <p className={cn("text-xs", tone ? cn(toneText(tone), "font-medium") : "text-muted-foreground")}>
                                {tone === "danger" ? "Expiré " : ""}
                                {formatRelativeDays(doc.expiry_date)}
                              </p>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="pr-3">
                          <div className="flex items-center justify-end gap-1">
                            {fileUrl ? (
                              <a
                                href={fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                                aria-label={`Ouvrir ${doc.name}`}
                                title="Ouvrir"
                              >
                                <ExternalLink className="size-4" />
                              </a>
                            ) : null}
                            <Button variant="ghost" size="icon-sm" onClick={() => openDocEdit(doc)} aria-label={`Modifier ${doc.name}`} title="Modifier">
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => deleteDoc(doc)}
                              aria-label={`Supprimer ${doc.name}`}
                              title="Supprimer"
                              className="text-muted-foreground hover:bg-danger-subtle hover:text-danger"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Véhicule affecté">
            {vehicle ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {vehicle.brand} {vehicle.model}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{vehicle.year ?? "Année inconnue"}</p>
                  </div>
                  <Plate value={vehicle.registration} />
                </div>
                <Link href={`/vehicles/${vehicle.id}`} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                  Voir la fiche véhicule
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-surface-sunken text-subtle-foreground">
                  <Car className="size-4" />
                </span>
                Aucun véhicule affecté.
              </div>
            )}
          </Panel>

          <Panel title="Échéances">
            <DetailList
              items={[
                {
                  label: "Permis",
                  value: (
                    <span className="flex items-center justify-end gap-2">
                      <span className={cn(savedExpiryTone && toneText(savedExpiryTone))}>{formatDate(driver.license_expiry)}</span>
                      {driver.license_expiry && <ExpiryBadge value={driver.license_expiry} />}
                    </span>
                  ),
                },
                {
                  label: "Visite médicale",
                  value: (
                    <span className="flex items-center justify-end gap-2">
                      <span className={cn(savedMedicalTone && toneText(savedMedicalTone))}>{formatDate(driver.medical_visit_expiry)}</span>
                      {driver.medical_visit_expiry && <ExpiryBadge value={driver.medical_visit_expiry} />}
                    </span>
                  ),
                },
                { label: "Dernière visite", value: formatDate(driver.medical_check_date) },
              ]}
            />
          </Panel>

          <SignaturePinPanel
            driver={driver}
            onUpdated={(d) => {
              // Seul has_pin change : on ne réapplique pas le formulaire pour préserver une saisie en cours.
              setDriver(d);
            }}
          />

          <Panel title="Fiche">
            <DetailList
              items={[
                { label: "Identifiant ITTS", value: driver.itts_staff_id ? <span className="font-mono text-xs">{driver.itts_staff_id}</span> : "—" },
                { label: "Créé le", value: formatDate(driver.created_at) },
                { label: "Mis à jour", value: formatDate(driver.updated_at) },
                { label: "Compte utilisateur", value: driver.user_id ? "Lié" : "Aucun" },
              ]}
            />
          </Panel>
        </div>
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter une pièce</DialogTitle>
            <DialogDescription>Vous pouvez joindre plusieurs fichiers en une fois.</DialogDescription>
          </DialogHeader>
          <form key={uploadFormKey} onSubmit={handleDocUpload} className="space-y-4">
            <Field label="Nom" htmlFor="driver-doc-name" hint="Optionnel si plusieurs fichiers : le nom du fichier est utilisé.">
              <Input id="driver-doc-name" name="name" placeholder="Permis B" />
            </Field>
            <Field label="Type" htmlFor="driver-doc-type">
              <Select items={documentTypeLabels} value={docType} onValueChange={(v) => setDocType(v || "license")}>
                <SelectTrigger id="driver-doc-type">
                  <SelectValue />
                </SelectTrigger>
                {docTypeSelectItems}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date d'émission" htmlFor="driver-doc-issue">
                <Input id="driver-doc-issue" name="issue_date" type="date" />
              </Field>
              <Field label="Date d'expiration" htmlFor="driver-doc-expiry">
                <Input id="driver-doc-expiry" name="expiry_date" type="date" />
              </Field>
            </div>
            <Field label="Fichiers" htmlFor="driver-doc-files" required hint="Permis, pièce d'identité, certificat médical…">
              <Input id="driver-doc-files" name="files" type="file" accept={DOCUMENT_ACCEPT} multiple required />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={uploading}>
                <Upload className="size-4" />
                {uploading ? "Envoi…" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={docEditOpen} onOpenChange={setDocEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier le document</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleDocEditSubmit} className="space-y-4">
            <Field label="Nom" htmlFor="edit-driver-doc-name" required>
              <Input
                id="edit-driver-doc-name"
                required
                value={docEditForm.name}
                onChange={(e) => setDocEditForm((p) => ({ ...p, name: e.target.value }))}
              />
            </Field>
            <Field label="Type" htmlFor="edit-driver-doc-type">
              <Select
                items={documentTypeLabels}
                value={docEditForm.document_type}
                onValueChange={(v) => setDocEditForm((p) => ({ ...p, document_type: v || "other" }))}
              >
                <SelectTrigger id="edit-driver-doc-type">
                  <SelectValue />
                </SelectTrigger>
                {docTypeSelectItems}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date d'émission" htmlFor="edit-driver-doc-issue">
                <Input
                  id="edit-driver-doc-issue"
                  type="date"
                  value={docEditForm.issue_date}
                  onChange={(e) => setDocEditForm((p) => ({ ...p, issue_date: e.target.value }))}
                />
              </Field>
              <Field label="Date d'expiration" htmlFor="edit-driver-doc-expiry">
                <Input
                  id="edit-driver-doc-expiry"
                  type="date"
                  value={docEditForm.expiry_date}
                  onChange={(e) => setDocEditForm((p) => ({ ...p, expiry_date: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Rappel (jours avant)" htmlFor="edit-driver-doc-reminder">
              <Input
                id="edit-driver-doc-reminder"
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
                <Save className="size-4" />
                {savingDocEdit ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
