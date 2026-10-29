"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Route, Search } from "lucide-react";
import { AppShell, useCurrentUser } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, Panel, SegmentButton, StatusBadge, Toolbar, toneText } from "@/components/app/primitives";
import { createConvoy, listConvoys } from "@/lib/api";
import { convoyPurposeLabels, convoyStatus, convoyVerdictTone } from "@/lib/labels";
import { canManageConvoys } from "@/lib/roles";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Convoy, ConvoyStatus } from "@/types";
import { toast } from "sonner";

type Filter = "open" | ConvoyStatus | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "En cours" },
  { key: "draft", label: "Brouillons" },
  { key: "confirmed", label: "Contrat généré" },
  { key: "done", label: "Terminés" },
  { key: "all", label: "Tous" },
];

function matches(convoy: Convoy, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return convoy.status === "draft" || convoy.status === "confirmed";
  return convoy.status === filter;
}

export default function ConvoysPage() {
  return (
    <AppShell>
      <ConvoyList />
    </AppShell>
  );
}

function ConvoyList() {
  const router = useRouter();
  const user = useCurrentUser();
  const canEdit = !!user && canManageConvoys(user.role);
  const [rows, setRows] = useState<Convoy[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    listConvoys()
      .then((data) => !cancelled && setRows(data))
      .catch((err: Error) => toast.error(err.message || "Erreur de chargement des convois"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (c) =>
        matches(c, filter) &&
        (!q || [c.number, c.title, c.client_name ?? ""].some((v) => v.toLowerCase().includes(q)))
    );
  }, [rows, filter, query]);

  async function handleCreate() {
    setCreating(true);
    try {
      const convoy = await createConvoy({ title: "Nouveau convoi" });
      router.push(`/convoys/${convoy.id}`);
    } catch (err) {
      toast.error((err as Error).message || "Création impossible");
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Convois"
        description="Location d'un car avec équipage : devis, rentabilité, contrat et paiement."
        actions={
          canEdit && (
            <Button onClick={handleCreate} disabled={creating}>
              <Plus className="size-4" />
              Nouveau convoi
            </Button>
          )
        }
      />

      <Panel flush>
        <Toolbar>
          <div className="no-scrollbar flex gap-1 overflow-x-auto">
            {FILTERS.map((f) => (
              <SegmentButton key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)} count={rows.filter((c) => matches(c, f.key)).length}>
                {f.label}
              </SegmentButton>
            ))}
          </div>
          <div className="relative sm:ml-auto sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="N°, client, motif…" className="pl-8" aria-label="Rechercher un convoi" />
          </div>
        </Toolbar>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Route}
            title={rows.length === 0 ? "Aucun convoi pour l'instant" : "Aucun convoi ne correspond"}
            description={
              rows.length === 0
                ? "Un convoi, c'est un car loué avec son équipage pour un pèlerinage, des funérailles, un mariage… FlottAuto calcule s'il est rentable et prépare le contrat."
                : "Changez de filtre ou de recherche."
            }
            action={
              canEdit && rows.length === 0 ? (
                <Button onClick={handleCreate} disabled={creating}>
                  <Plus className="size-4" />
                  Créer le premier convoi
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Convoi</TableHead>
                  <TableHead className="hidden md:table-cell">Départ</TableHead>
                  <TableHead className="hidden lg:table-cell">Car</TableHead>
                  <TableHead className="text-right">Prix global</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Reste à payer</TableHead>
                  <TableHead className="hidden xl:table-cell">Verdict</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((c) => {
                  const a = c.account;
                  const st = convoyStatus[c.status];
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/convoys/${c.id}`)}>
                      <TableCell className="min-w-56">
                        <p className="font-medium">{c.title}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono">{c.number}</span> · {convoyPurposeLabels[c.purpose]}
                          {c.client_name && ` · ${c.client_name}`}
                        </p>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap md:table-cell">{c.departure_at ? formatDate(c.departure_at) : "—"}</TableCell>
                      <TableCell className="hidden whitespace-nowrap lg:table-cell">{c.vehicle_label ?? "—"}</TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular">{a ? formatMoney(a.revenue) : "—"}</TableCell>
                      <TableCell className={cn("hidden text-right whitespace-nowrap tabular sm:table-cell", a && a.balance > 0 && c.status !== "cancelled" && toneText("warning"))}>
                        {a ? formatMoney(a.balance) : "—"}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        {a && <StatusBadge tone={convoyVerdictTone[a.verdict]}>{a.verdict_label.toLowerCase()}</StatusBadge>}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={st.tone}>{st.label.split(" · ")[0]}</StatusBadge>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="size-4 text-subtle-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </>
  );
}
