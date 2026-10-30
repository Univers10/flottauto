"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  BusFront,
  ClipboardCheck,
  Fuel,
  House,
  Landmark,
  ListTodo,
  Menu,
  Route,
  Settings,
  TicketCheck,
  Users,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { canAccess, roleLabels } from "@/lib/roles";
import { fullName, initials } from "@/lib/format";
import type { Role, User } from "@/types";

type NavItem = { href: string; label: string; icon: React.ElementType };

// Menu rangé par tâche, avec les mots du terrain : ce qu'on fait aujourd'hui en premier.
const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Aujourd'hui",
    items: [
      { href: "/dashboard", label: "Accueil", icon: House },
      { href: "/departures", label: "Départs", icon: TicketCheck },
      { href: "/alerts", label: "Alertes", icon: Bell },
    ],
  },
  {
    label: "Activité",
    items: [
      { href: "/convoys", label: "Convois", icon: Route },
      { href: "/reports", label: "Rapports", icon: BarChart3 },
    ],
  },
  {
    label: "Cars et équipages",
    items: [
      { href: "/vehicles", label: "Cars", icon: BusFront },
      { href: "/drivers", label: "Personnel", icon: Users },
      { href: "/inspections", label: "États des lieux", icon: ClipboardCheck },
    ],
  },
  {
    label: "Entretien",
    items: [
      { href: "/needs", label: "Besoins des cars", icon: ListTodo },
      { href: "/maintenance", label: "Réparations", icon: Wrench },
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
      <Image src="/itts-logo.png" alt="ITTS" width={32} height={32} className="size-8 rounded-lg ring-1 ring-sidebar-border" priority />
      <div className="leading-none">
        <span className="block text-[15px] font-semibold tracking-tight text-sidebar-accent-foreground">FlottAuto</span>
        <span className="mt-1 block text-[10px] font-medium tracking-[0.12em] text-sidebar-muted uppercase">Contrôle des cars</span>
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
