"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
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
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="Chargement" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <CurrentUserContext.Provider value={user}>
      <div className="flex h-dvh overflow-hidden bg-background">
        <Sidebar user={user} className="hidden w-60 shrink-0 lg:flex" />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} />
          <main className="scrollbar-thin flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
          </main>
        </div>
      </div>
    </CurrentUserContext.Provider>
  );
}
