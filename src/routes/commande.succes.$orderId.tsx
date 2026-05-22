import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Loader2,
  MessageCircle,
  XCircle,
} from "lucide-react";
import { z } from "zod";
import { getOrderForSuccess, simulateDevPayment } from "@/lib/orders.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/commande/succes/$orderId")({
  validateSearch: z.object({
    dev: z.union([z.literal(1), z.literal("1")]).optional(),
  }),
  head: () => ({
    meta: [{ title: "Commande confirmée — OpenSlot" }],
  }),
  component: SuccessPage,
});

function SuccessPage() {
  const { orderId } = Route.useParams();
  const { dev } = Route.useSearch();
  const simulate = useServerFn(simulateDevPayment);
  const fetchOrder = useServerFn(getOrderForSuccess);
  const [devTriggered, setDevTriggered] = useState(false);

  // Mode DEV: déclenche la simulation paiement une fois.
  useEffect(() => {
    if (dev && !devTriggered) {
      setDevTriggered(true);
      simulate({ data: { order_id: orderId } }).catch((err) => {
        console.error("dev pay:", err);
      });
    }
  }, [dev, devTriggered, orderId, simulate]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["order", orderId, devTriggered],
    queryFn: () => fetchOrder({ data: { order_id: orderId } }),
    refetchInterval: (q) => (q.state.data?.status === "paye" ? false : 2500),
  });

  if (isLoading || !data) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">Chargement…</p>
        </div>
      </div>
    );
  }

  if (data.status === "echoue") {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <XCircle className="mx-auto h-12 w-12 text-destructive" />
          <h1 className="mt-4 font-display text-2xl">Paiement échoué</h1>
          <p className="mt-2 text-muted-foreground">
            Ta commande n'a pas pu être finalisée. Aucun montant n'a été débité.
          </p>
          <Link
            to="/"
            className="mt-6 inline-block rounded-full bg-gradient-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow"
          >
            Retour au catalogue
          </Link>
        </div>
      </div>
    );
  }

  if (data.status !== "paye" || !data.access) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <h1 className="mt-4 font-display text-2xl">Confirmation en cours…</h1>
          <p className="mt-2 text-muted-foreground">
            On attend la confirmation de ton paiement. Cette page se met à jour
            automatiquement.
          </p>
          <button
            onClick={() => refetch()}
            className="mt-4 text-sm text-primary underline"
          >
            Vérifier maintenant
          </button>
        </div>
      </div>
    );
  }

  // Succès — affiche les accès
  const a = data.access;
  const waText = encodeURIComponent(
    `Bonjour ${data.client_name}, voici vos accès OpenSlot pour ${data.application_name} : Email: ${a.email} | Pass: ${a.password} | Profil: Écran ${a.slot_number}${a.profile_name ? ` (${a.profile_name})` : ""}${a.profile_password ? ` | Code profil: ${a.profile_password}` : ""}. Merci pour votre confiance !`,
  );
  const waPhone = data.client_whatsapp.replace(/[^0-9]/g, "");
  const waLink = `https://wa.me/${waPhone}?text=${waText}`;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-4 font-display text-3xl font-semibold sm:text-4xl">
            Merci, {data.client_name.split(" ")[0]} !
          </h1>
          <p className="mt-2 text-muted-foreground">
            Ta commande <span className="text-foreground">{data.application_name}</span> est confirmée.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-primary/30 bg-gradient-card p-6 shadow-card sm:p-8">
          <h2 className="font-display text-lg">Tes accès</h2>
          <p className="text-sm text-muted-foreground">
            Garde ces informations en lieu sûr.
          </p>

          <div className="mt-4 space-y-3">
            <AccessRow label="Email du compte" value={a.email} />
            <AccessRow label="Mot de passe" value={a.password} />
            <AccessRow
              label="Profil / Écran à utiliser"
              value={
                a.profile_name
                  ? `Écran ${a.slot_number} — ${a.profile_name}`
                  : `Écran ${a.slot_number}`
              }
            />
          </div>

          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-90"
          >
            <MessageCircle className="h-4 w-4" /> Recevoir mes accès sur WhatsApp
          </a>
        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          Un problème ? Écris-nous sur WhatsApp, on te répond rapidement.
        </div>

        <div className="mt-6 text-center">
          <Link to="/" className="text-sm text-primary underline">
            ← Retour au catalogue
          </Link>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function AccessRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="truncate font-mono text-sm text-foreground">{value}</div>
      </div>
      <button
        onClick={copy}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground/90 hover:border-primary/40 transition"
      >
        <Copy className="h-3 w-3" />
        {copied ? "Copié" : "Copier"}
      </button>
    </div>
  );
}
