import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, RefreshCw, Search } from "lucide-react";
import {
  adminGetPaymentEvents,
  adminListRecentPaymentOrders,
  verifyAdminPassword,
} from "@/lib/admin.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

const PWD_KEY = "openslot_admin_pwd";

export const Route = createFileRoute("/admin/diagnostic")({
  head: () => ({
    meta: [
      { title: "Diagnostic paiements — OpenSlot" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DiagnosticPage,
});

function DiagnosticPage() {
  const [password, setPassword] = useState<string | null>(null);
  const [pwdInput, setPwdInput] = useState("");
  const [pwdErr, setPwdErr] = useState<string | null>(null);
  const verify = useServerFn(verifyAdminPassword);

  useEffect(() => {
    const stored = sessionStorage.getItem(PWD_KEY);
    if (stored) setPassword(stored);
  }, []);

  if (!password) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-md px-4 py-16">
          <h1 className="font-display text-2xl">Diagnostic paiements</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Saisis le mot de passe admin.
          </p>
          <form
            className="mt-6 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setPwdErr(null);
              try {
                await verify({ data: { password: pwdInput } });
                sessionStorage.setItem(PWD_KEY, pwdInput);
                setPassword(pwdInput);
              } catch {
                setPwdErr("Mot de passe invalide");
              }
            }}
          >
            <input
              type="password"
              value={pwdInput}
              onChange={(e) => setPwdInput(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="Mot de passe"
              autoFocus
            />
            {pwdErr && (
              <div className="text-sm text-destructive">{pwdErr}</div>
            )}
            <button
              type="submit"
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Entrer
            </button>
          </form>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Dashboard password={password} />
      <SiteFooter />
    </div>
  );
}

function Dashboard({ password }: { password: string }) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const listFn = useServerFn(adminListRecentPaymentOrders);
  const recent = useQuery({
    queryKey: ["admin", "recent-payments"],
    queryFn: () => listFn({ data: { password } }),
    refetchInterval: 15_000,
  });

  const getEventsFn = useServerFn(adminGetPaymentEvents);
  const lookup = useMutation({
    mutationFn: (q: string) =>
      getEventsFn({ data: { password, query: q } }),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <Link
          to="/admin"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Admin
        </Link>
        <button
          onClick={() => recent.refetch()}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" /> Rafraîchir
        </button>
      </div>

      <h1 className="mt-4 font-display text-2xl font-semibold sm:text-3xl">
        Diagnostic paiements
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Recherche par ID de commande (UUID complet, 8 premiers caractères) ou
        référence Notch Pay. Auto-rafraîchissement des commandes des 24 dernières
        heures toutes les 15s.
      </p>

      <form
        className="mt-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const q = query.trim();
          if (q.length < 3) return;
          setSubmitted(q);
          lookup.mutate(q);
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ID commande, préfixe UUID, ou référence Notch Pay"
            className="w-full rounded-lg border border-border bg-input px-9 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <button
          type="submit"
          disabled={lookup.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {lookup.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Chercher"
          )}
        </button>
      </form>

      {submitted && (
        <div className="mt-6">
          {lookup.isPending && (
            <div className="text-sm text-muted-foreground">Chargement…</div>
          )}
          {lookup.data && (
            <LookupResult data={lookup.data} onSelect={setSubmitted} />
          )}
          {lookup.error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
              {(lookup.error as Error).message}
            </div>
          )}
        </div>
      )}

      <div className="mt-10">
        <h2 className="font-display text-lg font-semibold">
          Commandes récentes (24h)
        </h2>
        {recent.isLoading ? (
          <div className="mt-3 text-sm text-muted-foreground">Chargement…</div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Statut</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Produit</th>
                  <th className="px-3 py-2 text-right">Montant</th>
                  <th className="px-3 py-2 text-left">ID</th>
                </tr>
              </thead>
              <tbody>
                {(recent.data ?? []).map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer border-t border-border hover:bg-muted/20"
                    onClick={() => {
                      setQuery(o.id);
                      setSubmitted(o.id);
                      lookup.mutate(o.id);
                    }}
                  >
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("fr-FR")}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-3 py-2">
                      {o.client_name}
                      <div className="text-xs text-muted-foreground">
                        {o.client_whatsapp}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">{o.application_name}</td>
                    <td className="px-3 py-2 text-right">
                      {o.amount_paid.toLocaleString("fr-FR")} F
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {o.id.slice(0, 8)}
                    </td>
                  </tr>
                ))}
                {(recent.data ?? []).length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-6 text-center text-xs text-muted-foreground"
                    >
                      Aucune commande récente.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    en_attente: {
      label: "En attente",
      cls: "bg-yellow-500/20 text-yellow-200 border-yellow-500/40",
    },
    paye: {
      label: "Payé",
      cls: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
    },
    echoue: {
      label: "Échoué",
      cls: "bg-red-500/20 text-red-200 border-red-500/40",
    },
  };
  const m = map[status] ?? {
    label: status,
    cls: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

type EventRow = {
  id: string;
  order_id: string | null;
  notchpay_reference: string | null;
  event_type: string;
  level: string;
  message: string | null;
  metadata: unknown;
  created_at: string;
};

function LookupResult({
  data,
  onSelect: _onSelect,
}: {
  data: {
    order: {
      id: string;
      status: string;
      client_name: string;
      client_whatsapp: string;
      client_email: string;
      amount_paid: number;
      notchpay_reference: string | null;
      created_at: string;
    } | null;
    events: EventRow[];
  };
  onSelect: (q: string) => void;
}) {
  const summary = useMemo(() => {
    const types = new Set(data.events.map((e) => e.event_type));
    const hasInit = types.has("notchpay_init_success") || types.has("notchpay_dev_mode");
    const hasInitErr = types.has("notchpay_init_error");
    const hasRedirect = types.has("redirect_to_gateway");
    const hasWebhook = types.has("webhook_received");
    const hasAlloc = types.has("webhook_allocation_success") || types.has("dev_simulate_success");
    const hasFail = types.has("webhook_payment_failed") || types.has("webhook_allocation_error");
    return { hasInit, hasInitErr, hasRedirect, hasWebhook, hasAlloc, hasFail };
  }, [data.events]);

  return (
    <div className="space-y-6">
      {data.order ? (
        <div className="rounded-xl border border-border bg-gradient-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-display text-lg">
                Commande {data.order.id.slice(0, 8)}…
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(data.order.created_at).toLocaleString("fr-FR")}
              </div>
            </div>
            <StatusBadge status={data.order.status} />
          </div>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Client : </span>
              {data.order.client_name}
            </div>
            <div>
              <span className="text-muted-foreground">WhatsApp : </span>
              {data.order.client_whatsapp}
            </div>
            <div>
              <span className="text-muted-foreground">Email : </span>
              {data.order.client_email}
            </div>
            <div>
              <span className="text-muted-foreground">Montant : </span>
              {data.order.amount_paid.toLocaleString("fr-FR")} FCFA
            </div>
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">Réf. Notch Pay : </span>
              <span className="font-mono text-xs">
                {data.order.notchpay_reference ?? "—"}
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Step ok={summary.hasInit} label="Initialisation" />
            <Step
              ok={summary.hasRedirect}
              warn={summary.hasInitErr}
              label="Redirection passerelle"
            />
            <Step ok={summary.hasWebhook} label="Webhook reçu" />
            <Step
              ok={summary.hasAlloc}
              warn={summary.hasFail}
              label="Attribution / Paiement"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm">
          Commande non trouvée pour cette recherche. Les événements ci-dessous
          (si présents) correspondent à la référence Notch Pay.
        </div>
      )}

      <div className="rounded-xl border border-border">
        <div className="border-b border-border bg-muted/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Événements ({data.events.length})
        </div>
        {data.events.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            Aucun événement enregistré.
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {data.events.map((ev) => (
              <li key={ev.id} className="px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span
                      className={
                        ev.level === "error"
                          ? "font-mono text-xs text-red-400"
                          : ev.level === "warn"
                            ? "font-mono text-xs text-yellow-400"
                            : "font-mono text-xs text-emerald-400"
                      }
                    >
                      {ev.event_type}
                    </span>
                    {ev.message && (
                      <div className="mt-0.5 text-sm">{ev.message}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {new Date(ev.created_at).toLocaleTimeString("fr-FR")}
                  </div>
                </div>
                {ev.metadata != null && (
                  <pre className="mt-2 overflow-x-auto rounded bg-muted/30 p-2 text-xs text-muted-foreground">
                    {JSON.stringify(ev.metadata, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Step({
  ok,
  warn,
  label,
}: {
  ok: boolean;
  warn?: boolean;
  label: string;
}) {
  const cls = ok
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
    : warn
      ? "border-red-500/40 bg-red-500/10 text-red-200"
      : "border-border bg-muted/20 text-muted-foreground";
  const icon = ok ? "✓" : warn ? "✕" : "○";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${cls}`}>
      <span>{icon}</span>
      {label}
    </span>
  );
}
