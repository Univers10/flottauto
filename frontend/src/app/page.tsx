"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { login, setToken } from "@/lib/api";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@flottauto.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(email, password);
      setToken(data.access_token);
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-blue-50" />
      <div className="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-blue-300/20 blur-3xl" />

      <Card className="relative z-10 w-full max-w-md rounded-3xl border-none bg-card/90 p-2 shadow-2xl shadow-primary/10 backdrop-blur-xl">
        <CardHeader className="space-y-5 pb-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-blue-600 shadow-lg shadow-primary/25">
            <ShieldCheck className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold tracking-tight">FlottAuto</CardTitle>
            <CardDescription className="mt-2 text-sm text-muted-foreground">
              Connectez-vous à votre espace flotte
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 rounded-xl border-border/60 bg-muted/50 px-4 focus-visible:bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 rounded-xl border-border/60 bg-muted/50 px-4 focus-visible:bg-background"
              />
            </div>
            <Button
              type="submit"
              className="h-12 w-full gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-600 text-base font-semibold shadow-lg shadow-primary/25"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Se connecter <ArrowRight className="h-5 w-5" />
                </>
              )}
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Démo : admin@flottauto.com / admin123
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
