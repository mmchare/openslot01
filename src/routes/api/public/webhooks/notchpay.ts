import { createFileRoute } from "@tanstack/react-router";
import {
  isNotchPaymentFailed,
  isNotchPaymentSuccessful,
  verifyNotchPaySignature,
} from "@/lib/notchpay.server";
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
          data?: { reference?: string; trxref?: string; status?: string };
          transaction?: { reference?: string; trxref?: string; status?: string };
          payment?: { reference?: string; trxref?: string; status?: string };
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

        const order = await srvFindOrderByReference(reference, trxref ?? null);

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
          let result: { application_name: string | null; remaining_stock: number | null };
          try {
            result = await srvMarkOrderPaid(order.id);
          } catch (err) {
            const message = err instanceof Error ? err.message : "Allocation échouée";
            console.error("[notchpay webhook] allocation error:", message);
            await logPaymentEvent({
              order_id: order.id,
              notchpay_reference: reference,
              event_type: "webhook_allocation_error",
              level: "error",
              message,
            });
            return new Response("Allocation failed", { status: 500 });
          }

          await logPaymentEvent({
            order_id: order.id,
            notchpay_reference: reference,
            event_type: "webhook_allocation_success",
          });

          if (result.remaining_stock === 0) {
            await sendTelegramAlert(
              buildStockAlertMessage(result.application_name ?? "Produit"),
            );
          }
        } else if (status && isNotchPaymentFailed(status)) {
          // MTN peut envoyer un statut d'échec très vite alors que la validation
          // manuelle *126# est encore possible.
          const grace = getMtnManualApprovalState(
            order.created_at,
            order.client_whatsapp,
          );
          if (grace.shouldDefer) {
            await logPaymentEvent({
              order_id: order.id,
              notchpay_reference: reference,
              event_type: "notchpay_failed_deferred",
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
