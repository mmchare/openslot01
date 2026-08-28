import { logPaymentEvent } from "./payment-events.server";
import {
  srvGetOrder,
  srvLastMtnProcessingEvent,
  srvMarkOrderPaid,
  srvSetOrderStatus,
} from "./server-db.server";
import {
  detectCameroonChannel,
  getNotchPaymentStatus,
  isNotchPaymentFailed,
  isNotchPaymentSuccessful,
} from "./notchpay.server";

interface SyncOrderInput {
  orderId: string;
  notchpayReference: string | null;
  currentStatus: "en_attente" | "paye" | "echoue";
}

const MTN_MANUAL_APPROVAL_GRACE_MS = 15 * 60 * 1000;

export function getMtnManualApprovalState(
  createdAt: string | null | undefined,
  phone: string | null | undefined,
): { shouldDefer: boolean; remainingSeconds: number } {
  const orderCreatedAt = createdAt ? new Date(createdAt).getTime() : Date.now();
  const ageMs = Date.now() - orderCreatedAt;
  const isMtn = detectCameroonChannel(phone ?? "") === "cm.mtn";

  return {
    shouldDefer: isMtn && ageMs < MTN_MANUAL_APPROVAL_GRACE_MS,
    remainingSeconds: Math.max(
      0,
      Math.ceil((MTN_MANUAL_APPROVAL_GRACE_MS - ageMs) / 1000),
    ),
  };
}

export async function recoverRecentMtnProcessingOrder(input: {
  orderId: string;
  currentStatus: "en_attente" | "paye" | "echoue";
  createdAt: string | null;
  phone: string | null;
}): Promise<boolean> {
  if (input.currentStatus !== "echoue") return false;

  const grace = getMtnManualApprovalState(input.createdAt, input.phone);
  if (!grace.shouldDefer) return false;

  const lastMtnProcessing = await srvLastMtnProcessingEvent(input.orderId);
  if (!lastMtnProcessing) return false;

  let restored = false;
  try {
    restored = await srvSetOrderStatus(input.orderId, "en_attente", "echoue");
  } catch (err) {
    await logPaymentEvent({
      order_id: input.orderId,
      notchpay_reference: lastMtnProcessing.notchpay_reference,
      event_type: "notchpay_status_check_error",
      level: "error",
      message: `Impossible de remettre la commande MTN en attente: ${
        err instanceof Error ? err.message : "erreur inconnue"
      }`,
    });
    return false;
  }

  if (!restored) return false;

  await logPaymentEvent({
    order_id: input.orderId,
    notchpay_reference: lastMtnProcessing.notchpay_reference,
    event_type: "notchpay_failed_deferred",
    level: "warn",
    message: "Commande MTN remise en attente après un échec trop rapide.",
    metadata: {
      source: "mtn_processing_recovery",
      grace_seconds_remaining: grace.remainingSeconds,
    },
  });

  return true;
}

export async function syncOrderWithNotchPay(input: SyncOrderInput): Promise<void> {
  if (input.currentStatus !== "en_attente" || !input.notchpayReference) return;

  const remote = await getNotchPaymentStatus(input.notchpayReference, input.orderId);

  if (isNotchPaymentSuccessful(remote.status)) {
    try {
      await srvMarkOrderPaid(input.orderId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Allocation échouée";
      await logPaymentEvent({
        order_id: input.orderId,
        notchpay_reference: input.notchpayReference,
        event_type: "webhook_allocation_error",
        level: "error",
        message,
        metadata: { source: "status_poll", notchpay_status: remote.status },
      });
      throw new Error(message);
    }
    await logPaymentEvent({
      order_id: input.orderId,
      notchpay_reference: input.notchpayReference,
      event_type: "notchpay_order_synced",
      metadata: { source: "status_poll", notchpay_status: remote.status },
    });
    return;
  }

  if (isNotchPaymentFailed(remote.status)) {
    const orderTiming = await srvGetOrder(input.orderId);

    // MTN renvoie parfois "failed" quelques secondes après le Direct Charge,
    // alors que NotchPay demande encore une validation manuelle via *126#.
    // On garde donc la commande en attente le temps que le client confirme.
    const grace = getMtnManualApprovalState(
      orderTiming?.created_at,
      orderTiming?.client_whatsapp,
    );
    if (grace.shouldDefer) {
      await logPaymentEvent({
        order_id: input.orderId,
        notchpay_reference: input.notchpayReference,
        event_type: "notchpay_failed_deferred",
        level: "warn",
        metadata: {
          source: "status_poll",
          notchpay_status: remote.status,
          grace_seconds_remaining: grace.remainingSeconds,
        },
      });
      return;
    }

    await srvSetOrderStatus(input.orderId, "echoue", "en_attente");
    await logPaymentEvent({
      order_id: input.orderId,
      notchpay_reference: input.notchpayReference,
      event_type: "notchpay_order_synced",
      level: "warn",
      metadata: { source: "status_poll", notchpay_status: remote.status },
    });
  }
}
