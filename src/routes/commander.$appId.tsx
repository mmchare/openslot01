import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { getApplicationById } from "@/lib/catalog.functions";
import { createOrder } from "@/lib/orders.functions";
import { AppIcon } from "@/components/AppIcon";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/commander/$appId")({
  head: () => ({
    meta: [
      { title: "Commander — OpenSlot" },
      { name: "description", content: "Finalise ta commande OpenSlot et paie en Mobile Money." },
    ],
  }),
  loader: ({ params }) => getApplicationById({ data: { id: params.appId } }),
  component: OrderPage,
  notFoundComponent: () => (
    <div className="p-10 text-center">Produit introuvable.</div>
  ),
});

function OrderPage() {
  const app = Route.useLoaderData();
  const { appId } = Route.useParams();
  const navigate = useNavigate();
  const createOrderFn = useServerFn(createOrder);

  // Re-fetch the catalog item to get fresh stock
  const { data: fresh } = useSuspenseQuery({
    queryKey: ["app", appId],
    queryFn: () => getApplicationById({ data: { id: appId } }),
    initialData: app,
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("+237");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!fresh) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h1 className="font-display text-2xl">Produit introuvable</h1>
          <Link to="/" className="mt-4 inline-block text-primary underline">
            Retour au catalogue
          </Link>
        </div>
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const cleanedPhone = phone.trim().replace(/\s+/g, "");

    if (trimmedName.length < 2) {
      setError("Merci d'entrer ton nom complet (au moins 2 caractères).");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Merci d'entrer une adresse email valide.");
      return;
    }
    if (!/^\+?[0-9]{8,20}$/.test(cleanedPhone)) {
      setError("Numéro WhatsApp invalide. Format attendu : +237 6xx xxx xxx");
      return;
    }

    setLoading(true);
    try {
      const res = await createOrderFn({
        data: {
          application_id: fresh.id,
          client_name: trimmedName,
          client_email: trimmedEmail,
          client_whatsapp: cleanedPhone,
          origin: window.location.origin,
        },
      });
      if (res.dev_mode) {
        // Pas de clé Notch Pay → redirection directe (paiement simulé sur la page de succès)
        navigate({
          to: "/commande/succes/$orderId",
          params: { orderId: res.order_id },
          search: { dev: 1 },
        });
      } else {
        // Redirection vers la page hébergée Notch Pay (MoMo / Orange Money)
        window.location.href = res.authorization_url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          {/* Form */}
          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-border bg-gradient-card p-6 shadow-card sm:p-8"
          >
            <h1 className="font-display text-2xl font-semibold sm:text-3xl">
              Finalise ta commande
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {fresh.product_type === "apk"
                ? "Le lien de téléchargement APK apparaîtra dès paiement confirmé."
                : "On t'envoie tes accès sur WhatsApp dès paiement confirmé."}
            </p>

            <div className="mt-6 space-y-4">
              <Field label="Nom complet" htmlFor="name">
                <input
                  id="name"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Aïcha N."
                  className="input"
                />
              </Field>

              <Field label="Adresse email" htmlFor="email">
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="toi@email.com"
                  className="input"
                />
              </Field>

              <Field
                label="Numéro WhatsApp"
                htmlFor="phone"
                hint="Avec indicatif pays. Ex: +237 6xx xxx xxx"
              >
                <input
                  id="phone"
                  required
                  pattern="^\+?[0-9\s]{8,20}$"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+237 6xx xxx xxx"
                  className="input"
                />
              </Field>
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-90 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Redirection…
                </>
              ) : (
                <>Procéder au paiement · {fresh.price_fcfa.toLocaleString("fr-FR")} FCFA</>
              )}
            </button>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" /> Paiement sécurisé Notch Pay · MTN MoMo & Orange Money
            </div>
          </form>

          {/* Summary */}
          <aside className="h-fit rounded-2xl border border-border bg-gradient-card p-6 shadow-card">
            <div className="flex items-center gap-3">
              <AppIcon slug={fresh.image_url} size="lg" />
              <div>
                <div className="font-display text-lg">{fresh.name}</div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {fresh.category}
                </div>
              </div>
            </div>
            {fresh.description && (
              <p className="mt-4 text-sm text-muted-foreground">
                {fresh.description}
              </p>
            )}
            <div className="mt-6 border-t border-border pt-4">
              <Row label="Prix" value={`${fresh.price_fcfa.toLocaleString("fr-FR")} FCFA`} />
              <Row label="Livraison" value="Instantanée" />
              {fresh.product_type === "apk" ? (
                <Row
                  label="Format"
                  value={`APK${fresh.apk_version ? ` v${fresh.apk_version}` : ""}${fresh.apk_size_bytes ? ` · ${formatMB(fresh.apk_size_bytes)}` : ""}`}
                />
              ) : (
                <Row label="Stock dispo" value={`${fresh.stock_disponible} slot(s)`} />
              )}
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-display text-2xl font-semibold text-primary">
                  {fresh.price_fcfa.toLocaleString("fr-FR")} FCFA
                </span>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      <style>{`
        .input {
          width: 100%;
          background: var(--input);
          border: 1px solid var(--border);
          color: var(--foreground);
          border-radius: 0.625rem;
          padding: 0.65rem 0.85rem;
          font-size: 0.9rem;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 25%, transparent);
        }
        .input::placeholder { color: var(--muted-foreground); }
      `}</style>
    </div>
  );
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
