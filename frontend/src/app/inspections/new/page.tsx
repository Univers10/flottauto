"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, LogIn, LogOut } from "lucide-react";
import { AppShell, useCurrentUser } from "@/components/layout/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Field, FormSection, PageHeader, Panel } from "@/components/app/primitives";
import { api, createInspection, listVehicles } from "@/lib/api";
import { canRunInspections } from "@/lib/roles";
import { fullName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Driver, InspectionKind, Vehicle } from "@/types";
import { toast } from "sonner";

const NONE = "none";

export default function NewInspectionPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <NewInspectionForm />
      </Suspense>
    </AppShell>
  );
}

function KindCard({
  active,
  onClick,
  icon: Icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex items-start gap-3 rounded-xl border bg-card p-4 text-left shadow-xs transition-[border-color,box-shadow] outline-none focus-visible:ring-3 focus-visible:ring-primary/20",
        active ? "border-primary ring-1 ring-primary" : "hover:border-border-strong"
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg border",
          active ? "border-transparent bg-primary-subtle text-primary" : "bg-surface-sunken text-muted-foreground"
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
      {active && <Check className="absolute top-3 right-3 size-4 text-primary" aria-hidden />}
    </button>
  );
}

function NewInspectionForm() {
  const router = useRouter();
  const user = useCurrentUser();
  const searchParams = useSearchParams();
  const initialKind: InspectionKind = searchParams.get("kind") === "arrival" ? "arrival" : "departure";
  const [kind, setKind] = useState<InspectionKind>(initialKind);
  const [vehicleId, setVehicleId] = useState(searchParams.get("vehicle_id") || "");
  const [driverId, setDriverId] = useState(NONE);
  const [conveyorId, setConveyorId] = useState(NONE);
  const [routeLabel, setRouteLabel] = useState("");
  const [departureAt, setDepartureAt] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [conveyors, setConveyors] = useState<Driver[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listVehicles({ size: 100 })
      .then((res) => setVehicles(res.items))
      .catch(() => toast.error("Erreur de chargement des véhicules"));
    api
      .get<Driver[]>("/drivers?staff_type=driver")
      .then((res) => setDrivers(res.filter((d) => d.is_active)))
      .catch(() => toast.error("Erreur de chargement des chauffeurs"));
    api
      .get<Driver[]>("/drivers?staff_type=conveyor")
      .then((res) => setConveyors(res.filter((d) => d.is_active)))
      .catch(() => toast.error("Erreur de chargement des convoyeurs"));
  }, []);

  if (user && !canRunInspections(user.role)) {
    return (
      <Panel>
        <EmptyState
          title="Accès réservé"
          description="Seuls les chefs de gare et les responsables d'exploitation peuvent ouvrir un état des lieux."
          action={
            <Link href="/inspections" className={buttonVariants({ variant: "outline" })}>
              Retour aux états des lieux
            </Link>
          }
        />
      </Panel>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleId) {
      toast.error("Sélectionnez un car");
      return;
    }
    setSaving(true);
    try {
      const created = await createInspection(
        kind === "departure"
          ? {
              vehicle_id: Number(vehicleId),
              kind,
              driver_id: driverId !== NONE ? Number(driverId) : null,
              conveyor_id: conveyorId !== NONE ? Number(conveyorId) : null,
              route_label: routeLabel.trim() || null,
              scheduled_departure_at: departureAt ? `${departureAt}:00` : null,
            }
          : { vehicle_id: Number(vehicleId), kind }
      );
      toast.success("État des lieux ouvert");
      router.push(`/inspections/${created.id}`);
    } catch (err: any) {
      toast.error(err.message || "Création impossible");
      setSaving(false);
    }
  }

  const vehicleItems: Record<string, string> = Object.fromEntries(vehicles.map((v) => [String(v.id), `${v.registration} — ${v.brand} ${v.model}`]));
  const personItems = (list: Driver[]): Record<string, string> => ({
    [NONE]: "Non assigné",
    ...Object.fromEntries(list.map((d) => [String(d.id), fullName(d)])),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Nouvel état des lieux"
        description="Choisissez le type de contrôle et le car. Les points, photos et signatures se font à l'étape suivante."
        breadcrumb={[{ label: "États des lieux", href: "/inspections" }, { label: "Nouveau" }]}
      />

      <form onSubmit={handleSubmit}>
        <Panel>
          <div className="divide-y">
            <FormSection title="Type de contrôle" description="Le départ se fait avant la mise en ligne du car, l'arrivée à son retour en gare.">
              <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                <KindCard
                  active={kind === "departure"}
                  onClick={() => setKind("departure")}
                  icon={LogOut}
                  title="Départ"
                  description="19 points de contrôle, 8 photos, équipage et ligne."
                />
                <KindCard
                  active={kind === "arrival"}
                  onClick={() => setKind("arrival")}
                  icon={LogIn}
                  title="Arrivée"
                  description="5 points de contrôle, 8 photos à comparer avec le départ."
                />
              </div>
            </FormSection>

            <FormSection
              title="Car"
              description={
                kind === "arrival"
                  ? "L'équipage et la ligne sont repris du dernier état des lieux de départ validé."
                  : "La gare est celle de votre compte."
              }
            >
              <Field label="Car" htmlFor="vehicle" required className="sm:col-span-2">
                <Select items={vehicleItems} value={vehicleId || null} onValueChange={(v) => v && setVehicleId(String(v))}>
                  <SelectTrigger id="vehicle">
                    <SelectValue placeholder="Sélectionner un car" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        <span className="font-mono text-xs font-semibold tracking-wider uppercase">{v.registration}</span>
                        <span className="text-muted-foreground">
                          {v.brand} {v.model}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FormSection>

            {kind === "departure" && (
              <FormSection title="Équipage et ligne" description="Le chauffeur et le convoyeur signeront avec leur code PIN sur ce téléphone.">
                <Field label="Chauffeur" htmlFor="driver">
                  <Select items={personItems(drivers)} value={driverId} onValueChange={(v) => setDriverId(v ? String(v) : NONE)}>
                    <SelectTrigger id="driver">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Non assigné</SelectItem>
                      {drivers.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {fullName(d)}
                          {!d.has_pin && <span className="text-xs text-warning">sans PIN</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Convoyeur" htmlFor="conveyor">
                  <Select items={personItems(conveyors)} value={conveyorId} onValueChange={(v) => setConveyorId(v ? String(v) : NONE)}>
                    <SelectTrigger id="conveyor">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Non assigné</SelectItem>
                      {conveyors.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {fullName(d)}
                          {!d.has_pin && <span className="text-xs text-warning">sans PIN</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Ligne" htmlFor="route">
                  <Input id="route" value={routeLabel} onChange={(e) => setRouteLabel(e.target.value)} placeholder="Abidjan → Bouaké" />
                </Field>
                <Field label="Départ prévu" htmlFor="departure-at">
                  <Input id="departure-at" type="datetime-local" className="tabular" value={departureAt} onChange={(e) => setDepartureAt(e.target.value)} />
                </Field>
              </FormSection>
            )}
          </div>

          <div className="-mx-5 mt-6 -mb-5 flex justify-end gap-2 border-t bg-surface-sunken px-5 py-4">
            <Link href="/inspections" className={buttonVariants({ variant: "outline" })}>
              Annuler
            </Link>
            <Button type="submit" disabled={saving || !vehicleId}>
              {saving ? "Ouverture…" : "Commencer l'état des lieux"}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </Panel>
      </form>
    </div>
  );
}
