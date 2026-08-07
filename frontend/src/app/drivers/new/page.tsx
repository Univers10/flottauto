"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/drivers")}
            className="rounded-xl"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Nouveau conducteur</h1>
            <p className="text-sm text-muted-foreground">Renseignez les informations du conducteur</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Informations du conducteur</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="first_name">Prénom *</Label>
                  <Input
                    id="first_name"
                    required
                    value={form.first_name}
                    onChange={(e) => update("first_name", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Nom *</Label>
                  <Input
                    id="last_name"
                    required
                    value={form.last_name}
                    onChange={(e) => update("last_name", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Téléphone</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license_number">Numéro de permis</Label>
                  <Input
                    id="license_number"
                    value={form.license_number}
                    onChange={(e) => update("license_number", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license_categories">Catégories du permis</Label>
                  <Input
                    id="license_categories"
                    placeholder="ex: B, C"
                    value={form.license_categories}
                    onChange={(e) => update("license_categories", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license_expiry">Date d&apos;expiration du permis</Label>
                  <Input
                    id="license_expiry"
                    type="date"
                    value={form.license_expiry}
                    onChange={(e) => update("license_expiry", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="medical_check_date">Date de visite médicale</Label>
                  <Input
                    id="medical_check_date"
                    type="date"
                    value={form.medical_check_date}
                    onChange={(e) => update("medical_check_date", e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => router.push("/drivers")}
                  className="h-11 rounded-xl border-border/60 px-5"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="h-11 gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 px-5 shadow-lg shadow-primary/25"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </AppShell>
  );
}
