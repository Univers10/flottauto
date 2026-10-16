"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MobileSidebar, Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { api } from "@/lib/api";
import { canAccess, homePathFor } from "@/lib/roles";
import type { User } from "@/types";

const CurrentUserContext = createContext<User | null>(null);

/** Utilisateur connecté, disponible dans toute page rendue sous AppShell. */
export function useCurrentUser(): User | null {
  return useContext(CurrentUserContext);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<User>("/auth/me")
      .then(setUser)
      .catch(() => {
        router.push("/");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const allowed = user ? canAccess(user.role, pathname) : false;

  useEffect(() => {
    if (user && !allowed) router.replace(homePathFor(user.role));
  }, [user, allowed, router]);

  if (loading || (user && !allowed)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <CurrentUserContext.Provider value={user}>
      <div className="flex h-screen bg-background">
        <Sidebar role={user.role} className="hidden w-72 md:flex" />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border/60 bg-card/80 px-4 py-3 backdrop-blur-xl md:hidden">
            <MobileSidebar role={user.role} />
            <span className="font-semibold">FlottAuto</span>
          </div>
          <Topbar user={user} />
          <main className="flex-1 overflow-auto p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </CurrentUserContext.Provider>
  );
}
