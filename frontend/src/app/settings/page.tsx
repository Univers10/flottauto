"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check, Monitor, Moon, Plus, Power, Sun, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppShell, useCurrentUser } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { EmptyState, Field, PageHeader, Panel, StatusBadge, Toolbar } from "@/components/app/primitives";
import { api, updateUser } from "@/lib/api";
import { canManageUsers, roleLabels } from "@/lib/roles";
import { formatDate, fullName, initials } from "@/lib/format";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import type { Role, User } from "@/types";

const creatableRoles: Role[] = ["mechanic", "manager", "admin", "driver", "accountant", "reader"];

const emptyForm = { email: "", first_name: "", last_name: "", password: "", role: "mechanic" as Role };

const themeOptions = [
  { value: "light", label: "Clair", description: "Fond clair, idéal en journée.", icon: Sun },
  { value: "dark", label: "Sombre", description: "Réduit la fatigue visuelle.", icon: Moon },
  { value: "system", label: "Système", description: "Suit le réglage de l'appareil.", icon: Monitor },
] as const;

const noopSubscribe = () => () => {};

/** Bloc de réglages : titre et description à gauche, contenu à droite. */
function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 py-8 first:pt-0 last:pb-0 lg:grid-cols-[260px_1fr] lg:gap-10">
      <div>
        <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function ThemeCard() {
  const { theme, setTheme } = useTheme();
  // Le thème n'est connu qu'au client : on évite un état sélectionné erroné à l'hydratation.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const current = mounted ? (theme ?? "system") : null;

  return (
    <Panel>
      <div role="radiogroup" aria-label="Thème de l'interface" className="grid gap-3 sm:grid-cols-3">
        {themeOptions.map((opt) => {
          const selected = current === opt.value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(opt.value)}
              className={cn(
                "relative flex flex-col items-start gap-3 rounded-lg border bg-card p-4 text-left transition-[border-color,box-shadow,background-color] outline-none focus-visible:ring-3 focus-visible:ring-primary/25",
                selected ? "border-primary bg-primary-subtle ring-1 ring-primary" : "hover:border-border-strong hover:bg-accent"
              )}
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg border",
                  selected ? "border-primary/30 bg-card text-primary" : "bg-surface-sunken text-muted-foreground"
                )}
              >
                <Icon className="size-4" />
              </span>
              <span>
                <span className="block text-sm font-medium text-foreground">{opt.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{opt.description}</span>
              </span>
              {selected && (
                <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Panel>
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
    <>
      <PageHeader
        title="Paramètres"
        description={isAdmin ? "Gérez l'apparence et les comptes utilisateurs." : "Gérez l'apparence de l'interface."}
      />
      <div className="divide-y">
        <SettingsSection title="Apparence" description="Choisissez le mode d'affichage de l'interface sur cet appareil.">
          <ThemeCard />
        </SettingsSection>
        {isAdmin && currentUser && (
          <SettingsSection
            title="Équipe"
            description="Créez les comptes de votre entreprise et gérez leur accès. Les maintenanciers accèdent uniquement au module Maintenance pour saisir les interventions."
          >
            <UserManagement currentUserId={currentUser.id} />
          </SettingsSection>
        )}
      </div>
    </>
  );
}

type RoleFilter = Role | "all";

function UserManagement({ currentUserId }: { currentUserId: number }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await api.get<User[]>("/auth/users");
      setUsers(res);
    } catch (err) {
      toast.error((err as Error).message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/auth/users", form);
      toast.success(form.role === "mechanic" ? "Compte maintenancier créé" : "Utilisateur créé");
      setShowForm(false);
      setForm(emptyForm);
      loadUsers();
    } catch (err) {
      toast.error((err as Error).message || "Erreur lors de la création");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(user: User) {
    try {
      const updated = await updateUser(user.id, { is_active: !user.is_active });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(updated.is_active ? "Compte réactivé" : "Compte désactivé");
    } catch (err) {
      toast.error((err as Error).message || "Erreur lors de la mise à jour");
    }
  }

  const counts = useMemo(() => {
    const c: Partial<Record<RoleFilter, number>> = { all: users.length };
    users.forEach((u) => (c[u.role] = (c[u.role] ?? 0) + 1));
    return c;
  }, [users]);

  // « Tous », « Maintenanciers » toujours visibles ; les autres rôles seulement s'ils sont présents.
  const filters: { value: RoleFilter; label: string }[] = [
    { value: "all", label: "Tous" },
    { value: "mechanic", label: "Maintenanciers" },
    ...(Object.keys(roleLabels) as Role[])
      .filter((r) => r !== "mechanic" && (counts[r] ?? 0) > 0)
      .map((r) => ({ value: r as RoleFilter, label: roleLabels[r] })),
  ];

  const visibleUsers = roleFilter === "all" ? users : users.filter((u) => u.role === roleFilter);

  return (
    <>
      <Panel
        flush
        title="Utilisateurs de l'entreprise"
        description={loading ? "Chargement…" : `${users.length} compte(s)`}
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="size-4" />
            Nouveau compte
          </Button>
        }
      >
        <Toolbar>
          <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
            {filters.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setRoleFilter(f.value)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                  roleFilter === f.value
                    ? "bg-secondary text-foreground shadow-xs ring-1 ring-border"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {f.label}
                <span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground tabular">{counts[f.value] ?? 0}</span>
              </button>
            ))}
          </div>
        </Toolbar>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : visibleUsers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={roleFilter === "mechanic" ? "Aucun maintenancier pour le moment" : "Aucun utilisateur trouvé"}
            description={
              roleFilter === "mechanic"
                ? "Créez un compte maintenancier pour qu'il puisse saisir les interventions."
                : "Créez un premier compte pour votre équipe."
            }
            action={
              <Button variant="outline" onClick={() => setShowForm(true)}>
                <Plus className="size-4" />
                Nouveau compte
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="hidden md:table-cell">Créé le</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Action</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleUsers.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-surface-sunken text-xs font-semibold text-muted-foreground"
                        >
                          {initials(user.first_name, user.last_name, user.email)}
                        </span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate font-medium">
                            {fullName(user)}
                            {isSelf && <span className="text-xs font-normal text-muted-foreground">(vous)</span>}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.role === "mechanic" ? "warning" : "neutral"}>
                        {roleLabels[user.role] ?? user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={user.is_active ? "success" : "neutral"}>
                        {user.is_active ? "Actif" : "Inactif"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground tabular md:table-cell">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {!isSelf && (
                        <Button variant="outline" size="sm" onClick={() => toggleActive(user)}>
                          <Power className="size-3.5" />
                          {user.is_active ? "Désactiver" : "Réactiver"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="gap-0 p-0 sm:max-w-lg">
          <form onSubmit={handleCreate}>
            <DialogHeader className="border-b px-5 py-4 pr-12">
              <DialogTitle className="text-[0.9375rem] font-semibold">Nouveau compte</DialogTitle>
              <DialogDescription className="text-xs">
                L&apos;utilisateur pourra se connecter immédiatement avec ces identifiants.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
              <Field label="Email" htmlFor="email" required className="sm:col-span-2">
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="off"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Prénom" htmlFor="first_name">
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                />
              </Field>
              <Field label="Nom" htmlFor="last_name">
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                />
              </Field>
              <Field
                label="Rôle"
                htmlFor="role"
                className="sm:col-span-2"
                hint={form.role === "mechanic" ? "Accès limité au module Maintenance." : undefined}
              >
                <Select value={form.role} onValueChange={(v) => v && setForm({ ...form, role: v as Role })}>
                  <SelectTrigger id="role" className="w-full">
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
              </Field>
              <Field label="Mot de passe" htmlFor="password" required hint="8 caractères minimum." className="sm:col-span-2">
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </Field>
            </div>

            <DialogFooter className="mx-0 mb-0 px-5 py-3">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={submitting}>
                <Plus className="size-4" />
                Créer le compte
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
