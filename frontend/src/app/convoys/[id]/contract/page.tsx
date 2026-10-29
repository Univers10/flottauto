"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileX, Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/primitives";
import { getConvoy, getOperationsSettings } from "@/lib/api";
import { convoyPurposeLabels, paymentMethodLabels } from "@/lib/labels";
import { formatDate, formatNumber } from "@/lib/format";
import { amountInWords } from "@/lib/money-words";
import type { Convoy, OperationsSettings } from "@/types";

const BLANK = "……………………";

function longDateTime(value: string | null): string {
  if (!value) return BLANK;
  const d = new Date(value);
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", " h ");
  return `${formatDate(value, "long")} à ${time}`;
}

/**
 * Contrat de transport de personnes (modèle ITTS), imprimable ou enregistrable en PDF
 * depuis le navigateur. Rendu sans AppShell pour n'imprimer que le contrat.
 */
export default function ConvoyContractPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [convoy, setConvoy] = useState<Convoy | null>(null);
  const [settings, setSettings] = useState<OperationsSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
    let cancelled = false;
    Promise.all([getConvoy(Number(params.id)), getOperationsSettings()])
      .then(([c, s]) => {
        if (cancelled) return;
        if (c.status === "draft") setError("Le contrat n'est pas encore généré : validez d'abord le convoi.");
        setConvoy(c);
        setSettings(s);
      })
      .catch((err: Error) => !cancelled && setError(err.message || "Contrat indisponible"));
    return () => {
      cancelled = true;
    };
  }, [params.id, router]);

  if (error) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <EmptyState
          icon={FileX}
          title="Contrat indisponible"
          description={error}
          action={
            <Link href={`/convoys/${params.id}`} className={buttonVariants({ variant: "outline" })}>
              Retour au convoi
            </Link>
          }
        />
      </main>
    );
  }
  if (!convoy || !settings) {
    return (
      <main className="mx-auto max-w-3xl space-y-3 p-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-[600px] w-full" />
      </main>
    );
  }

  const a = convoy.account!;
  const company = settings.legal_name || "Le transporteur";
  const representative = settings.legal_representative || BLANK;
  const transport = a.revenue_lines[0];
  const immobilization = a.revenue_lines[1];
  const stops = convoy.segments.length ? [convoy.segments[0].from_label, ...convoy.segments.map((s) => s.to_label)].join(" – ") : BLANK;
  const drivers = [convoy.crew_labels.driver, convoy.crew_labels.relief_driver].filter(Boolean).join(", ") || BLANK;
  const rate = immobilization ? Math.round(immobilization.amount / Math.max(convoy.billed_days, 1)) : 0;
  const deposit = convoy.payments.reduce((sum, p) => sum + p.amount, 0);
  const methods = (["wave", "orange_money", "mtn", "moov"] as const).map((m) => paymentMethodLabels[m]).join(", ");

  const rows: [string, React.ReactNode][] = [
    ["Nature", "Transport de personnes · location de car avec équipage"],
    ["Motif", `${convoyPurposeLabels[convoy.purpose]} · ${convoy.title}`],
    ["Itinéraire", `${stops} (${formatNumber(a.km)} km)`],
    ["Lieu de rassemblement", convoy.meeting_point || BLANK],
    ["Départ (ramassage)", longDateTime(convoy.departure_at)],
    ["Retour", convoy.return_date ? formatDate(convoy.return_date, "long") : BLANK],
    ["Nombre de places", `${convoy.seats_sold} places (01 car)${convoy.vehicle_label ? ` · ${convoy.vehicle_label.split(" · ")[0]}` : ""}`],
    ["Équipage", `Chauffeur(s) : ${drivers} · Convoyeur : ${convoy.crew_labels.conveyor || BLANK}`],
  ];

  return (
    <main className="min-h-screen bg-muted/40 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-2 px-4 print:hidden">
        <Link href={`/convoys/${convoy.id}`} className={buttonVariants({ variant: "outline" })}>
          <ArrowLeft className="size-4" />
          Retour au convoi
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" />
          Imprimer ou enregistrer en PDF
        </Button>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white px-[16mm] py-[14mm] font-serif text-[11.5px] leading-relaxed text-black shadow-card print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-black pb-3 font-sans">
          <div>
            <p className="text-base font-bold">{company}</p>
          </div>
          <div className="text-right text-[10px]">
            <p>
              Contrat N° <span className="font-bold">{convoy.number}</span>
            </p>
            <p>Généré par FlottAuto le {formatDate(convoy.contract_generated_at, "short")}</p>
          </div>
        </header>

        <h1 className="mt-6 mb-4 text-center text-xl font-bold">Contrat de Transport de Personnes</h1>

        <p className="font-bold">ENTRE LES SOUSSIGNÉS,</p>
        <p className="mt-1">
          La société <span className="font-bold">{company}</span>
          {settings.legal_details ? `, ${settings.legal_details}` : ""}, représentée par {representative}, ci-après <em>le transporteur</em>,
        </p>
        <p className="mt-1">
          <span className="font-bold">ET</span> {convoy.client_name || BLANK}, agissant en qualité de chef de convoi
          {convoy.client_phone ? `, Tél. ${convoy.client_phone}` : ""}, ci-après <em>le voyageur</em>,
        </p>
        {convoy.broker_name && (
          <p className="mt-1">
            Affaire apportée par : {convoy.broker_name}
            {convoy.broker_phone ? `, Tél. ${convoy.broker_phone}` : ""}.
          </p>
        )}
        <p className="mt-2 font-bold">IL A ÉTÉ CONVENU CE QUI SUIT :</p>

        <h2 className="mt-4 mb-1 font-sans text-[12px] font-bold">1.1 – NATURE ET DATES DU VOYAGE</h2>
        <ContractTable rows={rows} />

        <h2 className="mt-4 mb-1 font-sans text-[12px] font-bold">1.2 – ÉTAT DU CAR</h2>
        <p>
          Car en bon état, conforme aux normes de confort, de sécurité et techniques. Un état des lieux avec photos est fait avant le départ et au
          retour, en présence du chef de convoi.
        </p>

        <h2 className="mt-4 mb-1 font-sans text-[12px] font-bold">1.3 – PRIX ET MODALITÉS DE PAIEMENT</h2>
        <ContractTable
          rows={[
            ["Transport", `${transport?.detail ?? ""} = ${formatNumber(transport?.amount ?? 0)} F CFA`],
            ["Immobilisation du car", `${formatNumber(rate)} F × ${convoy.billed_days} jours = ${formatNumber(immobilization?.amount ?? 0)} F CFA`],
            [
              "Prix global",
              <span key="total" className="font-bold uppercase">
                {amountInWords(a.revenue)} ({formatNumber(a.revenue)}) F CFA
              </span>,
            ],
            [
              "Paiement",
              `Acompte de ${deposit ? `${formatNumber(deposit)} F CFA` : BLANK} à la signature ; solde avant l'embarquement aller. ${methods} ou espèces contre reçu.`,
            ],
          ]}
        />
        <p className="mt-1">Tout jour d&apos;immobilisation en plus des dates fixées est facturé {formatNumber(rate || a.line_revenue_per_day)} F CFA.</p>

        <h2 className="mt-4 mb-1 font-sans text-[12px] font-bold">1.4 – OBLIGATIONS DES PARTIES</h2>
        <p>
          <span className="font-bold">Le transporteur</span> s&apos;engage à respecter les heures et le lieu de ramassage, à l&apos;aller comme au
          retour, ainsi que les mesures de sécurité et de confort pendant tout le voyage.
        </p>
        <p className="mt-1">
          <span className="font-bold">Le voyageur</span> s&apos;engage à respecter les heures et le lieu de ramassage, à l&apos;aller comme au retour.
          Le voyage est réputé consommé aux dates fixées, sauf accord contraire entre les parties. Il règle le prix selon les modalités ci-dessus et
          entretient le car en bon père de famille : tout dégât ou bris de verre de son fait est à sa charge. Il s&apos;abstient de discuter avec le
          conducteur pendant la conduite. Les boissons alcoolisées sont strictement interdites à bord. Il signale tout comportement désobligeant ou
          dangereux de l&apos;équipage au numéro vert du transporteur{settings.hotline ? ` (${settings.hotline})` : ""}.
        </p>

        <h2 className="mt-4 mb-1 font-sans text-[12px] font-bold">1.5 – CLAUSE EN CAS DE LITIGE</h2>
        <p>
          En cas de litige sur l&apos;interprétation ou l&apos;exécution du présent contrat, et à défaut de solution amiable, les parties confient son
          règlement au tribunal compétent, choisi d&apos;un commun accord.
        </p>

        <p className="mt-4">
          Fait à {settings.contract_city || BLANK}, le {BLANK}, en 03 exemplaires originaux.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-10 font-sans text-[11px]">
          <div>
            <p className="font-bold">Le voyageur</p>
            <p>{convoy.client_name || BLANK}</p>
            <div className="mt-16 border-t border-black/40" />
          </div>
          <div>
            <p className="font-bold">Pour le transporteur</p>
            <p>{representative}</p>
            <div className="mt-16 border-t border-black/40" />
          </div>
        </div>
      </article>
    </main>
  );
}

function ContractTable({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <table className="w-full border-collapse border border-black/30 text-[11px]">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b border-black/20">
            <th className="w-[38%] bg-black/[0.04] px-2 py-1 text-left align-top font-bold">{label}</th>
            <td className="px-2 py-1">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
