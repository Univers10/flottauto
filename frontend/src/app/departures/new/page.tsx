"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AppShell, useCurrentUser } from "@/components/layout/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Field, FormSection, PageHeader, Panel } from "@/components/app/primitives";
import { api, createDeparture, listVehicles } from "@/lib/api";
import { canRunInspections } from "@/lib/roles";
import { fullName } from "@/lib/format";
import type { Driver, Vehicle } from "@/types";
import { toast } from "sonner";

const NONE = "none";

export default function NewDeparturePage() {
  return (
    <AppShell>
      <NewDepartureForm />
    </AppShell>
  );
}

function NewDepartureForm() {
  const router = useRouter();
  const user = useCurrentUser();
  const [vehicleId, setVehicleId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [routeLabel, setRouteLabel] = useState("");
  const [distance, setDistance] = useState("");
  const [driverId, setDriverId] = useState(NONE);
  const [conveyorId, setConveyorId] = useState(NONE);
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
          description="Seuls les chefs de gare et les responsables d'exploitation peuvent programmer un départ."
          action={
            <Link href="/departures" className={buttonVariants({ variant: "outline" })}>
              Retour aux départs
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
    if (!scheduledAt) {
      toast.error("Indiquez l'heure de départ");
      return;
    }
    const km = distance.trim() ? Number(distance) : null;
    if (km !== null && (!Number.isFinite(km) || km < 0)) {
      toast.error("Distance invalide");
      return;
    }
    setSaving(true);
    try {
      const created = await createDeparture({
        vehicle_id: Number(vehicleId),
        scheduled_at: `${scheduledAt}:00`,
        route_label: routeLabel.trim() || null,
        distance_km: km,
        driver_id: driverId !== NONE ? Number(driverId) : null,
        conveyor_id: conveyorId !== NONE ? Number(conveyorId) : null,
      });
      toast.success("Départ programmé");
      router.push(`/departures/${created.id}`);
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
        title="Nouveau départ"
        description="Programmez le départ : le système vérifiera les papiers, l'équipage, le car et l'exploitation avant d'émettre le bon de sortie."
        breadcrumb={[{ label: "Départs", href: "/departures" }, { label: "Nouveau" }]}
      />

      <form onSubmit={handleSubmit}>
        <Panel>
          <div className="divide-y">
            <FormSection title="Car et horaire" description="La gare est celle de votre compte.">
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
              <Field label="Heure de départ" htmlFor="scheduled-at" required>
                <Input
                  id="scheduled-at"
                  type="datetime-local"
                  className="tabular"
                  required
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </Field>
            </FormSection>

            <FormSection title="Ligne" description="La distance permet de vérifier que le carburant suffit pour l'étape.">
              <Field label="Ligne" htmlFor="route">
                <Input id="route" value={routeLabel} onChange={(e) => setRouteLabel(e.target.value)} placeholder="Abidjan → Bouaké" />
              </Field>
              <Field label="Distance de l'étape (km)" htmlFor="distance" hint="Pour vérifier le carburant">
                <Input
                  id="distance"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="tabular"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                  placeholder="350"
                />
              </Field>
            </FormSection>

            <FormSection title="Équipage" description="Le chauffeur et le convoyeur signeront l'état des lieux avec leur code PIN.">
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
            </FormSection>
          </div>

          <div className="-mx-5 mt-6 -mb-5 flex justify-end gap-2 border-t bg-surface-sunken px-5 py-4">
            <Link href="/departures" className={buttonVariants({ variant: "outline" })}>
              Annuler
            </Link>
            <Button type="submit" disabled={saving || !vehicleId || !scheduledAt}>
              {saving ? "Enregistrement…" : "Programmer le départ"}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </Panel>
      </form>
    </div>
  );
}
