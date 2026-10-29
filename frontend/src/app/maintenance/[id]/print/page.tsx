"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileX, Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/primitives";
import { getIntervention, getOperationsSettings } from "@/lib/api";
import { paymentMethodLabels, workOrderType } from "@/lib/labels";
import { formatDate, formatNumber } from "@/lib/format";
import type { Intervention, OperationsSettings } from "@/types";

const EXPENSE = {
  pending: "En cours",
  reimbursable: "Remboursable",
  not_reimbursed: "Non remboursée (pas de validation du superviseur)",
  frozen: "Gelée",
} as const;

function dt(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return `${formatDate(value, "short")} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Fiche d'intervention imprimable (ou enregistrable en PDF), rendue sans AppShell. */
export default function InterventionPrintPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [iv, setIv] = useState<Intervention | null>(null);
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
    Promise.all([getIntervention(Number(params.id)), getOperationsSettings().catch(() => null)])
      .then(([data, s]) => {
        if (cancelled) return;
        setIv(data);
        setSettings(s);
      })
      .catch((err: Error) => !cancelled && setError(err.message || "Intervention introuvable"));
    return () => {
      cancelled = true;
    };
  }, [params.id, router]);

  if (error) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <EmptyState icon={FileX} title="Fiche indisponible" description={error} />
      </main>
    );
  }
  if (!iv) {
    return (
      <main className="mx-auto max-w-3xl space-y-3 p-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-[600px] w-full" />
      </main>
    );
  }

  const proofs = [
    ["Facture", iv.proofs.invoice],
    ["Pièce neuve posée", iv.proofs.new_part],
    ["Ancienne pièce", iv.proofs.old_part],
    ["Capture de la validation WhatsApp", iv.proofs.approval_capture],
  ] as const;

  return (
    <main className="min-h-screen bg-muted/40 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-2 px-4 print:hidden">
        <Link href={`/maintenance/${iv.id}`} className={buttonVariants({ variant: "outline" })}>
          <ArrowLeft className="size-4" />
          Retour à l&apos;intervention
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" />
          Imprimer ou enregistrer en PDF
        </Button>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white px-[16mm] py-[14mm] text-[11.5px] leading-relaxed text-black shadow-card print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-black pb-3">
          <p className="text-base font-bold">{settings?.legal_name || "FlottAuto"}</p>
          <div className="text-right text-[10px]">
            <p>
              Intervention N° <span className="font-bold">{iv.id}</span>
            </p>
            <p>Éditée le {formatDate(new Date(), "short")}</p>
          </div>
        </header>

        <h1 className="mt-5 text-lg font-bold">
          {iv.title} · {iv.vehicle_label}
        </h1>
        <p className="text-[10px] uppercase">
          {workOrderType[iv.type]}
          {iv.location ? ` · ${iv.location}` : ""} · Dépense : {EXPENSE[iv.expense_status]}
        </p>

        <h2 className="mt-5 mb-1 font-bold">Circuit de validation</h2>
        <table className="w-full border-collapse">
          <tbody>
            {iv.steps.map((s, i) => (
              <tr key={s.key} className="border-b border-black/20">
                <td className="w-6 py-1">{s.done ? "✓" : "○"}</td>
                <td className="py-1 font-medium">
                  {i + 1}. {s.label}
                </td>
                <td className="py-1">{s.at ? dt(s.at) : ""}</td>
                <td className="py-1">{s.detail ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-5 mb-1 font-bold">Détails</h2>
        <p>
          Garage / mécanicien : {iv.external_garage || "—"} · Téléphone : {iv.garage_phone || "—"} · Kilométrage :{" "}
          {iv.mileage_at_creation ? formatNumber(iv.mileage_at_creation, "km") : "—"} · Saisi par : {iv.reported_by_label || "—"}
        </p>
        {iv.description && <p className="mt-1 whitespace-pre-line">{iv.description}</p>}

        <h2 className="mt-5 mb-1 font-bold">Lignes de la facture</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1">Désignation</th>
              <th className="py-1 text-right">Qté</th>
              <th className="py-1 text-right">P.U.</th>
              <th className="py-1 text-right">Devis validé</th>
              <th className="py-1 text-right">Facture</th>
            </tr>
          </thead>
          <tbody>
            {iv.lines.map((l) => (
              <tr key={l.id} className="border-b border-black/20">
                <td className="py-1">{l.label}</td>
                <td className="py-1 text-right">{l.quantity}</td>
                <td className="py-1 text-right">{formatNumber(l.unit_price)}</td>
                <td className="py-1 text-right">{formatNumber(l.quote_amount)}</td>
                <td className="py-1 text-right">{l.invoice_amount === null ? "—" : formatNumber(l.invoice_amount)}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className="py-1" colSpan={3}>
                Total
              </td>
              <td className="py-1 text-right">{formatNumber(iv.quote_total)}</td>
              <td className="py-1 text-right">{iv.invoice_total === null ? "—" : formatNumber(iv.invoice_total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1">
          Montant validé : {iv.approved_amount === null ? "—" : `${formatNumber(iv.approved_amount)} F`} · Écart : {iv.gap === null ? "—" : `${formatNumber(iv.gap)} F`}
          {iv.payment_method && ` · Payé par ${paymentMethodLabels[iv.payment_method]}${iv.payment_reference ? `, réf. ${iv.payment_reference}` : ""}`}
        </p>

        <h2 className="mt-5 mb-1 font-bold">Justificatifs</h2>
        <p>{proofs.map(([label, ok]) => `${ok ? "✓" : "✗"} ${label}`).join("   ")}</p>

        {iv.impact && (
          <>
            <h2 className="mt-5 mb-1 font-bold">Impact sur le car</h2>
            <p>
              Maintenance cumulée : {formatNumber(iv.impact.total_cost)} F · Dont ce mois : {formatNumber(iv.impact.this_month)} F
              {iv.impact.component && ` · ${iv.impact.component} : ${iv.impact.component_count_12m} fois en 12 mois`}
            </p>
          </>
        )}

        <div className="mt-10 grid grid-cols-2 gap-8 text-center">
          <div>
            <p className="font-bold">Le superviseur</p>
            <p className="mt-1">{iv.approver_label || ""}</p>
          </div>
          <div>
            <p className="font-bold">Le chef de gare</p>
            <p className="mt-1">{iv.closed_by_label || ""}</p>
          </div>
        </div>
      </article>
    </main>
  );
}
