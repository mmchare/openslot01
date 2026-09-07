import { createFileRoute } from "@tanstack/react-router";
import {
  isSasPayFailed,
  isSasPaySuccessful,
  verifySasPaySignature,
} from "@/lib/saspay.server";
import { getMtnManualApprovalState } from "@/lib/order-payment-sync.server";
import { logPaymentEvent } from "@/lib/payment-events.server";
import {
  srvFindOrderByReference,
  srvMarkOrderPaid,
  srvSetOrderStatus,
} from "@/lib/server-db.server";
import {
  sendTelegramAlert,
  buildStockAlertMessage,
} from "@/lib/telegram.server";

// SasPay envoie un POST ici à chaque changement de statut.
// À configurer dans le tableau de bord SasPay :
//   https://<domaine>/api/public/webhooks/saspay
// Signature : HMAC-SHA256 hex de `${X-Webhook-Timestamp}.${body brut}`.

export const Route = createFileRoute("/api/public/webhooks/saspay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const signature = request.headers.get("x-webhook-signature");
        const timestamp = request.headers.get("x-webhook-timestamp");

        if (process.env["SASPAY_WEBHOOK_SECRET"]) {
          if (!verifySasPaySignature(rawBody, signature, timestamp)) {
            await logPaymentEvent({
              event_type: "webhook_invalid_signature",
              level: "error",
              message: "Signature SasPay invalide",
              metadata: { body_preview: rawBody.slice(0, 500) },
            });
            return new Response("Invalid signature", { status: 401 });
          }
        }

        let payload: {
          event?: string;
          data?: {
            id?: string;
            reference?: string;
            status?: string;
            type?: string;
            metadata?: { order_id?: string } | null;
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

        const tx = payload.data ?? {};
        const paymentId = tx.id ?? null;
        const reference = tx.reference ?? null;
        const status = tx.status?.toLowerCase();

        await logPaymentEvent({
          notchpay_reference: paymentId,
          event_type: "webhook_received",
          message: `event=${payload.event ?? "?"} status=${status ?? "?"}`,
          metadata: {
            event: payload.event,
            status,
            payment_id: paymentId,
            reference,
          },
        });

        if (payload.event === "webhook.test") {
          return new Response("ok", { status: 200 });
        }

        if (!paymentId || !status) {
          return new Response("Missing fields", { status: 400 });
        }

        // Un paiement lancé depuis la page hébergée porte un identifiant de
        // transaction différent de la référence stockée : on retombe alors
        // sur l'identifiant de commande présent dans les métadonnées.
        const order =
          (await srvFindOrderByReference(paymentId, reference)) ??
          (tx.metadata?.order_id
            ? await srvGetOrder(tx.metadata.order_id)
            : null);

        if (!order) {
          await logPaymentEvent({
            notchpay_reference: paymentId,
            event_type: "webhook_order_not_found",
            level: "error",
          });
          return new Response("Order not found", { status: 404 });
        }

        // Déjà traitée (le webhook peut être rejoué)
        if (order.status === "paye") {
          return new Response("ok", { status: 200 });
        }

        if (isSasPaySuccessful(status)) {
          let result: { application_name: string | null; remaining_stock: number | null };
          try {
            result = await srvMarkOrderPaid(order.id);
          } catch (err) {
            const message = err instanceof Error ? err.message : "Allocation échouée";
            console.error("[saspay webhook] allocation error:", message);
            await logPaymentEvent({
              order_id: order.id,
              notchpay_reference: paymentId,
              event_type: "webhook_allocation_error",
              level: "error",
              message,
            });
            return new Response("Allocation failed", { status: 500 });
          }

          await logPaymentEvent({
            order_id: order.id,
            notchpay_reference: paymentId,
            event_type: "webhook_allocation_success",
          });

          if (result.remaining_stock === 0) {
            await sendTelegramAlert(
              buildStockAlertMessage(result.application_name ?? "Produit"),
            );
          }
        } else if (isSasPayFailed(status)) {
          // MTN peut signaler un échec alors que la validation manuelle
          // *126# est encore possible : on laisse un délai de grâce.
          const grace = getMtnManualApprovalState(
            order.created_at,
            order.client_whatsapp,
          );
          if (grace.shouldDefer) {
            await logPaymentEvent({
              order_id: order.id,
              notchpay_reference: paymentId,
              event_type: "saspay_failed_deferred",
              level: "warn",
              message: `status=${status}`,
              metadata: {
                source: "webhook",
                grace_seconds_remaining: grace.remainingSeconds,
              },
            });
            return new Response("ok", { status: 200 });
          }

          await srvSetOrderStatus(order.id, "echoue");
          await logPaymentEvent({
            order_id: order.id,
            notchpay_reference: paymentId,
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
