import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyNotchPaySignature } from "@/lib/notchpay.server";
import {
  sendTelegramAlert,
  buildStockAlertMessage,
} from "@/lib/telegram.server";

// Notch Pay envoie un POST vers cette URL après chaque transaction.
// Configurer dans le dashboard Notch Pay:
//   https://<domaine>/api/public/webhooks/notchpay
// La signature HMAC-SHA256 du body brut est dans l'entête x-notch-signature.

export const Route = createFileRoute("/api/public/webhooks/notchpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const signature =
          request.headers.get("x-notch-signature") ??
          request.headers.get("notch-signature");

        // Sécurité: signature obligatoire si NOTCHPAY_HASH est configuré.
        if (process.env.NOTCHPAY_HASH) {
          if (!verifyNotchPaySignature(rawBody, signature)) {
            return new Response("Invalid signature", { status: 401 });
          }
        }

        let payload: {
          event?: string;
          data?: {
            reference?: string;
            status?: string;
          };
        };
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const reference = payload.data?.reference;
        const status = payload.data?.status;

        if (!reference || !status) {
          return new Response("Missing fields", { status: 400 });
        }

        // Récupère la commande liée
        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("id, status, application_id")
          .eq("notchpay_reference", reference)
          .maybeSingle();

        if (!order) {
          return new Response("Order not found", { status: 404 });
        }

        // Déjà traitée
        if (order.status === "paye") {
          return new Response("ok", { status: 200 });
        }

        if (status === "complete" || status === "accepted") {
          // Attribution atomique du slot
          const { error: allocErr } = await supabaseAdmin.rpc(
            "allocate_slot_for_order",
            { p_order_id: order.id },
          );
          if (allocErr) {
            console.error("[notchpay webhook] allocation error:", allocErr);
            return new Response("Allocation failed", { status: 500 });
          }

          // Vérifie le stock restant pour alerte
          const { count } = await supabaseAdmin
            .from("slots_stock")
            .select("id", { count: "exact", head: true })
            .eq("application_id", order.application_id)
            .eq("status", "disponible");

          if (count === 0) {
            const { data: app } = await supabaseAdmin
              .from("applications")
              .select("name")
              .eq("id", order.application_id)
              .maybeSingle();
            await sendTelegramAlert(
              buildStockAlertMessage(app?.name ?? "Produit"),
            );
          }
        } else if (status === "failed" || status === "canceled") {
          await supabaseAdmin
            .from("orders")
            .update({ status: "echoue" })
            .eq("id", order.id);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
