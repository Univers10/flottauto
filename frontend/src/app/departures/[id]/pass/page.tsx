"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Printer, TicketX } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Plate, StatusBadge } from "@/components/app/primitives";
import { getDeparture, getExitPass, getVehicle } from "@/lib/api";
import { departureLight } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import type { Departure, ExitPass, Vehicle } from "@/types";

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Bon de sortie imprimable, rendu sans AppShell pour n'imprimer que le ticket
 * (A4 ou imprimante thermique 58 mm). Les requêtes utilisent le jeton de l'utilisateur.
 */
export default function ExitPassPrintPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const [pass, setPass] = useState<ExitPass | null>(null);
  const [departure, setDeparture] = useState<Departure | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    let token: string | null = null;
    try {
      token = localStorage.getItem("flottauto_token");
    } catch {
      token = null;
    }
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    try {
      const [p, dep] = await Promise.all([getExitPass(id), getDeparture(id)]);
      setPass(p);
      setDeparture(dep);
      setVehicle(await getVehicle(dep.vehicle_id).catch(() => null));
    } catch (err: any) {
      setError(err.message || "Bon de sortie indisponible");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  const back = (
    <Link href={`/departures/${id}`} className={buttonVariants({ variant: "outline" })}>
      <ArrowLeft className="size-4" />
      Retour
    </Link>
  );

  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-8 print:block print:min-h-0 print:p-0">
      <style>{`@media print { @page { margin: 6mm; } }`}</style>

      {loading ? (
        <Skeleton className="h-[560px] w-full max-w-[380px] rounded-xl" />
      ) : error || !pass || !departure ? (
        <div className="w-full max-w-md rounded-xl border bg-card shadow-card">
          <EmptyState icon={TicketX} title="Bon de sortie indisponible" description={error ?? "Aucun bon de sortie valide pour ce départ."} action={back} />
        </div>
      ) : (
        <>
          <article className="w-full max-w-[380px] rounded-xl border bg-card px-6 py-6 text-center text-foreground shadow-card print:mx-auto print:max-w-[380px] print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">FlottAuto · Bon de sortie</p>
            <p className="mt-2 font-mono text-2xl font-bold tracking-wider tabular">{pass.number}</p>

            <div className="mt-4 flex flex-col items-center gap-2">
              <Plate value={vehicle?.registration ?? `#${departure.vehicle_id}`} size="lg" />
              {departure.route_label && <p className="text-sm font-medium">{departure.route_label}</p>}
              <StatusBadge tone={departureLight[pass.status].tone}>{departureLight[pass.status].label}</StatusBadge>
            </div>

            <dl className="mt-4 divide-y border-y text-sm">
              <div className="flex items-center justify-between gap-3 py-2">
                <dt className="text-muted-foreground">Départ prévu</dt>
                <dd className="font-medium tabular">
                  {formatDate(departure.scheduled_at, "short")} · {formatTime(departure.scheduled_at)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <dt className="text-muted-foreground">Valable jusqu&apos;à</dt>
                <dd className="font-semibold tabular">{formatTime(pass.valid_until)}</dd>
              </div>
            </dl>

            {/* SVG généré par le serveur (segno), fond clair intégré : contenu de confiance. */}
            <div
              className="mx-auto mt-5 w-full max-w-[220px] [&_svg]:h-auto [&_svg]:w-full"
              role="img"
              aria-label={`QR code du bon de sortie ${pass.number}`}
              dangerouslySetInnerHTML={{ __html: pass.qr_svg }}
            />
            <p className="mt-2 text-sm font-medium">Scanner à la sortie de gare</p>
            <p className="mt-3 text-xs text-muted-foreground tabular">
              Émis le {formatDate(pass.issued_at, "short")} à {formatTime(pass.issued_at)}
            </p>
          </article>

          <div className="mt-6 flex gap-2 print:hidden">
            {back}
            <Button onClick={() => window.print()}>
              <Printer className="size-4" />
              Imprimer
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
