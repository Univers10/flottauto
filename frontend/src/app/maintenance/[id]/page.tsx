"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Camera, Check, CircleAlert, FileDown, MessageCircle, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell, useCurrentUser } from "@/components/layout/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Field, PageHeader, Panel, StatusBadge, toneSurface, toneText } from "@/components/app/primitives";
import {
  approveIntervention,
  assetUrl,
  closeIntervention,
  deleteWorkOrder,
  deleteWorkOrderPhoto,
  getIntervention,
  markInterventionDone,
  sendInterventionQuote,
  setInterventionLines,
  submitInterventionInvoice,
  updateWorkOrder,
  uploadInterventionProof,
} from "@/lib/api";
import { paymentMethodLabels, workOrderType, type Tone } from "@/lib/labels";
import { formatNumber } from "@/lib/format";
import { canApproveExpenses, canCloseInterventions, canDeleteWorkOrders } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { ExpenseStatus, Intervention, PaymentMethod, ProofKind, WorkOrder, WorkOrderLineInput } from "@/types";

const F = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${formatNumber(n)} F`);
const int = (v: string) => Math.max(0, Math.round(Number(v.replace(/\s/g, "")) || 0));
const METHODS: PaymentMethod[] = ["wave", "orange_money", "mtn", "moov", "cash"];

const PROOFS: { kind: ProofKind; label: string; wide?: boolean }[] = [
  { kind: "invoice", label: "Facture" },
  { kind: "new_part", label: "Pièce neuve posée" },
  { kind: "old_part", label: "Ancienne pièce" },
  { kind: "approval_capture", label: "Capture de la validation WhatsApp", wide: true },
];

const EXPENSE: Record<ExpenseStatus, { label: string; tone: Tone }> = {
  pending: { label: "Dépense en cours", tone: "info" },
  reimbursable: { label: "Dépense remboursable", tone: "success" },
  not_reimbursed: { label: "Non remboursée : pas de validation", tone: "danger" },
  frozen: { label: "Dépense gelée", tone: "danger" },
};

const ACTION_TITLE: Record<NonNullable<Intervention["next_action"]>, string> = {
  quote: "Envoyer le devis au superviseur",
  approve: "Faire valider le devis",
  done: "Déclarer les travaux réalisés",
  invoice: "Déposer la facture (le jour même)",
  close: "Clôturer l'intervention",
};

function hm(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

type LineDraft = { label: string; quantity: string; unit_price: string; invoice_amount: string };

function toDrafts(iv: Intervention): LineDraft[] {
  return iv.lines.map((l) => ({
    label: l.label,
    quantity: String(l.quantity),
    unit_price: String(l.unit_price),
    invoice_amount: l.invoice_amount === null ? "" : String(l.invoice_amount),
  }));
}

export default function InterventionPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const [iv, setIv] = useState<Intervention | null>(null);

  useEffect(() => {
    let cancelled = false;
    getIntervention(id)
      .then((data) => !cancelled && setIv(data))
      .catch((err: Error) => {
        if (cancelled) return;
        toast.error(err.message || "Intervention introuvable");
        router.push("/maintenance");
      });
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  return (
    <AppShell>
      {iv ? (
        <InterventionView iv={iv} onChange={setIv} />
      ) : (
        <div className="space-y-6">
          <Skeleton className="h-10 w-96" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      )}
    </AppShell>
  );
}

function InterventionView({ iv, onChange }: { iv: Intervention; onChange: (iv: Intervention) => void }) {
  const router = useRouter();
  const user = useCurrentUser();
  const locked = iv.legacy || iv.closed_at !== null;
  const [busy, setBusy] = useState(false);
  // Lignes modifiées mais pas enregistrées : on bloque les étapes pour ne pas valider ou facturer d'anciens montants.
  const [linesDirty, setLinesDirty] = useState(false);

  async function run(action: () => Promise<Intervention>, success: string) {
    setBusy(true);
    try {
      onChange(await action());
      toast.success(success);
    } catch (err) {
      toast.error((err as Error).message || "Action impossible");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Supprimer l'intervention « ${iv.title} » ?`)) return;
    try {
      await deleteWorkOrder(iv.id);
      toast.success("Intervention supprimée");
      router.push("/maintenance");
    } catch (err) {
      toast.error((err as Error).message || "Suppression impossible");
    }
  }

  const expense = EXPENSE[iv.expense_status];
  const where = [iv.location, iv.external_garage].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Réparations", href: "/maintenance" }, { label: `Intervention N°${iv.id}` }]}
        title={`${iv.title}${iv.vehicle_label ? ` · ${iv.vehicle_label.split(" · ")[0]}` : ""}`}
        description={
          <>
          <span className="block text-xs font-medium tracking-wide uppercase">{[workOrderType[iv.type], where].filter(Boolean).join(" · ")}</span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {iv.legacy ? (
              <StatusBadge tone="neutral">Historique importé</StatusBadge>
            ) : (
              <>
                <StatusBadge tone={expense.tone}>{expense.label}</StatusBadge>
                {iv.approved_at && <StatusBadge tone="success">Validée par le superviseur</StatusBadge>}
                {iv.invoice_submitted_at && (
                  <StatusBadge tone={iv.flags.includes("invoice_late") ? "warning" : "success"}>
                    {iv.flags.includes("invoice_late") ? "Facture déposée en retard" : "Facture déposée le jour même"}
                  </StatusBadge>
                )}
                {iv.gap !== null && (
                  <StatusBadge tone={iv.flags.includes("needs_reapproval") ? "danger" : "success"}>Écart devis / facture : {F(iv.gap)}</StatusBadge>
                )}
              </>
            )}
          </span>
          </>
        }
        actions={
          <>
            <Link href={`/maintenance/${iv.id}/print`} className={buttonVariants({ variant: "outline" })}>
              <FileDown className="size-4" />
              Exporter PDF
            </Link>
            {user && canDeleteWorkOrders(user.role) && !locked && (
              <Button variant="ghost" onClick={remove} aria-label="Supprimer l'intervention">
                <Trash2 className="size-4" />
              </Button>
            )}
          </>
        }
      />

      <Panel title="Circuit de validation">
        <ol className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {iv.steps.map((s, i) => (
            <li
              key={s.key}
              aria-current={s.current ? "step" : undefined}
              className={cn(
                "rounded-lg border p-3 text-sm",
                s.done ? toneSurface("success") : s.current ? "border-primary bg-primary-subtle ring-2 ring-primary/20" : "bg-surface-sunken text-muted-foreground"
              )}
            >
              <p className="flex items-center gap-1.5 font-semibold text-foreground">
                {s.done && <Check className={cn("size-3.5", toneText("success"))} />}
                {i + 1}. {s.label}
              </p>
              <p className="mt-1 text-xs leading-snug">{[hm(s.at), s.detail].filter(Boolean).join(" · ") || (s.current ? "À faire maintenant" : "")}</p>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          {!locked && iv.next_action && user && (
            <NextAction iv={iv} busy={busy || linesDirty} linesDirty={linesDirty} run={run} canApprove={canApproveExpenses(user.role)} canClose={canCloseInterventions(user.role)} />
          )}
          <DetailsPanel iv={iv} locked={locked} onChange={onChange} />
          <LinesPanel iv={iv} locked={locked || iv.invoice_submitted_at !== null} onChange={onChange} onDirtyChange={setLinesDirty} />
        </div>

        <div className="space-y-6">
          <ProofsPanel iv={iv} locked={locked} onChange={onChange} />
          {iv.impact && (
            <Panel title={`Impact sur le ${iv.vehicle_label.split(" · ")[0] || "car"}`}>
              <dl className="space-y-2 text-sm">
                <Row label="Maintenance cumulée" value={F(iv.impact.total_cost)} />
                <Row label="Dont ce mois" value={F(iv.impact.this_month)} />
                {iv.impact.component && <Row label={`Interventions : ${iv.impact.component.toLowerCase()} (12 mois)`} value={String(iv.impact.component_count_12m)} />}
              </dl>
              {iv.impact.warning && <p className={cn("mt-3 rounded-full px-2.5 py-1 text-xs font-medium", toneSurface("warning"))}>{iv.impact.warning}</p>}
            </Panel>
          )}
          <Panel title="Règles">
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Pas de validation du superviseur = dépense non remboursée.</li>
              <li>Facture absente à minuit = alerte au superviseur et dépense gelée.</li>
              <li>Écart facture / devis &gt; 5 % = nouvelle validation obligatoire.</li>
              <li>Ancienne pièce non rapportée = intervention signalée dans les rapports.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular">{value}</dd>
    </div>
  );
}

function NextAction({
  iv,
  busy,
  linesDirty,
  run,
  canApprove,
  canClose,
}: {
  iv: Intervention;
  busy: boolean;
  linesDirty: boolean;
  run: (action: () => Promise<Intervention>, success: string) => Promise<void>;
  canApprove: boolean;
  canClose: boolean;
}) {
  const action = iv.next_action!;
  const [approver, setApprover] = useState("");
  const [method, setMethod] = useState<PaymentMethod | null>(iv.payment_method);
  const [reference, setReference] = useState(iv.payment_reference ?? "");
  const blocked = iv.blockers.length > 0;

  return (
    <Panel title={`À faire maintenant : ${ACTION_TITLE[action]}`} className="border-primary">
      {linesDirty && (
        <p className={cn("mb-4 flex gap-2 text-sm font-medium", toneText("warning"))}>
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          Enregistrez d&apos;abord les lignes modifiées.
        </p>
      )}
      {iv.blockers.length > 0 && (
        <ul className="mb-4 space-y-1.5 text-sm">
          {iv.blockers.map((b) => (
            <li key={b} className={cn("flex gap-2", toneText("warning"))}>
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {b}
            </li>
          ))}
        </ul>
      )}

      {action === "quote" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={busy || iv.quote_total <= 0} onClick={() => run(() => sendInterventionQuote(iv.id), "Devis envoyé au superviseur")}>
            Envoyer le devis ({F(iv.quote_total)})
          </Button>
          <p className="text-sm text-muted-foreground">Saisissez d&apos;abord les lignes du devis ci-dessous.</p>
        </div>
      )}

      {action === "approve" && (
        <div className="space-y-4">
          {canApprove && (
            <Button disabled={busy || iv.quote_total <= 0} onClick={() => run(() => approveIntervention(iv.id, "in_app"), "Devis validé")}>
              <Check className="size-4" />
              Valider la dépense ({F(Math.max(iv.quote_total, iv.invoice_total ?? 0, iv.lines.reduce((s, l) => s + (l.invoice_amount ?? l.quote_amount), 0)))})
            </Button>
          )}
          <div className="rounded-lg border bg-surface-sunken p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <MessageCircle className="size-4" />
              Le superviseur a validé par WhatsApp ?
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {iv.proofs.approval_capture ? "Capture jointe." : "Joignez d'abord la capture de sa réponse dans « Justificatifs »."} Puis indiquez son nom.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Input className="max-w-xs" placeholder="Nom du superviseur" aria-label="Nom du superviseur" value={approver} onChange={(e) => setApprover(e.target.value)} />
              <Button
                variant="outline"
                disabled={busy || !approver.trim() || !iv.proofs.approval_capture}
                onClick={() => run(() => approveIntervention(iv.id, "whatsapp", approver.trim()), "Validation WhatsApp enregistrée")}
              >
                Enregistrer la validation
              </Button>
            </div>
          </div>
          {iv.status !== "done" && (
            <p className="text-xs text-muted-foreground">
              Urgence en route ? Les travaux peuvent être déclarés réalisés sans validation, mais la dépense ne sera pas remboursée.{" "}
              <button type="button" className="underline" disabled={busy} onClick={() => run(() => markInterventionDone(iv.id), "Travaux déclarés réalisés")}>
                Déclarer réalisés quand même
              </button>
            </p>
          )}
        </div>
      )}

      {action === "done" && (
        <Button disabled={busy} onClick={() => run(() => markInterventionDone(iv.id), "Travaux déclarés réalisés")}>
          <Check className="size-4" />
          Les travaux sont réalisés
        </Button>
      )}

      {action === "invoice" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Vérifiez la colonne « Facture » des lignes, joignez la facture, puis indiquez le paiement.</p>
          <div className="flex flex-wrap gap-1.5">
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                aria-pressed={method === m}
                className={cn(
                  "h-7 rounded-full px-2.5 text-xs font-medium transition-colors",
                  method === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                {paymentMethodLabels[m]}
              </button>
            ))}
          </div>
          <Input className="max-w-sm" placeholder="Référence (n° de transaction)" aria-label="Référence du paiement" value={reference} onChange={(e) => setReference(e.target.value)} />
          <Button
            disabled={busy || blocked}
            onClick={() => run(() => submitInterventionInvoice(iv.id, { payment_method: method, payment_reference: reference.trim() || null }), "Facture déposée")}
          >
            Déposer la facture
          </Button>
        </div>
      )}

      {action === "close" &&
        (canClose ? (
          <Button disabled={busy || blocked} onClick={() => run(() => closeIntervention(iv.id), "Intervention clôturée")}>
            <Check className="size-4" />
            Clôturer l&apos;intervention
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Le chef de gare clôture l&apos;intervention après contrôle des justificatifs.</p>
        ))}
    </Panel>
  );
}

