import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/labels";

/* ───────────────────────── En-tête de page ───────────────────────── */

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1.5">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Fil d'Ariane" className="flex items-center gap-1 text-xs text-muted-foreground">
            {breadcrumb.map((item, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3 text-subtle-foreground" />}
                {item.href ? (
                  <Link href={item.href} className="transition-colors hover:text-foreground">
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-foreground">{item.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ───────────────────────── Statut ───────────────────────── */

const toneClasses: Record<Tone, { badge: string; dot: string }> = {
  success: { badge: "border-success-border bg-success-subtle text-success", dot: "bg-success" },
  warning: { badge: "border-warning-border bg-warning-subtle text-warning", dot: "bg-warning" },
  danger: { badge: "border-danger-border bg-danger-subtle text-danger", dot: "bg-danger" },
  info: { badge: "border-info-border bg-info-subtle text-info", dot: "bg-info" },
  neutral: { badge: "border-neutral-border bg-neutral-subtle text-neutral", dot: "bg-neutral" },
};

/** Badge de statut : pastille + libellé, la couleur n'est jamais le seul porteur de sens. */
export function StatusBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium whitespace-nowrap",
        toneClasses[tone].badge,
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", toneClasses[tone].dot)} aria-hidden />
      {children}
    </span>
  );
}

export function toneText(tone: Tone): string {
  return { success: "text-success", warning: "text-warning", danger: "text-danger", info: "text-info", neutral: "text-neutral" }[tone];
}

export function toneSurface(tone: Tone): string {
  return toneClasses[tone].badge;
}

/* ───────────────────────── Plaque d'immatriculation ───────────────────────── */

export function Plate({ value, size = "md", className }: { value: string; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[5px] border border-border-strong bg-card font-mono font-semibold tracking-wider text-foreground uppercase shadow-xs",
        size === "sm" && "h-5 px-1.5 text-[10.5px]",
        size === "md" && "h-6 px-2 text-xs",
        size === "lg" && "h-8 px-3 text-sm",
        className
      )}
    >
      {value}
    </span>
  );
}

/* ───────────────────────── Carte de section ───────────────────────── */

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  flush = false,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Contenu collé aux bords (tableaux, listes). */
  flush?: boolean;
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl border bg-card shadow-card", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(!flush && "p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/* ───────────────────────── Indicateur ───────────────────────── */

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ElementType;
  tone?: Tone;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] leading-snug font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-lg border",
              tone ? toneClasses[tone].badge : "border-border bg-surface-sunken text-muted-foreground"
            )}
          >
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <p className="mt-3 text-[1.375rem] leading-none font-semibold tracking-tight tabular sm:text-[1.75rem]">{value}</p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const classes = cn(
    "block min-w-0 rounded-xl border bg-card p-4 shadow-card sm:p-5",
    href && "transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop",
    className
  );
  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

/* ───────────────────────── État vide ───────────────────────── */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ElementType;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {Icon && (
        <span className="mb-4 flex size-11 items-center justify-center rounded-xl border bg-surface-sunken text-muted-foreground">
          <Icon className="size-5" />
        </span>
      )}
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ───────────────────────── Liste de propriétés ───────────────────────── */

export function DetailList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between gap-4 py-2.5 text-sm first:pt-0 last:pb-0">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 truncate text-right font-medium tabular">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────────────────────── Champ de formulaire ───────────────────────── */

export function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-[13px] font-medium text-foreground">
        {label}
        {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Groupe de champs avec titre à gauche, façon formulaire de réglages. */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-6 py-6 first:pt-0 last:pb-0 md:grid-cols-[220px_1fr]", className)}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

/* ───────────────────────── Barre d'outils de liste ───────────────────────── */

export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center", className)}>{children}</div>;
}

/* ───────────────────────── Filtre segmenté ───────────────────────── */

export function SegmentButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium transition-colors",
        active ? "bg-secondary text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {children}
      {count !== undefined && <span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground tabular">{count}</span>}
    </button>
  );
}
