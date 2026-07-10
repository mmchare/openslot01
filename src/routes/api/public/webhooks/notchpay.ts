import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  detectCameroonChannel,
  isNotchPaymentFailed,
  isNotchPaymentSuccessful,
  verifyNotchPaySignature,
} from "@/lib/notchpay.server";
import { logPaymentEvent } from "@/lib/payment-events.server";
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
          request.headers.get("notch-signature") ??
          request.headers.get("x-notchpay-signature") ??
          request.headers.get("notchpay-signature");

        // Sécurité: signature obligatoire si NOTCHPAY_HASH est configuré.
        if (process.env.NOTCHPAY_HASH) {
          if (!verifyNotchPaySignature(rawBody, signature)) {
            await logPaymentEvent({
              event_type: "webhook_invalid_signature",
              level: "error",
              message: "Signature Notch Pay invalide",
              metadata: { body_preview: rawBody.slice(0, 500) },
            });
            return new Response("Invalid signature", { status: 401 });
          }
        }

        let payload: {
          event?: string;
          type?: string;
          reference?: string;
          trxref?: string;
          status?: string;
          data?: {
            reference?: string;
            trxref?: string;
            status?: string;
          };
          transaction?: {
            reference?: string;
            trxref?: string;
            status?: string;
          };
          payment?: {
            reference?: string;
            trxref?: string;
            status?: string;
          };
        };
        try {
          payload = JSON.parse(rawBody);
        } catch {
          await logPaymentEvent({
            event_type: "webhook_received",
            level: "error",
            message: "JSON invalide",
            metadata: { body_preview: rawBody.slice(0, 500) },
          });
          return new Response("Invalid JSON", { status: 400 });
        }

        const tx = payload.data ?? payload.transaction ?? payload.payment ?? payload;
        const reference = tx.reference;
        const trxref = tx.trxref;
        const status = tx.status?.toLowerCase();

        await logPaymentEvent({
          notchpay_reference: reference ?? null,
          event_type: "webhook_received",
          message: `event=${payload.event ?? payload.type ?? "?"} status=${status ?? "?"}`,
          metadata: {
            event: payload.event ?? payload.type,
            status,
            reference,
            trxref,
          },
        });

        if (!reference || !status) {
          return new Response("Missing fields", { status: 400 });
        }

        // Récupère la commande liée
        let orderQuery = supabaseAdmin
          .from("orders")
          .select("id, status, application_id, created_at, client_whatsapp")
          .eq("notchpay_reference", reference);

        let { data: order } = await orderQuery.maybeSingle();

        if (!order && trxref && /^[0-9a-f-]{36}$/i.test(trxref)) {
          const { data: byTrxref } = await supabaseAdmin
            .from("orders")
            .select("id, status, application_id, created_at, client_whatsapp")
            .eq("id", trxref)
            .maybeSingle();
          order = byTrxref;
        }

        if (!order) {
          await logPaymentEvent({
            notchpay_reference: reference,
            event_type: "webhook_order_not_found",
            level: "error",
          });
          return new Response("Order not found", { status: 404 });
        }

        // Déjà traitée
        if (order.status === "paye") {
          return new Response("ok", { status: 200 });
        }

        if (status && isNotchPaymentSuccessful(status)) {
          // Attribution atomique du slot
          const { error: allocErr } = await supabaseAdmin.rpc(
            "allocate_slot_for_order",
            { p_order_id: order.id },
          );
          if (allocErr) {
            console.error("[notchpay webhook] allocation error:", allocErr);
            await logPaymentEvent({
              order_id: order.id,
              notchpay_reference: reference,
              event_type: "webhook_allocation_error",
              level: "error",
              message: allocErr.message,
            });
            return new Response("Allocation failed", { status: 500 });
          }

          await logPaymentEvent({
            order_id: order.id,
            notchpay_reference: reference,
            event_type: "webhook_allocation_success",
          });

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
        } else if (status && isNotchPaymentFailed(status)) {
          const createdAt = order.created_at
            ? new Date(order.created_at).getTime()
            : Date.now();
          const ageMs = Date.now() - createdAt;
          const isMtn = detectCameroonChannel(order.client_whatsapp ?? "") === "cm.mtn";

          // MTN peut envoyer un statut d'échec très vite alors que la validation
          // manuelle *126# est encore possible. Ne clôture pas la commande avant
          // la fin de cette fenêtre de validation.
          if (isMtn && ageMs < 5 * 60 * 1000) {
            await logPaymentEvent({
              order_id: order.id,
              notchpay_reference: reference,
              event_type: "notchpay_failed_deferred",
              level: "warn",
              message: `status=${status}`,
              metadata: {
                source: "webhook",
                grace_seconds_remaining: Math.ceil((5 * 60 * 1000 - ageMs) / 1000),
              },
            });
            return new Response("ok", { status: 200 });
          }

          await supabaseAdmin
            .from("orders")
            .update({ status: "echoue" })
            .eq("id", order.id);
          await logPaymentEvent({
            order_id: order.id,
            notchpay_reference: reference,
            event_type: "webhook_payment_failed",
            level: "warn",
            message: `status=${status}`,
          });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
