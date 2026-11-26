"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FileX, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/primitives";
import { ConvoyContract } from "@/components/app/convoy-contract";
import { getPublicContract } from "@/lib/api";
import type { PublicContract } from "@/types";

/** Contrat ouvert par le client depuis le lien reçu par WhatsApp ou par mail (sans compte). */
export default function PublicContractPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<PublicContract | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicContract(params.token)
      .then((d) => !cancelled && setData(d))
      .catch((err: Error) => !cancelled && setError(err.message || "Contrat introuvable"));
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  if (error) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <EmptyState icon={FileX} title="Contrat indisponible" description="Ce lien n'est plus valable. Demandez un nouveau lien à la compagnie." />
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-3xl space-y-3 p-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-[600px] w-full" />
      </main>
    );
  }
  return (
    <ConvoyContract
      convoy={data.convoy}
      settings={data.settings}
      toolbar={
        <>
          <p className="text-sm text-muted-foreground">Votre contrat N° {data.convoy.number}</p>
          <Button onClick={() => window.print()}>
            <Printer className="size-4" />
            Imprimer ou enregistrer en PDF
          </Button>
        </>
      }
    />
  );
}
