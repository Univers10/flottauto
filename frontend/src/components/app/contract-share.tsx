"use client";

import { useState } from "react";
import { Copy, Link2Off, Mail, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/app/primitives";
import { revokeContractLink, shareContract } from "@/lib/api";
import type { Convoy } from "@/types";

/** Numéro ivoirien pour WhatsApp : 07 07 12 34 56 → 2250707123456. */
function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.length === 10) return `225${digits}`;
  return digits;
}

/**
 * Envoi du contrat au client : un lien secret, en lecture seule, ouvert par WhatsApp ou par mail
 * depuis le téléphone ou l'ordinateur de l'agent. Rien à configurer, aucun mail envoyé par le serveur.
 */
export function ContractShare({ convoy, onChange, canRevoke }: { convoy: Convoy; onChange: (c: Convoy) => void; canRevoke: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(convoy.client_phone ?? "");
  const [email, setEmail] = useState("");

  const link = convoy.share_token && typeof window !== "undefined" ? `${window.location.origin}/contrat/${convoy.share_token}` : null;
  const message = link
    ? `Bonjour${convoy.client_name ? ` ${convoy.client_name}` : ""},\n\nVoici votre contrat de transport N° ${convoy.number} (${convoy.title}).\nVous pouvez le lire, l'imprimer ou l'enregistrer en PDF :\n${link}\n\nMerci de votre confiance.`
    : "";

  async function start() {
    setOpen(true);
    if (convoy.share_token) return;
    setBusy(true);
    try {
      onChange(await shareContract(convoy.id));
    } catch (err) {
      toast.error((err as Error).message || "Lien impossible");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      onChange(await revokeContractLink(convoy.id));
      toast.success("Lien désactivé : l'ancien lien ne marche plus");
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message || "Action impossible");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Lien copié");
    } catch {
      toast.error("Copie impossible : sélectionnez le lien à la main");
    }
  }

  const wa = link ? `https://wa.me/${phone.trim() ? waNumber(phone) : ""}?text=${encodeURIComponent(message)}` : "#";
  const mail = link
    ? `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(`Contrat de transport N° ${convoy.number}`)}&body=${encodeURIComponent(message)}`
    : "#";

  return (
    <>
      <Button variant="outline" onClick={start}>
        <Send className="size-4" />
        Envoyer le contrat
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Envoyer le contrat au client</DialogTitle>
            <DialogDescription>
              Le client reçoit un lien vers son contrat : il peut le lire, l&apos;imprimer ou l&apos;enregistrer en PDF. Il ne voit ni les charges ni la
              marge.
            </DialogDescription>
          </DialogHeader>
          {busy && !link ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Préparation du lien…</p>
          ) : (
            <div className="space-y-4">
              <Field label="Lien du contrat" htmlFor="contract-link">
                <div className="flex gap-2">
                  <Input id="contract-link" readOnly value={link ?? ""} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={copy} aria-label="Copier le lien">
                    <Copy className="size-4" />
                  </Button>
                </div>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Field label="WhatsApp du client" htmlFor="wa-phone">
                    <Input id="wa-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07 07 12 34 56" />
                  </Field>
                  <a
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#25D366] px-4 text-sm font-semibold text-white hover:brightness-95"
                  >
                    <MessageCircle className="size-4" />
                    Envoyer par WhatsApp
                  </a>
                </div>
                <div className="space-y-2">
                  <Field label="Mail du client" htmlFor="mail-to">
                    <Input id="mail-to" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@exemple.com" />
                  </Field>
                  <a
                    href={mail}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border bg-background px-4 text-sm font-semibold hover:bg-muted"
                  >
                    <Mail className="size-4" />
                    Envoyer par mail
                  </a>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            {canRevoke && link ? (
              <Button variant="ghost" onClick={revoke} disabled={busy} className="text-muted-foreground">
                <Link2Off className="size-4" />
                Désactiver ce lien
              </Button>
            ) : (
              <span />
            )}
            <Button variant="outline" onClick={() => setOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
