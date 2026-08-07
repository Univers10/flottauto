"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Car,
  Users,
  Wrench,
  LayoutDashboard,
  Bell,
  Settings,
  Menu,
  ShieldCheck,
  Landmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/vehicles", label: "Flotte", icon: Car },
  { href: "/drivers", label: "Conducteurs", icon: Users },
  { href: "/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/tolls", label: "Péages", icon: Landmark },
  { href: "/alerts", label: "Alertes", icon: Bell },
  { href: "/settings", label: "Paramètres", icon: Settings },
];

function NavLink({ item }: { item: (typeof navItems)[number] }) {
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
      )}
      <item.icon className={cn("h-5 w-5 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
      {item.label}
    </Link>
  );
}

export function Sidebar({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full flex-col border-r border-sidebar-border bg-sidebar p-4", className)}>
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-600 text-primary-foreground shadow-lg shadow-primary/25">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <span className="block text-lg font-bold tracking-tight text-foreground">FlottAuto</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Fleet OS</span>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>
      <div className="mt-6 rounded-2xl bg-gradient-to-br from-primary to-blue-600 p-4 text-primary-foreground shadow-lg shadow-primary/25">
        <p className="text-xs font-medium opacity-90">Passez à Pro</p>
        <p className="mt-1 text-[11px] opacity-80">Débloquez les rapports avancés et l&apos;IA.</p>
        <button className="mt-3 w-full rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm transition hover:bg-white/30">
          En savoir plus
        </button>
      </div>
    </div>
  );
}

export function MobileSidebar() {
  return (
    <Sheet>
      <SheetTrigger>
        <div className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-sm font-medium transition-colors hover:bg-muted md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Ouvrir le menu</span>
        </div>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <Sidebar className="border-0" />
      </SheetContent>
    </Sheet>
  );
}
