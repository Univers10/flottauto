"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileX, Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/primitives";
import { getConvoy, getOperationsSettings } from "@/lib/api";
import { ConvoyContract } from "@/components/app/convoy-contract";
import type { Convoy, OperationsSettings } from "@/types";

/**
 * Contrat de transport de personnes (modèle ITTS), imprimable ou enregistrable en PDF
 * depuis le navigateur. Rendu sans AppShell pour n'imprimer que le contrat.
 */
export default function ConvoyContractPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [convoy, setConvoy] = useState<Convoy | null>(null);
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
    Promise.all([getConvoy(Number(params.id)), getOperationsSettings()])
      .then(([c, s]) => {
        if (cancelled) return;
        if (c.status === "draft") setError("Le contrat n'est pas encore généré : validez d'abord le convoi.");
        setConvoy(c);
        setSettings(s);
      })
      .catch((err: Error) => !cancelled && setError(err.message || "Contrat indisponible"));
    return () => {
      cancelled = true;
    };
  }, [params.id, router]);

  if (error) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <EmptyState
          icon={FileX}
          title="Contrat indisponible"
          description={error}
          action={
            <Link href={`/convoys/${params.id}`} className={buttonVariants({ variant: "outline" })}>
              Retour au convoi
            </Link>
          }
        />
      </main>
    );
  }
  if (!convoy || !settings) {
    return (
      <main className="mx-auto max-w-3xl space-y-3 p-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-[600px] w-full" />
      </main>
    );
  }

  return (
    <ConvoyContract
      convoy={convoy}
      settings={settings}
      toolbar={
        <>
          <Link href={`/convoys/${convoy.id}`} className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="size-4" />
            Retour au convoi
          </Link>
          <Button onClick={() => window.print()}>
            <Printer className="size-4" />
            Imprimer ou enregistrer en PDF
          </Button>
        </>
      }
    />
  );
}