function DetailsPanel({ iv, locked, onChange }: { iv: Intervention; locked: boolean; onChange: (iv: Intervention) => void }) {
  const [form, setForm] = useState({
    title: iv.title,
    location: iv.location ?? "",
    mileage: iv.mileage_at_creation ? String(iv.mileage_at_creation) : "",
    garage: iv.external_garage ?? "",
    phone: iv.garage_phone ?? "",
    description: iv.description ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setSaving(true);
    try {
      await updateWorkOrder(iv.id, {
        title: form.title.trim() || iv.title,
        location: form.location.trim() || null,
        mileage_at_creation: form.mileage ? int(form.mileage) : null,
        external_garage: form.garage.trim() || null,
        garage_phone: form.phone.trim() || null,
        description: form.description.trim() || null,
      } as Partial<WorkOrder>);
      onChange(await getIntervention(iv.id));
      toast.success("Détails enregistrés");
    } catch (err) {
      toast.error((err as Error).message || "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Détails">
      <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-3">
        <Field label="Intitulé" htmlFor="iv-title" className="sm:col-span-3">
          <Input id="iv-title" value={form.title} onChange={set("title")} />
        </Field>
        <Field label="Lieu" htmlFor="iv-location">
          <Input id="iv-location" placeholder="En route · Katiola" value={form.location} onChange={set("location")} />
        </Field>
        <Field label="Kilométrage constaté" htmlFor="iv-km">
          <Input id="iv-km" inputMode="numeric" className="tabular" placeholder="km" value={form.mileage} onChange={set("mileage")} />
        </Field>
        <Field label="Saisi par" htmlFor="iv-by">
          <Input id="iv-by" value={iv.reported_by_label ?? "—"} readOnly disabled />
        </Field>
        <Field label="Garage / mécanicien" htmlFor="iv-garage">
          <Input id="iv-garage" value={form.garage} onChange={set("garage")} />
        </Field>
        <Field label="Téléphone du garage" htmlFor="iv-phone">
          <Input id="iv-phone" inputMode="tel" value={form.phone} onChange={set("phone")} />
        </Field>
        <div className="hidden sm:block" />
        <Field label="Constat et travaux" htmlFor="iv-desc" className="sm:col-span-3">
          <Textarea id="iv-desc" rows={3} placeholder="Ce qui a été constaté, ce qui a été fait…" value={form.description} onChange={set("description")} />
        </Field>
      </fieldset>
      {!locked && (
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={save} disabled={saving}>
            <Save className="size-4" />
            {saving ? "Enregistrement…" : "Enregistrer les détails"}
          </Button>
        </div>
      )}
    </Panel>
  );
}

function LinesPanel({
  iv,
  locked,
  onChange,
  onDirtyChange,
}: {
  iv: Intervention;
  locked: boolean;
  onChange: (iv: Intervention) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [rows, setRows] = useState<LineDraft[]>(() => toDrafts(iv));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirtyState] = useState(false);
  const setDirty = (value: boolean) => {
    setDirtyState(value);
    onDirtyChange(value);
  };
  // La colonne Facture se remplit une fois les travaux réalisés.
  const invoicing = iv.status === "done" || iv.invoice_submitted_at !== null;

  function update(i: number, patch: Partial<LineDraft>) {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
  }

  async function save() {
    const lines: WorkOrderLineInput[] = rows
      .filter((r) => r.label.trim())
      .map((r) => ({
        label: r.label.trim(),
        quantity: Math.max(1, int(r.quantity)),
        unit_price: int(r.unit_price),
        invoice_amount: invoicing && r.invoice_amount !== "" ? int(r.invoice_amount) : null,
      }));
    setSaving(true);
    try {
      const next = await setInterventionLines(iv.id, lines);
      onChange(next);
      setRows(toDrafts(next));
      setDirty(false);
      toast.success("Lignes enregistrées");
    } catch (err) {
      toast.error((err as Error).message || "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  const quote = rows.reduce((s, r) => s + Math.max(1, int(r.quantity)) * int(r.unit_price), 0);
  const invoice = rows.reduce((s, r) => s + (r.invoice_amount !== "" ? int(r.invoice_amount) : Math.max(1, int(r.quantity)) * int(r.unit_price)), 0);
  const title = iv.invoice_submitted_at || invoicing ? "Lignes de la facture" : "Lignes du devis";

  return (
    <Panel title={title} description={locked ? undefined : "Pièces et main-d'œuvre, en F CFA."}>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 text-left font-medium">Désignation</th>
              <th className="w-16 py-2 text-right font-medium">Qté</th>
              <th className="w-28 py-2 text-right font-medium">P.U.</th>
              <th className="w-28 py-2 text-right font-medium">{iv.approved_at ? "Devis validé" : "Devis"}</th>
              <th className="w-28 py-2 text-right font-medium">Facture</th>
              {!locked && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b">
                <td className="py-1.5 pr-2">
                  {locked ? r.label : <Input aria-label="Désignation" value={r.label} onChange={(e) => update(i, { label: e.target.value })} />}
                </td>
                <td className="py-1.5 text-right tabular">
                  {locked ? r.quantity : <Input aria-label="Quantité" inputMode="numeric" className="text-right tabular" value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />}
                </td>
                <td className="py-1.5 pl-2 text-right tabular">
                  {locked ? formatNumber(int(r.unit_price)) : <Input aria-label="Prix unitaire" inputMode="numeric" className="text-right tabular" value={r.unit_price} onChange={(e) => update(i, { unit_price: e.target.value })} />}
                </td>
                <td className="py-1.5 pl-2 text-right tabular">{formatNumber(Math.max(1, int(r.quantity)) * int(r.unit_price))}</td>
                <td className="py-1.5 pl-2 text-right tabular">
                  {!locked && invoicing ? (
                    <Input
                      aria-label="Montant facturé"
                      inputMode="numeric"
                      className="text-right tabular"
                      placeholder={String(Math.max(1, int(r.quantity)) * int(r.unit_price))}
                      value={r.invoice_amount}
                      onChange={(e) => update(i, { invoice_amount: e.target.value })}
                    />
                  ) : r.invoice_amount !== "" ? (
                    formatNumber(int(r.invoice_amount))
                  ) : (
                    "—"
                  )}
                </td>
                {!locked && (
                  <td className="py-1.5 pl-1">
                    <Button variant="ghost" size="icon" aria-label="Retirer la ligne" onClick={() => { setRows(rows.filter((_, j) => j !== i)); setDirty(true); }}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2" colSpan={3}>
                Total
              </td>
              <td className="py-2 text-right tabular">{formatNumber(quote)}</td>
              <td className="py-2 text-right tabular">{invoicing || iv.invoice_total !== null ? formatNumber(iv.invoice_total ?? invoice) : "—"}</td>
              {!locked && <td />}
            </tr>
          </tbody>
        </table>
      </div>
      {!locked && (
        <div className="mt-3 flex flex-wrap justify-between gap-2">
          <Button variant="outline" onClick={() => { setRows([...rows, { label: "", quantity: "1", unit_price: "", invoice_amount: "" }]); setDirty(true); }}>
            <Plus className="size-4" />
            Ajouter une ligne
          </Button>
          <Button onClick={save} disabled={saving || !dirty}>
            <Save className="size-4" />
            {saving ? "Enregistrement…" : "Enregistrer les lignes"}
          </Button>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {iv.payment_method && `Payé par ${paymentMethodLabels[iv.payment_method]}${iv.payment_reference ? `, référence ${iv.payment_reference}` : ""} · `}
        {iv.price_compared > 0
          ? iv.price_flags.length
            ? `Prix comparés à ${iv.price_compared} prix passés : `
            : `Prix comparés à ${iv.price_compared} prix passés : conformes.`
          : iv.lines.length
            ? "Pas encore d'historique de prix pour ces pièces."
            : ""}
        {iv.price_flags.map((f) => (
          <span key={f.label} className={cn("font-medium", toneText("warning"))}>
            {f.label} à {F(f.unit_price)} (habituel {F(f.usual_price)}).{" "}
          </span>
        ))}
      </p>
    </Panel>
  );
}

function ProofsPanel({ iv, locked, onChange }: { iv: Intervention; locked: boolean; onChange: (iv: Intervention) => void }) {
  const inputs = useRef<Partial<Record<ProofKind, HTMLInputElement | null>>>({});
  const [uploading, setUploading] = useState<ProofKind | null>(null);
  const photos = iv.photos ?? [];

  async function upload(kind: ProofKind, file: File | undefined) {
    if (!file) return;
    setUploading(kind);
    try {
      await uploadInterventionProof(iv.id, kind, file);
      onChange(await getIntervention(iv.id));
      toast.success("Justificatif ajouté");
    } catch (err) {
      toast.error((err as Error).message || "Envoi impossible");
    } finally {
      setUploading(null);
    }
  }

  async function remove(photoId: number) {
    if (!confirm("Retirer ce justificatif ?")) return;
    try {
      await deleteWorkOrderPhoto(iv.id, photoId);
      onChange(await getIntervention(iv.id));
    } catch (err) {
      toast.error((err as Error).message || "Suppression impossible");
    }
  }

  return (
    <Panel title="Justificatifs (obligatoires)">
      <div className="grid grid-cols-3 gap-2">
        {PROOFS.map(({ kind, label, wide }) => {
          const file = photos.find((p) => p.kind === kind);
          const url = file ? assetUrl(file.file_url) : null;
          const isPdf = !!file && file.file_url.toLowerCase().endsWith(".pdf");
          return (
            <div key={kind} className={cn("group relative overflow-hidden rounded-lg border bg-surface-sunken", wide ? "col-span-3 h-20" : "h-28")}>
              {url && !isPdf && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={label} className="absolute inset-0 size-full object-cover opacity-80" />
              )}
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="absolute inset-0" aria-label={`Ouvrir : ${label}`} />
              ) : (
                !locked && (
                  <button
                    type="button"
                    className="absolute inset-0 flex items-center justify-center text-muted-foreground hover:text-foreground"
                    onClick={() => inputs.current[kind]?.click()}
                    disabled={uploading !== null}
                    aria-label={`Ajouter : ${label}`}
                  >
                    <Camera className="size-5" />
                  </button>
                )
              )}
              <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-card/85 px-2 py-1 text-xs font-medium">
                {label} {file ? "✓" : uploading === kind ? "…" : ""}
              </p>
              {file && !locked && (
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="absolute top-1 right-1 bg-card opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Retirer : ${label}`}
                  onClick={() => remove(file.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
              <input
                ref={(el) => {
                  inputs.current[kind] = el;
                }}
                type="file"
                accept={kind === "invoice" ? "image/*,application/pdf" : "image/*"}
                capture={kind === "invoice" || kind === "approval_capture" ? undefined : "environment"}
                className="hidden"
                onChange={(e) => {
                  upload(kind, e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          );
        })}
      </div>
      {iv.flags.includes("old_part_missing") && <p className={cn("mt-3 text-xs font-medium", toneText("warning"))}>Ancienne pièce non rapportée : signalé dans les rapports.</p>}
    </Panel>
  );
}
