"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Phone, Mail } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { Driver } from "@/types";
import { toast } from "sonner";

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  async function loadDrivers() {
    setLoading(true);
    try {
      const res = await api.get<Driver[]>("/drivers");
      setDrivers(res);
    } catch (err: any) {
      toast.error(err.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDrivers();
  }, []);

  const filtered = drivers.filter((d) =>
    `${d.first_name} ${d.last_name} ${d.email}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Conducteurs</h1>
            <p className="mt-1 text-sm text-muted-foreground">{drivers.length} conducteur(s) enregistrés</p>
          </div>
          <Link href="/drivers/new">
            <Button className="h-10 gap-2 rounded-xl px-5 shadow-md shadow-primary/20">
              <Plus className="h-4 w-4" />
              Nouveau conducteur
            </Button>
          </Link>
        </div>

        <Card className="rounded-2xl border-none bg-card shadow-sm shadow-black/5">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg font-semibold">Liste des conducteurs</CardTitle>
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher un conducteur..."
                className="h-10 w-full rounded-xl border-border/60 bg-muted/50 pl-9 text-sm focus-visible:bg-background"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                Aucun conducteur trouvé.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((driver) => (
                  <Link key={driver.id} href={`/drivers/${driver.id}`} className="block">
                    <Card className="group cursor-pointer overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm shadow-black/5 transition-all hover:-translate-y-1 hover:shadow-lg">
                      <CardContent className="space-y-4 p-5">
                        <div className="flex items-center justify-between">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-blue-600 text-lg font-bold text-primary-foreground">
                            {driver.first_name[0]}{driver.last_name[0]}
                          </div>
                          <Badge className={cn("rounded-lg border-0 px-2.5 py-0.5 font-medium", driver.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                            {driver.is_active ? "Actif" : "Inactif"}
                          </Badge>
                        </div>
                        <div>
                          <h3 className="font-semibold">{driver.first_name} {driver.last_name}</h3>
                          <p className="text-sm text-muted-foreground">{driver.license_number || "Aucun permis"}</p>
                        </div>
                        <div className="space-y-1.5 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5" />
                            <span className="truncate">{driver.email || "—"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5" />
                            <span>{driver.phone || "—"}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
