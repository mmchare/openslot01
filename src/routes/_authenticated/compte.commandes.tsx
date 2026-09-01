import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Package } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getUserOrders, type UserOrder } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/compte/commandes")({
  head: () => ({
    meta: [
      { title: "Mes commandes — OpenSlot" },
      { name: "description", content: "Historique de tes commandes OpenSlot." },
    ],
  }),
  loader: () => getUserOrders(),
  component: OrdersPage,
});

function OrdersPage() {
  const initial = Route.useLoaderData();
  const { data: orders } = useSuspenseQuery({
    queryKey: ["user-orders"],
    queryFn: () => getUserOrders(),
    initialData: initial,
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Link
          to="/compte"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Retour au compte
        </Link>

        <h1 className="mt-6 font-display text-2xl font-semibold">Mes commandes</h1>
        <p className="text-sm text-muted-foreground">
          Retrouve toutes tes commandes et leur statut.
        </p>

        {orders.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-border bg-gradient-card p-10 text-center shadow-card">
            <Package className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">Tu n'as pas encore passé de commande.</p>
            <Link
              to="/"
              className="mt-4 inline-block rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-90"
            >
              Découvrir le catalogue
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}

function OrderCard({ order }: { order: UserOrder }) {
  const statusLabel: Record<string, string> = {
    en_attente: "En attente",
    paye: "Payée",
    echoue: "Échouée",
  };
  const statusClass = {
    en_attente: "bg-amber-400/10 text-amber-200 border-amber-400/30",
    paye: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30",
    echoue: "bg-destructive/10 text-destructive-foreground border-destructive/30",
  }[order.status];

  return (
    <Link
      to="/commande/$orderId"
      params={{ orderId: order.id }}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-gradient-card p-4 shadow-card transition hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <div className="flex items-center gap-2">
          <span className="font-display font-medium">{order.application_name}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
            {statusLabel[order.status]}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date(order.created_at).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
      <div className="text-right">
        <div className="font-display font-semibold text-primary">
          {order.amount_paid.toLocaleString("fr-FR")} FCFA
        </div>
        <div className="text-xs text-muted-foreground">
          {order.product_type === "apk" ? "APK" : "Compte streaming"}
        </div>
      </div>
    </Link>
  );
}
