"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check, MapPin, Monitor, Moon, Pencil, Plus, Power, Save, Sun, Users } from "lucide-react";
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
import { EmptyState, Field, FormSection, PageHeader, Panel, StatusBadge, Toolbar } from "@/components/app/primitives";
import {
  api,
  createStation,
  getOperationsSettings,
  listStations,
  updateOperationsSettings,
  updateStation,
  updateUser,
} from "@/lib/api";
import { canEditOperationsSettings, canManageUsers, roleLabels } from "@/lib/roles";
import { formatDate, fullName, initials } from "@/lib/format";
import { IttsIntegration } from "@/components/settings/itts-integration";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import type { OperationsSettings, Role, Station, User } from "@/types";

const creatableRoles: Role[] = [
  "mechanic",
  "station_manager",
  "operations_supervisor",
  "conveyor",
  "manager",
  "admin",
  "driver",
  "accountant",
  "reader",
];

const emptyForm = {
  email: "",
  first_name: "",
  last_name: "",
  password: "",
  role: "mechanic" as Role,
  station_id: "",
};

const roleHints: Partial<Record<Role, string>> = {
  mechanic: "Accès limité au module Maintenance.",
  station_manager: "Rattaché à une gare dont il suit l'exploitation.",
};

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
  const role = currentUser?.role;
  const isAdmin = !!role && canManageUsers(role);
  const canEditOps = !!role && canEditOperationsSettings(role);
  const showStations = !!role && role !== "mechanic" && role !== "conveyor";
  const showCalcs = canEditOps || role === "station_manager";
  const needStations = isAdmin || showStations;

  const [stations, setStations] = useState<Station[]>([]);
  const [stationsLoading, setStationsLoading] = useState(true);

  // Rechargement silencieux (la liste reste affichée pendant la requête).
  const loadStations = useCallback(async () => {
    try {
      setStations(await listStations());
    } catch (err) {
      toast.error((err as Error).message || "Erreur de chargement des gares");
    } finally {
      setStationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!needStations) return;
    let cancelled = false;
    listStations()
      .then((res) => !cancelled && setStations(res))
      .catch((err: Error) => toast.error(err.message || "Erreur de chargement des gares"))
      .finally(() => !cancelled && setStationsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [needStations]);

  const description = isAdmin
    ? "Gérez l'apparence, les comptes, les gares et les valeurs de calcul."
    : showStations
      ? "Gérez l'apparence de l'interface et consultez les réglages d'exploitation."
      : "Gérez l'apparence de l'interface.";

  return (
    <>
      <PageHeader title="Paramètres" description={description} />
      <div className="divide-y">
        <SettingsSection title="Apparence" description="Choisissez le mode d'affichage de l'interface sur cet appareil.">
          <ThemeCard />
        </SettingsSection>
        {isAdmin && currentUser && (
          <SettingsSection
            title="Équipe"
            description="Créez les comptes de votre entreprise et gérez leur accès. Les maintenanciers accèdent uniquement au module Maintenance ; les chefs de gare sont rattachés à une gare."
          >
            <UserManagement currentUserId={currentUser.id} stations={stations} />
          </SettingsSection>
        )}
        {showStations && (
          <SettingsSection
            title="Gares"
            description={
              canEditOps
                ? "Déclarez les gares d'exploitation de l'entreprise. Le code court identifie la gare dans les listes et rapports."
                : "Les gares d'exploitation de l'entreprise (consultation)."
            }
          >
            <StationManagement stations={stations} loading={stationsLoading} canEdit={canEditOps} onChanged={loadStations} />
          </SettingsSection>
        )}
        {showCalcs && (
          <SettingsSection
            title="Calculs"
            description={
              canEditOps
                ? "Valeurs de référence utilisées pour estimer les coûts, les recettes et déclencher les alertes."
                : "Valeurs de référence utilisées pour les calculs (consultation)."
            }
          >
            <OperationsSettingsForm canEdit={canEditOps} />
          </SettingsSection>
        )}
        {canEditOps && (
          <SettingsSection
            title="Intégration ITTS"
            description="Liaison avec l'application de gare ITTS Gestion : départs reçus, cars à associer et contrôle des sorties."
          >
            <IttsIntegration />
          </SettingsSection>
        )}
      </div>
    </>
  );
}

/* ───────────────────────── Équipe ───────────────────────── */

type RoleFilter = Role | "all";

function UserManagement({ currentUserId, stations }: { currentUserId: number; stations: Station[] }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const stationNames = useMemo(() => new Map(stations.map((st) => [st.id, st.name])), [stations]);
  const activeStations = useMemo(() => stations.filter((st) => st.active), [stations]);
  const needsStation = form.role === "station_manager";

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
    if (needsStation && !form.station_id) {
      toast.error("Choisissez la gare du chef de gare.");
      return;
    }
    setSubmitting(true);
    try {
      const { station_id, ...rest } = form;
      await api.post("/auth/users", {
        ...rest,
        station_id: needsStation && station_id ? Number(station_id) : null,
      });
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
                <TableHead className="hidden lg:table-cell">Gare</TableHead>
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
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {user.station_id ? (stationNames.get(user.station_id) ?? "—") : "—"}
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
              <Field label="Rôle" htmlFor="role" className="sm:col-span-2" hint={roleHints[form.role]}>
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
              {needsStation && (
                <Field
                  label="Gare"
                  htmlFor="station"
                  required
                  className="sm:col-span-2"
                  hint={activeStations.length === 0 ? "Aucune gare active : créez d'abord une gare." : undefined}
                >
                  <Select value={form.station_id} onValueChange={(v) => setForm({ ...form, station_id: v ? String(v) : "" })}>
                    <SelectTrigger id="station" className="w-full">
                      <SelectValue>
                        {form.station_id ? (stationNames.get(Number(form.station_id)) ?? "—") : "Choisir une gare"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {activeStations.map((st) => (
                        <SelectItem key={st.id} value={String(st.id)}>
                          {st.name} ({st.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
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
              <Button type="submit" disabled={submitting || (needsStation && !form.station_id)}>
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

/* ───────────────────────── Gares ───────────────────────── */

const emptyStationForm = { name: "", code: "", itts_station_id: "" };

function StationManagement({
  stations,
  loading,
  canEdit,
  onChanged,
}: {
  stations: Station[];
  loading: boolean;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Station | null>(null);
  const [form, setForm] = useState(emptyStationForm);
  const [submitting, setSubmitting] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyStationForm);
    setDialogOpen(true);
  }

  function openEdit(station: Station) {
    setEditing(station);
    setForm({ name: station.name, code: station.code, itts_station_id: station.itts_station_id ?? "" });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      itts_station_id: form.itts_station_id.trim() || null,
    };
    setSubmitting(true);
    try {
      if (editing) {
        await updateStation(editing.id, body);
        toast.success("Gare mise à jour");
      } else {
        await createStation(body);
        toast.success("Gare créée");
      }
      setDialogOpen(false);
      onChanged();
    } catch (err) {
      toast.error((err as Error).message || "Erreur lors de l'enregistrement");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(station: Station) {
    try {
      const updated = await updateStation(station.id, { active: !station.active });
      toast.success(updated.active ? "Gare activée" : "Gare désactivée");
      onChanged();
    } catch (err) {
      toast.error((err as Error).message || "Erreur lors de la mise à jour");
    }
  }

  return (
    <>
      <Panel
        flush
        title="Gares d'exploitation"
        description={loading ? "Chargement…" : `${stations.length} gare(s)`}
        actions={
          canEdit ? (
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              Nouvelle gare
            </Button>
          ) : undefined
        }
      >
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : stations.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="Aucune gare pour le moment"
            description={
              canEdit
                ? "Créez une première gare pour y rattacher les chefs de gare."
                : "Aucune gare n'a encore été déclarée."
            }
            action={
              canEdit ? (
                <Button variant="outline" onClick={openCreate}>
                  <Plus className="size-4" />
                  Nouvelle gare
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead className="hidden md:table-cell">Identifiant ITTS</TableHead>
                <TableHead>Statut</TableHead>
                {canEdit && (
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {stations.map((station) => (
                <TableRow key={station.id}>
                  <TableCell>
                    <span className="inline-flex items-center rounded-md border bg-surface-sunken px-1.5 py-0.5 font-mono text-xs font-medium uppercase">
                      {station.code}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{station.name}</TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                    {station.itts_station_id || "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={station.active ? "success" : "neutral"}>
                      {station.active ? "Active" : "Inactive"}
                    </StatusBadge>
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(station)}>
                          <Pencil className="size-3.5" />
                          Modifier
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleActive(station)}>
                          <Power className="size-3.5" />
                          {station.active ? "Désactiver" : "Activer"}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {canEdit && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="gap-0 p-0 sm:max-w-lg">
            <form onSubmit={handleSubmit}>
              <DialogHeader className="border-b px-5 py-4 pr-12">
                <DialogTitle className="text-[0.9375rem] font-semibold">
                  {editing ? "Modifier la gare" : "Nouvelle gare"}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Le code doit être unique dans votre entreprise.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
                <Field label="Nom" htmlFor="station_name" required className="sm:col-span-2">
                  <Input
                    id="station_name"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="Code" htmlFor="station_code" required hint="2 à 20 caractères, en majuscules.">
                  <Input
                    id="station_code"
                    required
                    minLength={2}
                    maxLength={20}
                    className="font-mono uppercase"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  />
                </Field>
                <Field label="Identifiant ITTS" htmlFor="station_itts" hint="Facultatif.">
                  <Input
                    id="station_itts"
                    value={form.itts_station_id}
                    onChange={(e) => setForm({ ...form, itts_station_id: e.target.value })}
                  />
                </Field>
              </div>

              <DialogFooter className="mx-0 mb-0 px-5 py-3">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={submitting}>
                  {editing ? <Save className="size-4" /> : <Plus className="size-4" />}
                  {editing ? "Enregistrer" : "Créer la gare"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/* ───────────────────────── Calculs ───────────────────────── */

type OpsKey = Exclude<keyof OperationsSettings, "updated_at">;
type OpsForm = Record<OpsKey, string>;

const opsGroups: {
  title: string;
  description: string;
  fields: { key: OpsKey; label: string; unit: string; hint?: string; step?: string }[];
}[] = [
  {
    title: "Coûts d'exploitation",
    description: "Carburant et rations versées par jour de mission.",
    fields: [
      { key: "diesel_price_per_liter", label: "Prix du gasoil", unit: "F/L" },
      { key: "driver_daily_ration", label: "Ration chauffeur", unit: "F/jour" },
      { key: "conveyor_daily_ration", label: "Ration convoyeur", unit: "F/jour" },
      { key: "broker_commission_pct", label: "Commission apporteur", unit: "%", step: "0.01" },
    ],
  },
  {
    title: "Recettes et immobilisation",
    description: "Sert à estimer le manque à gagner d'un car immobilisé.",
    fields: [
      {
        key: "line_revenue_per_bus_day",
        label: "Recette de référence d'une ligne",
        unit: "F/jour/car",
        hint: "CA annuel ÷ nombre de cars ÷ 365",
      },
      { key: "immobilization_daily_rate", label: "Tarif d'immobilisation", unit: "F/jour" },
    ],
  },
  {
    title: "Seuils d'alerte",
    description: "Délais à partir desquels une alerte est générée.",
    fields: [
      { key: "document_warning_days", label: "Alerte documents", unit: "jours avant échéance" },
      { key: "oil_change_warning_km", label: "Alerte vidange", unit: "km restants" },
    ],
  },
];

const opsKeys = opsGroups.flatMap((g) => g.fields.map((f) => f.key));

function toOpsForm(s: OperationsSettings): OpsForm {
  return Object.fromEntries(opsKeys.map((k) => [k, String(s[k] ?? "")])) as OpsForm;
}

function OperationsSettingsForm({ canEdit }: { canEdit: boolean }) {
  const [settings, setSettings] = useState<OperationsSettings | null>(null);
  const [form, setForm] = useState<OpsForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOperationsSettings()
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
        setForm(toOpsForm(s));
      })
      .catch((err: Error) => toast.error(err.message || "Erreur de chargement des valeurs de calcul"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const initial = useMemo(() => (settings ? toOpsForm(settings) : null), [settings]);
  const changedKeys = useMemo(
    () => (form && initial ? opsKeys.filter((k) => form[k] !== initial[k]) : []),
    [form, initial]
  );
  const invalid = !!form && opsKeys.some((k) => form[k].trim() === "" || Number.isNaN(Number(form[k])));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form || changedKeys.length === 0 || invalid) return;
    const body: Partial<Omit<OperationsSettings, "updated_at">> = {};
    for (const k of changedKeys) {
      if (k === "broker_commission_pct") body[k] = form[k].trim();
      else body[k] = Number(form[k]);
    }
    setSaving(true);
    try {
      const updated = await updateOperationsSettings(body);
      setSettings(updated);
      setForm(toOpsForm(updated));
      toast.success("Valeurs de calcul enregistrées");
    } catch (err) {
      toast.error((err as Error).message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title="Valeurs de calcul"
      description={
        loading
          ? "Chargement…"
          : settings
            ? `Dernière mise à jour le ${formatDate(settings.updated_at)}`
            : "Valeurs indisponibles"
      }
    >
      {loading || !form ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <form onSubmit={handleSave}>
          <div className="divide-y">
            {opsGroups.map((group) => (
              <FormSection key={group.title} title={group.title} description={group.description}>
                {group.fields.map((f) => (
                  <Field key={f.key} label={f.label} htmlFor={`ops_${f.key}`} hint={f.hint}>
                    <div className="relative">
                      <Input
                        id={`ops_${f.key}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={f.key === "broker_commission_pct" ? 100 : undefined}
                        step={f.step ?? "1"}
                        required
                        readOnly={!canEdit}
                        className="pr-28 tabular"
                        value={form[f.key]}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                        {f.unit}
                      </span>
                    </div>
                  </Field>
                ))}
              </FormSection>
            ))}
          </div>
          {canEdit && (
            <div className="mt-6 flex justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={changedKeys.length === 0 || saving}
                onClick={() => initial && setForm(initial)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={changedKeys.length === 0 || invalid || saving}>
                <Save className="size-4" />
                Enregistrer
              </Button>
            </div>
          )}
        </form>
      )}
    </Panel>
  );
}
