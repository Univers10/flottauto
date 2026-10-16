"use client";

import { useEffect, useState } from "react";
import { Moon, Plus, Power, Sun, UserPlus, Users, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppShell, useCurrentUser } from "@/components/layout/app-shell";
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
import { api, updateUser } from "@/lib/api";
import { canManageUsers, roleLabels } from "@/lib/roles";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import type { Role, User } from "@/types";

const creatableRoles: Role[] = ["mechanic", "manager", "admin", "driver", "accountant", "reader"];

const emptyForm = { email: "", first_name: "", last_name: "", password: "", role: "mechanic" as Role };

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
  return (
    <AppShell>
      <SettingsContent />
    </AppShell>
  );
}

// Rendu sous AppShell pour accéder à l'utilisateur connecté.
function SettingsContent() {
  const currentUser = useCurrentUser();
  const isAdmin = !!currentUser && canManageUsers(currentUser.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Paramètres</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdmin ? "Gérez l'apparence et les comptes utilisateurs" : "Gérez l'apparence de l'interface"}
        </p>
      </div>
      {isAdmin && currentUser ? (
        <UserManagement currentUserId={currentUser.id} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <ThemeCard />
        </div>
      )}
    </div>
  );
}

function UserManagement({ currentUserId }: { currentUserId: number }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [mechanicsOnly, setMechanicsOnly] = useState(false);
  const [form, setForm] = useState(emptyForm);

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
      toast.success(form.role === "mechanic" ? "Compte maintenancier créé" : "Utilisateur créé");
      setShowForm(false);
      setForm(emptyForm);
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la création");
    }
  }

  async function toggleActive(user: User) {
    try {
      const updated = await updateUser(user.id, { is_active: !user.is_active });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(updated.is_active ? "Compte réactivé" : "Compte désactivé");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la mise à jour");
    }
  }

  const mechanicCount = users.filter((u) => u.role === "mechanic").length;
  const visibleUsers = mechanicsOnly ? users.filter((u) => u.role === "mechanic") : users;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2">
        <ThemeCard />
        <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <UserPlus className="h-5 w-5 text-primary" />
              Créer un compte
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!showForm ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Les maintenanciers accèdent uniquement au module Maintenance pour saisir les interventions.
                </p>
                <Button onClick={() => setShowForm(true)} className="h-10 gap-2 rounded-xl px-5 shadow-md shadow-primary/20">
                  <Plus className="h-4 w-4" />
                  Nouveau compte
                </Button>
              </div>
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
                      onValueChange={(v) => v && setForm({ ...form, role: v as Role })}
                    >
                      <SelectTrigger id="role">
                        <SelectValue>{roleLabels[form.role]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {creatableRoles.map((r) => (
                          <SelectItem key={r} value={r}>
                            {roleLabels[r]}
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
                    <Label htmlFor="password">Mot de passe * (8 caractères min.)</Label>
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
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="h-11 rounded-xl border-border/60 px-5">
                    Annuler
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Users className="h-5 w-5 text-primary" />
            Utilisateurs de l&apos;entreprise
          </CardTitle>
          <Button
            variant={mechanicsOnly ? "default" : "outline"}
            onClick={() => setMechanicsOnly((v) => !v)}
            className="h-9 gap-2 rounded-xl px-4"
          >
            <Wrench className="h-4 w-4" />
            Maintenanciers ({mechanicCount})
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement...</p>
          ) : visibleUsers.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
              {mechanicsOnly ? "Aucun maintenancier pour le moment." : "Aucun utilisateur trouvé."}
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
                    <th className="pb-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => (
                    <tr key={user.id} className="border-b last:border-0 transition-colors hover:bg-muted/40">
                      <td className="py-4 font-semibold">{user.email}</td>
                      <td className="py-4 text-muted-foreground">
                        {user.first_name} {user.last_name}
                      </td>
                      <td className="py-4">
                        <Badge
                          className={cn(
                            "rounded-lg border-0 px-2.5 py-0.5 font-medium",
                            user.role === "mechanic" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"
                          )}
                        >
                          {roleLabels[user.role] ?? user.role}
                        </Badge>
                      </td>
                      <td className="py-4">
                        <Badge className={cn("rounded-lg border-0 px-2.5 py-0.5 font-medium", user.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                          {user.is_active ? "Oui" : "Non"}
                        </Badge>
                      </td>
                      <td className="py-4 text-right">
                        {user.id !== currentUserId && (
                          <Button variant="outline" size="sm" onClick={() => toggleActive(user)} className="gap-1.5 rounded-lg">
                            <Power className="h-3.5 w-3.5" />
                            {user.is_active ? "Désactiver" : "Réactiver"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
