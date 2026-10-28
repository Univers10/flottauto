"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Save, Truck, UserRound } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Field, FormSection, PageHeader, Panel } from "@/components/app/primitives";
import { api } from "@/lib/api";
import { staffTypeLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { StaffType } from "@/types";
import { toast } from "sonner";

const staffTypeOptions: { value: StaffType; icon: typeof UserRound; description: string }[] = [
  { value: "driver", icon: UserRound, description: "Conduit les véhicules de la flotte. Permis requis." },
  { value: "conveyor", icon: Truck, description: "Accompagne et convoie les véhicules ou les passagers." },
];

export default function NewDriverPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [showSecondary, setShowSecondary] = useState(false);
  const [staffType, setStaffType] = useState<StaffType>("driver");
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    license_number: "",
    license_categories: "",
    license_expiry: "",
    medical_check_date: "",
    medical_visit_expiry: "",
    itts_staff_id: "",
  });

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const isDriver = staffType === "driver";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/drivers", {
        staff_type: staffType,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        // Champs du permis : seulement pour un chauffeur.
        license_number: isDriver ? form.license_number || undefined : undefined,
        license_categories: isDriver ? form.license_categories || undefined : undefined,
        license_expiry: isDriver ? form.license_expiry || undefined : undefined,
        medical_check_date: form.medical_check_date || undefined,
        medical_visit_expiry: form.medical_visit_expiry || undefined,
        itts_staff_id: form.itts_staff_id.trim() || undefined,
      });
      toast.success(`${staffTypeLabels[staffType]} ajouté avec succès`);
      router.push("/drivers");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Ajouter une personne"
          description="Renseignez le type, l'identité, les coordonnées et les échéances du chauffeur ou du convoyeur."
          breadcrumb={[{ label: "Personnel", href: "/drivers" }, { label: "Nouveau" }]}
        />

        <form onSubmit={handleSubmit}>
          <Panel bodyClassName="p-0">
            <div className="divide-y px-5 py-6 sm:px-6">
              <FormSection title="Type" description="Le PIN de signature pourra être défini depuis la fiche, après création.">
                <div role="radiogroup" aria-label="Type de personnel" className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                  {staffTypeOptions.map((opt) => {
                    const selected = staffType === opt.value;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setStaffType(opt.value)}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border p-3.5 text-left transition-colors",
                          selected ? "border-primary bg-primary-subtle ring-1 ring-primary" : "bg-card hover:border-border-strong hover:bg-accent"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                            selected ? "border-primary bg-card text-primary" : "bg-surface-sunken text-muted-foreground"
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium">{staffTypeLabels[opt.value]}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{opt.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </FormSection>

              <FormSection
                title="Identité"
                description={isDriver ? "Nom tel qu'il figure sur le permis de conduire." : "Nom tel qu'il figure sur la pièce d'identité."}
              >
                <Field label="Prénom" htmlFor="first_name" required>
                  <Input id="first_name" required value={form.first_name} onChange={(e) => update("first_name", e.target.value)} />
                </Field>
                <Field label="Nom" htmlFor="last_name" required>
                  <Input id="last_name" required value={form.last_name} onChange={(e) => update("last_name", e.target.value)} />
                </Field>
              </FormSection>

              <FormSection title="Coordonnées" description="Utilisées pour joindre la personne.">
                <Field label="Email" htmlFor="email">
                  <Input id="email" type="email" placeholder="nom@exemple.com" value={form.email} onChange={(e) => update("email", e.target.value)} />
                </Field>
                <Field label="Téléphone" htmlFor="phone">
                  <Input id="phone" type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
                </Field>
              </FormSection>

              {isDriver && (
                <FormSection title="Permis de conduire" description="Numéro, catégories et date de validité du permis.">
                  <Field label="Numéro de permis" htmlFor="license_number">
                    <Input id="license_number" value={form.license_number} onChange={(e) => update("license_number", e.target.value)} />
                  </Field>
                  <Field label="Catégories du permis" htmlFor="license_categories" hint="Séparées par des virgules.">
                    <Input
                      id="license_categories"
                      placeholder="ex : B, C"
                      value={form.license_categories}
                      onChange={(e) => update("license_categories", e.target.value)}
                    />
                  </Field>
                  <Field label="Expiration du permis" htmlFor="license_expiry">
                    <DateInput id="license_expiry" value={form.license_expiry} onValueChange={(value) => update("license_expiry", value)} />
                  </Field>
                </FormSection>
              )}

              <FormSection title="Aptitude médicale" description="Date de la dernière visite et fin de validité de l'aptitude.">
                <Field label="Date de visite médicale" htmlFor="medical_check_date">
                  <DateInput id="medical_check_date" value={form.medical_check_date} onValueChange={(value) => update("medical_check_date", value)} />
                </Field>
                <Field label="Expiration de la visite médicale" htmlFor="medical_visit_expiry" hint="Une alerte est émise à l'approche de cette date.">
                  <DateInput
                    id="medical_visit_expiry"
                    value={form.medical_visit_expiry}
                    onValueChange={(value) => update("medical_visit_expiry", value)}
                  />
                </Field>
              </FormSection>

              <div className="py-6 last:pb-0">
                <button
                  type="button"
                  onClick={() => setShowSecondary((v) => !v)}
                  aria-expanded={showSecondary}
                  className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronDown className={cn("size-4 transition-transform", showSecondary && "rotate-180")} />
                  Informations complémentaires
                </button>
                {showSecondary && (
                  <FormSection title="Système ITTS" description="Identifiant de la personne dans le système ITTS, si elle y est enregistrée." className="pt-5">
                    <Field label="Identifiant ITTS" htmlFor="itts_staff_id" hint="Optionnel.">
                      <Input id="itts_staff_id" value={form.itts_staff_id} onChange={(e) => update("itts_staff_id", e.target.value)} />
                    </Field>
                  </FormSection>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t bg-surface-sunken px-5 py-3 sm:px-6">
              <Link href="/drivers" className={buttonVariants({ variant: "outline" })}>
                Annuler
              </Link>
              <Button type="submit" disabled={saving}>
                <Save className="size-4" />
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </Panel>
        </form>
      </div>
    </AppShell>
  );
}
