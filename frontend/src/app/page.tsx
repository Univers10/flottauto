"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BellRing, Gauge, Loader2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/primitives";
import { getMe, login, setToken } from "@/lib/api";
import { homePathFor } from "@/lib/roles";
import { toast } from "sonner";

const highlights = [
  { icon: Gauge, title: "Toute la flotte d'un coup d'œil", text: "Disponibilité, coûts et échéances de chaque véhicule." },
  { icon: Wrench, title: "Maintenance tracée", text: "Interventions, photos et coûts saisis par vos maintenanciers." },
  { icon: BellRing, title: "Alertes avant l'échéance", text: "Assurances, visites techniques et permis surveillés pour vous." },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(email, password);
      setToken(data.access_token);
      const me = await getMe();
      router.push(homePathFor(me.role));
      router.refresh();
    } catch (err: any) {
      toast.error(err.message === "Incorrect email or password" ? "Email ou mot de passe incorrect" : err.message || "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Panneau de marque */}
      <div className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--sidebar-border) 1px, transparent 1px), linear-gradient(to bottom, var(--sidebar-border) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at 30% 40%, black 20%, transparent 75%)",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -top-40 -right-32 size-[520px] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--sidebar-primary), transparent 65%)" }}
          aria-hidden
        />

        <div className="relative flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden>
              <path d="M4 15.5 7 9h10l3 6.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M3 15.5h18v3H3z" fill="currentColor" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight text-sidebar-accent-foreground">FlottAuto</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[2.1rem] leading-[1.15] font-semibold tracking-tight text-sidebar-accent-foreground">
            Votre flotte, pilotée en un clin d&apos;œil.
          </h2>
          <ul className="mt-10 space-y-6">
            {highlights.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent text-sidebar-primary">
                  <Icon className="size-[18px]" />
                </span>
                <div>
                  <p className="text-sm font-medium text-sidebar-accent-foreground">{title}</p>
                  <p className="mt-0.5 text-sm text-sidebar-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-sidebar-muted">© {new Date().getFullYear()} FlottAuto · Gestion de flotte et de transport</p>
      </div>

      {/* Formulaire */}
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden>
                <path d="M4 15.5 7 9h10l3 6.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M3 15.5h18v3H3z" fill="currentColor" />
              </svg>
            </span>
            <span className="text-lg font-semibold tracking-tight">FlottAuto</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Accédez à l&apos;espace de gestion de votre flotte.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <Field label="Adresse e-mail" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="nom@entreprise.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </Field>
            <Field label="Mot de passe" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
              />
            </Field>
            <Button type="submit" size="lg" className="h-11 w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  Se connecter <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Pas encore de compte ? Demandez un accès à l&apos;administrateur de votre entreprise.
          </p>
        </div>
      </div>
    </div>
  );
}
