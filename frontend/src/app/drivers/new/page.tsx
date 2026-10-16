"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Field, FormSection, PageHeader, Panel } from "@/components/app/primitives";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function NewDriverPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    license_number: "",
    license_categories: "",
    license_expiry: "",
    medical_check_date: "",
  });

  function update(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/drivers", {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        license_number: form.license_number || undefined,
        license_categories: form.license_categories || undefined,
        license_expiry: form.license_expiry || undefined,
        medical_check_date: form.medical_check_date || undefined,
      });
      toast.success("Conducteur créé avec succès");
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
          title="Nouveau conducteur"
          description="Renseignez l'identité, les coordonnées et le permis du conducteur."
          breadcrumb={[{ label: "Conducteurs", href: "/drivers" }, { label: "Nouveau" }]}
        />

        <form onSubmit={handleSubmit}>
          <Panel bodyClassName="p-0">
            <div className="divide-y px-5 py-6 sm:px-6">
              <FormSection title="Identité" description="Nom tel qu'il figure sur le permis de conduire.">
                <Field label="Prénom" htmlFor="first_name" required>
                  <Input id="first_name" required value={form.first_name} onChange={(e) => update("first_name", e.target.value)} />
                </Field>
                <Field label="Nom" htmlFor="last_name" required>
                  <Input id="last_name" required value={form.last_name} onChange={(e) => update("last_name", e.target.value)} />
                </Field>
              </FormSection>

              <FormSection title="Coordonnées" description="Utilisées pour joindre le conducteur.">
                <Field label="Email" htmlFor="email">
                  <Input id="email" type="email" placeholder="nom@exemple.com" value={form.email} onChange={(e) => update("email", e.target.value)} />
                </Field>
                <Field label="Téléphone" htmlFor="phone">
                  <Input id="phone" type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
                </Field>
              </FormSection>

              <FormSection title="Permis et aptitude" description="Dates de validité du permis et de la dernière visite médicale.">
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
                <Field label="Date de visite médicale" htmlFor="medical_check_date">
                  <DateInput id="medical_check_date" value={form.medical_check_date} onValueChange={(value) => update("medical_check_date", value)} />
                </Field>
              </FormSection>
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
