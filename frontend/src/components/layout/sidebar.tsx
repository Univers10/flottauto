"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Car,
  Fuel,
  Landmark,
  LayoutDashboard,
  Menu,
  Settings,
  Users,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { canAccess, roleLabels } from "@/lib/roles";
import { fullName, initials } from "@/lib/format";
import type { Role, User } from "@/types";

type NavItem = { href: string; label: string; icon: React.ElementType };

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Pilotage",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/alerts", label: "Alertes", icon: Bell },
    ],
  },
  {
    label: "Flotte",
    items: [
      { href: "/vehicles", label: "Véhicules", icon: Car },
      { href: "/drivers", label: "Conducteurs", icon: Users },
      { href: "/maintenance", label: "Maintenance", icon: Wrench },
    ],
  },
  {
    label: "Dépenses",
    items: [
      { href: "/fuel", label: "Carburant", icon: Fuel },
      { href: "/tolls", label: "Péages", icon: Landmark },
    ],
  },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.25)]">
        <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" aria-hidden>
          <path d="M4 15.5 7 9h10l3 6.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M3 15.5h18v3H3z" fill="currentColor" />
          <circle cx="7.5" cy="18.5" r="1.6" fill="var(--sidebar-primary)" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="16.5" cy="18.5" r="1.6" fill="var(--sidebar-primary)" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </span>
      <div className="leading-none">
        <span className="block text-[15px] font-semibold tracking-tight text-sidebar-accent-foreground">FlottAuto</span>
        <span className="mt-1 block text-[10px] font-medium tracking-[0.12em] text-sidebar-muted uppercase">Fleet OS</span>
      </div>
    </div>
  );
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      )}
    >
      {isActive && <span className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-sidebar-primary" aria-hidden />}
      <item.icon
        className={cn(
          "size-[18px] shrink-0 transition-colors",
          isActive ? "text-sidebar-primary" : "text-sidebar-muted group-hover:text-sidebar-foreground"
        )}
      />
      {item.label}
    </Link>
  );
}

export function Sidebar({ user, className, onNavigate }: { user: User; className?: string; onNavigate?: () => void }) {
  const role: Role = user.role;
  const groups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((item) => canAccess(role, item.href)) }))
    .filter((g) => g.items.length > 0);
  const settingsActive = canAccess(role, "/settings");

  return (
    <aside className={cn("flex h-full flex-col bg-sidebar text-sidebar-foreground", className)}>
      <div className="flex h-16 shrink-0 items-center px-4">
        <Logo />
      </div>

      <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Navigation principale">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-2.5 text-[11px] font-medium tracking-wide text-sidebar-muted/80 uppercase">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border p-3">
        {settingsActive && <NavLink item={{ href: "/settings", label: "Paramètres", icon: Settings }} onNavigate={onNavigate} />}
        <div className="flex items-center gap-3 rounded-lg px-2.5 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground ring-1 ring-sidebar-border">
            {initials(user.first_name, user.last_name, user.email)}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-medium text-sidebar-accent-foreground">{fullName(user)}</p>
            <p className="truncate text-[11.5px] text-sidebar-muted">{roleLabels[user.role]}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function MobileSidebar({ user }: { user: User }) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
          >
            <Menu className="size-5" />
            <span className="sr-only">Ouvrir le menu</span>
          </button>
        }
      />
      <SheetContent side="left" className="w-72 border-0 p-0" showCloseButton={false}>
        <Sidebar user={user} />
      </SheetContent>
    </Sheet>
  );
}
