"use client";

import { useEffect, useState } from "react";
import { Moon, Plus, Sun, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import type { User } from "@/types";

const roles = [
  { value: "admin", label: "Administrateur" },
  { value: "manager", label: "Gestionnaire" },
  { value: "driver", label: "Conducteur" },
  { value: "mechanic", label: "Mécanicien" },
  { value: "accountant", label: "Comptable" },
  { value: "reader", label: "Lecteur" },
];

function ThemeCard() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          {isDark ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}
          Apparence
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Choisissez le mode d&apos;affichage de l&apos;interface.
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            variant={!isDark ? "default" : "outline"}
            onClick={() => setTheme("light")}
            className="h-10 gap-2 rounded-xl px-4"
          >
            <Sun className="h-4 w-4" />
            Clair
          </Button>
          <Button
            variant={isDark ? "default" : "outline"}
            onClick={() => setTheme("dark")}
            className="h-10 gap-2 rounded-xl px-4"
          >
            <Moon className="h-4 w-4" />
            Sombre
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    password: "",
    role: "manager",
  });

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await api.get<User[]>("/auth/users");
      setUsers(res);
    } catch (err: any) {
      toast.error(err.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/auth/users", form);
      toast.success("Utilisateur créé");
      setShowForm(false);
      setForm({ email: "", first_name: "", last_name: "", password: "", role: "manager" });
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la création");
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Paramètres</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gérez l&apos;apparence et les utilisateurs</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <ThemeCard />
          <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <UserPlus className="h-5 w-5 text-primary" />
                Créer un utilisateur
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!showForm ? (
                <Button onClick={() => setShowForm(true)} className="h-10 gap-2 rounded-xl px-5 shadow-md shadow-primary/20">
                  <Plus className="h-4 w-4" />
                  Nouvel utilisateur
                </Button>
              ) : (
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Rôle</Label>
                      <Select
                        value={form.role}
                        onValueChange={(v) => v && setForm({ ...form, role: v })}
                      >
                        <SelectTrigger id="role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roles.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="first_name">Prénom</Label>
                      <Input
                        id="first_name"
                        value={form.first_name}
                        onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last_name">Nom</Label>
                      <Input
                        id="last_name"
                        value={form.last_name}
                        onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="password">Mot de passe *</Label>
                      <Input
                        id="password"
                        type="password"
                        required
                        minLength={8}
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button type="submit" className="h-11 gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 px-5 shadow-lg shadow-primary/25">
                      <Plus className="h-4 w-4" />
                      Créer
                    </Button>
                    <Button variant="outline" onClick={() => setShowForm(false)} className="h-11 rounded-xl border-border/60 px-5">
                      Annuler
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Users className="h-5 w-5 text-primary" />
              Utilisateurs de l&apos;entreprise
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Chargement...</p>
            ) : users.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                Aucun utilisateur trouvé.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Email</th>
                      <th className="pb-3 font-medium">Nom</th>
                      <th className="pb-3 font-medium">Rôle</th>
                      <th className="pb-3 font-medium">Actif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b last:border-0 transition-colors hover:bg-muted/40">
                        <td className="py-4 font-semibold">{user.email}</td>
                        <td className="py-4 text-muted-foreground">
                          {user.first_name} {user.last_name}
                        </td>
                        <td className="py-4">
                          <Badge className="rounded-lg border-0 bg-slate-100 px-2.5 py-0.5 font-medium text-slate-700 capitalize">
                            {user.role}
                          </Badge>
                        </td>
                        <td className="py-4">
                          <Badge className={cn("rounded-lg border-0 px-2.5 py-0.5 font-medium", user.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                            {user.is_active ? "Oui" : "Non"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
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
