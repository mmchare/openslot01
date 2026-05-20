import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  MessageCircle,
  XCircle,
} from "lucide-react";
import { getOrderForSuccess } from "@/lib/orders.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/commande/$orderId")({
  head: () => ({
    meta: [
      { title: "Suivi de commande — OpenSlot" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OrderTrackingPage,
});

function OrderTrackingPage() {
  const { orderId } = Route.useParams();
  const fetchOrder = useServerFn(getOrderForSuccess);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["order-tracking", orderId],
    queryFn: () => fetchOrder({ data: { order_id: orderId } }),
    refetchInterval: (q) =>
      q.state.data?.status === "en_attente" ? 4000 : false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <XCircle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-3 font-display text-2xl">Commande introuvable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Vérifie le lien que tu as reçu.
          </p>
          <Link
            to="/"
            className="mt-6 inline-block rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow"
          >
            Retour au catalogue
          </Link>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="text-center">
          <StatusBadge status={data.status} />
          <h1 className="mt-3 font-display text-2xl sm:text-3xl">
            Commande {data.application_name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Réf. <span className="font-mono">{data.order_id.slice(0, 8)}</span> ·{" "}
            {data.amount_paid.toLocaleString("fr-FR")} FCFA
          </p>
        </div>

        {data.status === "en_attente" && (
          <div className="mt-8 rounded-2xl border border-border bg-surface p-6 text-center">
            <Clock className="mx-auto h-8 w-8 text-primary" />
            <h2 className="mt-3 font-display text-lg">
              On attend la confirmation
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cette page se met à jour automatiquement dès que ton paiement est
              confirmé.
            </p>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs hover:border-primary/40 disabled:opacity-50"
            >
              {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
              Vérifier maintenant
            </button>
          </div>
        )}

        {data.status === "echoue" && (
          <div className="mt-8 rounded-2xl border border-destructive/30 bg-surface p-6 text-center">
            <XCircle className="mx-auto h-10 w-10 text-destructive" />
            <h2 className="mt-3 font-display text-lg">Paiement échoué</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Aucun montant n'a été débité. Tu peux retenter une commande.
            </p>
            <Link
              to="/"
              className="mt-4 inline-block rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow"
            >
              Retour au catalogue
            </Link>
          </div>
        )}

        {data.status === "paye" && data.access && (
          <div className="mt-8 rounded-2xl border border-primary/30 bg-gradient-card p-6 shadow-card sm:p-8">
            <h2 className="font-display text-lg">Tes accès</h2>
            <p className="text-sm text-muted-foreground">
              Garde ces informations en lieu sûr.
            </p>
            <div className="mt-4 space-y-3">
              <AccessRow label="Email du compte" value={data.access.email} />
              <AccessRow label="Mot de passe" value={data.access.password} />
              <AccessRow
                label="Profil / Écran à utiliser"
                value={
                  data.access.profile_name
                    ? `Écran ${data.access.slot_number} — ${data.access.profile_name}`
                    : `Écran ${data.access.slot_number}`
                }
              />
            </div>
            <WhatsAppButton
              name={data.client_name}
              phone={data.client_whatsapp}
              appName={data.application_name}
              email={data.access.email}
              password={data.access.password}
              slot={data.access.slot_number}
              profile={data.access.profile_name}
            />
          </div>
        )}

        {data.status === "paye" && !data.access && (
          <div className="mt-8 rounded-2xl border border-border bg-surface p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <h2 className="mt-3 font-display text-lg">Paiement confirmé</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tes accès seront attribués sous quelques instants.
            </p>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link to="/" className="text-sm text-primary underline">
            ← Retour au catalogue
          </Link>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function StatusBadge({ status }: { status: "en_attente" | "paye" | "echoue" }) {
  const map = {
    en_attente: {
      label: "En attente",
      cls: "bg-primary/15 text-primary",
      Icon: Clock,
    },
    paye: {
      label: "Payée",
      cls: "bg-emerald-500/15 text-emerald-400",
      Icon: CheckCircle2,
    },
    echoue: {
      label: "Échouée",
      cls: "bg-destructive/15 text-destructive",
      Icon: XCircle,
    },
  } as const;
  const { label, cls, Icon } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
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
        <div className="truncate font-mono text-sm text-foreground">
          {value}
        </div>
      </div>
      <button
        onClick={copy}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs hover:border-primary/40"
      >
        <Copy className="h-3 w-3" />
        {copied ? "Copié" : "Copier"}
      </button>
    </div>
  );
}

function WhatsAppButton({
  name,
  phone,
  appName,
  email,
  password,
  slot,
  profile,
}: {
  name: string;
  phone: string;
  appName: string;
  email: string;
  password: string;
  slot: number;
  profile: string | null;
}) {
  const text = encodeURIComponent(
    `Bonjour ${name}, voici vos accès OpenSlot pour ${appName} : Email: ${email} | Pass: ${password} | Profil: Écran ${slot}${profile ? ` (${profile})` : ""}.`,
  );
  const waPhone = phone.replace(/[^0-9]/g, "");
  return (
    <a
      href={`https://wa.me/${waPhone}?text=${text}`}
      target="_blank"
      rel="noreferrer"
      className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-90"
    >
      <MessageCircle className="h-4 w-4" /> Recevoir mes accès sur WhatsApp
    </a>
  );
}
