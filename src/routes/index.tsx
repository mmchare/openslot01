import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Zap, ShieldCheck, Smartphone, Clock } from "lucide-react";
import { getCatalog } from "@/lib/catalog.functions";
import { AppIcon } from "@/components/AppIcon";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OpenSlot — Accès premium livrés en 60 secondes" },
      {
        name: "description",
        content:
          "Achetez Netflix, Spotify, Canva, ChatGPT Plus et plus, payés en Mobile Money. Livraison automatique en moins d'une minute en Afrique centrale.",
      },
      { property: "og:title", content: "OpenSlot — Accès premium en 60s" },
      {
        property: "og:description",
        content:
          "Slots partagés vers les meilleures apps. Paiement MTN MoMo & Orange Money. Livraison instantanée.",
      },
    ],
  }),
  loader: () => getCatalog(),
  component: HomePage,
});

function HomePage() {
  const initial = Route.useLoaderData();
  const { data: items } = useSuspenseQuery({
    queryKey: ["catalog"],
    queryFn: () => getCatalog(),
    initialData: initial,
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-12 sm:px-6 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Livraison automatique sous 60 secondes
          </div>
          <h1 className="mt-6 text-balance font-display text-4xl font-bold tracking-tight sm:text-6xl">
            Tes apps premium,
            <br />
            <span className="text-gradient">payées en Mobile Money.</span>
          </h1>
          <p className="mt-5 text-pretty text-base text-muted-foreground sm:text-lg">
            Netflix, Spotify, Canva, ChatGPT Plus, Microsoft 365… Achète un
            slot, paie via MTN MoMo ou Orange Money, et reçois tes accès
            instantanément sur WhatsApp.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <a
              href="#catalogue"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-90"
            >
              Voir le catalogue <Zap className="h-4 w-4" />
            </a>
            <a
              href="#how"
              className="rounded-full border border-border bg-surface px-5 py-3 text-sm font-medium text-foreground/90 hover:border-primary/40 transition"
            >
              Comment ça marche
            </a>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-3 text-xs text-muted-foreground sm:gap-6 sm:text-sm">
            <Feature icon={<Clock className="h-4 w-4" />} label="< 60 sec" />
            <Feature icon={<Smartphone className="h-4 w-4" />} label="Mobile Money" />
            <Feature icon={<ShieldCheck className="h-4 w-4" />} label="Zéro surbooking" />
          </div>
        </div>
      </section>

      {/* Catalogue */}
      <section id="catalogue" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">
              Catalogue
            </h2>
            <p className="text-sm text-muted-foreground">
              {items.length} services disponibles · prix en FCFA
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ProductCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      {/* How */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">
          Comment ça marche
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { n: "1", t: "Choisis ton app", d: "Sélectionne un service dans le catalogue." },
            { n: "2", t: "Paie en Mobile Money", d: "MTN MoMo ou Orange Money via Notch Pay." },
            { n: "3", t: "Reçois tes accès", d: "Email + mot de passe + n° d'écran, sur la page et sur WhatsApp." },
          ].map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-border bg-gradient-card p-5 shadow-card"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary font-display text-sm font-bold text-primary-foreground">
                {s.n}
              </div>
              <h3 className="mt-4 font-display text-lg">{s.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-surface/60 px-3 py-2">
      <span className="text-primary">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function ProductCard({
  item,
}: {
  item: {
    id: string;
    name: string;
    category: string;
    description: string | null;
    price_fcfa: number;
    image_url: string | null;
    stock_disponible: number;
  };
}) {
  const inStock = item.stock_disponible > 0;
  return (
    <div className="group flex flex-col rounded-2xl border border-border bg-gradient-card p-5 shadow-card transition hover:border-primary/40">
      <div className="flex items-start gap-4">
        <AppIcon slug={item.image_url} size="lg" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg leading-none">{item.name}</h3>
          </div>
          <span className="mt-1 inline-block rounded-full bg-surface px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {item.category}
          </span>
        </div>
      </div>
      {item.description && (
        <p className="mt-4 text-sm text-muted-foreground line-clamp-2">
          {item.description}
        </p>
      )}
      <div className="mt-5 flex items-end justify-between">
        <div>
          <div className="font-display text-2xl font-semibold">
            {item.price_fcfa.toLocaleString("fr-FR")}{" "}
            <span className="text-xs font-normal text-muted-foreground">FCFA</span>
          </div>
          <div className={`mt-1 text-xs ${inStock ? "text-primary" : "text-destructive"}`}>
            {inStock ? `${item.stock_disponible} en stock` : "Rupture de stock"}
          </div>
        </div>
        {inStock ? (
          <Link
            to="/commander/$appId"
            params={{ appId: item.id }}
            className="rounded-full bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-90"
          >
            Commander
          </Link>
        ) : (
          <button
            disabled
            className="cursor-not-allowed rounded-full bg-muted px-4 py-2 text-sm font-medium text-muted-foreground"
          >
            Indisponible
          </button>
        )}
      </div>
    </div>
  );
}
