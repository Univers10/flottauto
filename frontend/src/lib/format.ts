import type { Tone } from "@/lib/labels";

const numberFmt = new Intl.NumberFormat("fr-FR");
const compactFmt = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });

/** Montant en francs CFA, sans décimales : « 45 000 FCFA ». */
export function formatMoney(value: number | string | null | undefined, { compact = false } = {}): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return `${compact ? compactFmt.format(n) : numberFmt.format(Math.round(n))} FCFA`;
}

export function formatNumber(value: number | string | null | undefined, unit?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return unit ? `${numberFmt.format(n)} ${unit}` : numberFmt.format(n);
}

export function formatDate(value: string | Date | null | undefined, style: "short" | "medium" | "long" = "medium"): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  if (style === "short") return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  if (style === "long") return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/** « dans 12 j », « il y a 3 j », « aujourd'hui ». */
export function formatRelativeDays(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "aujourd'hui";
  if (days > 0) return `dans ${days} j`;
  return `il y a ${-days} j`;
}

export function initials(first?: string | null, last?: string | null, fallback = "?"): string {
  const value = `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
  return value || fallback.slice(0, 1).toUpperCase();
}

export function fullName(person: { first_name?: string | null; last_name?: string | null; email?: string | null } | null | undefined): string {
  if (!person) return "—";
  return `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim() || person.email || "—";
}

/** Ton d'une échéance : danger si dépassée, warning sous `warnDays` jours, sinon null. */
export function expiryTone(value: string | null | undefined, warnDays = 30): Tone | null {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "danger";
  if (days < warnDays) return "warning";
  return null;
}
