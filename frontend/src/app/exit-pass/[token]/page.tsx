"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Plate, toneSurface, toneText } from "@/components/app/primitives";
import { verifyExitPass } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ExitPassVerification } from "@/types";

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** Vérification publique d'un bon de sortie (QR scanné par le gardien), sans connexion. */
export default function ExitPassVerifyPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [result, setResult] = useState<ExitPassVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const verify = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await verifyExitPass(token));
    } catch (err: any) {
      setResult(null);
      setError(err.message || "Vérification impossible");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    verify();
  }, [verify]);

  const valid = !!result?.valid;
  const tone = valid ? "success" : "danger";

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center gap-2 border-b bg-card px-4 py-3">
        <ShieldCheck className="size-[18px] text-primary" />
        <span className="text-sm font-semibold tracking-tight">FlottAuto</span>
        <span className="text-xs text-muted-foreground">· Contrôle de sortie</span>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        {loading ? (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="size-8 animate-spin" />
            <p className="text-sm">Vérification du bon…</p>
          </div>
        ) : (
          <section className={cn("w-full max-w-md rounded-xl border-[1.5px] px-6 py-10 text-center shadow-card", toneSurface(tone))}>
            {valid ? <CheckCircle2 className="mx-auto size-16" aria-hidden /> : <XCircle className="mx-auto size-16" aria-hidden />}
            <p className={cn("mt-4 text-4xl font-bold tracking-tight", toneText(tone))}>{valid ? "BON VALIDE" : "BON INVALIDE"}</p>

            {!valid && (
              <p className="mt-2 text-base font-medium">{error ?? result?.reason ?? "Bon de sortie invalide"}</p>
            )}

            {result && (result.registration || result.number) && (
              <div className="mt-6 space-y-2 text-foreground">
                {result.registration && (
                  <div className="flex justify-center">
                    <Plate value={result.registration} size="lg" />
                  </div>
                )}
                {result.route_label && <p className="text-base font-medium">{result.route_label}</p>}
                {result.valid_until && (
                  <p className="text-sm tabular">
                    Valable jusqu&apos;à <span className="font-semibold">{formatTime(result.valid_until)}</span>
                  </p>
                )}
                {result.number && <p className="font-mono text-sm text-muted-foreground tabular">{result.number}</p>}
              </div>
            )}

            {error && (
              <button type="button" onClick={verify} className="mt-6 text-sm font-medium underline underline-offset-4">
                Réessayer
              </button>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
