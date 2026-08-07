"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MobileSidebar, Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { api } from "@/lib/api";
import type { User } from "@/types";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar className="hidden w-72 md:flex" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/60 bg-card/80 px-4 py-3 backdrop-blur-xl md:hidden">
          <MobileSidebar />
          <span className="font-semibold">FlottAuto</span>
        </div>
        <Topbar user={user} />
        <main className="flex-1 overflow-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
