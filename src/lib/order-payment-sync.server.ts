import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logPaymentEvent } from "./payment-events.server";
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

  const { data: lastMtnProcessing } = await supabaseAdmin
    .from("payment_events")
    .select("id, notchpay_reference, created_at, metadata")
    .eq("order_id", input.orderId)
    .eq("event_type", "notchpay_direct_charge_success")
    .eq("metadata->>channel", "cm.mtn")
    .in("metadata->>status", ["processing", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastMtnProcessing) return false;

  const { error } = await supabaseAdmin
    .from("orders")
    .update({ status: "en_attente" })
    .eq("id", input.orderId)
    .eq("status", "echoue");

  if (error) {
    await logPaymentEvent({
      order_id: input.orderId,
      notchpay_reference: lastMtnProcessing.notchpay_reference,
      event_type: "notchpay_status_check_error",
      level: "error",
      message: `Impossible de remettre la commande MTN en attente: ${error.message}`,
    });
    return false;
  }

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
    const { error } = await supabaseAdmin.rpc("allocate_slot_for_order", {
      p_order_id: input.orderId,
    });
    if (error) {
      await logPaymentEvent({
        order_id: input.orderId,
        notchpay_reference: input.notchpayReference,
        event_type: "webhook_allocation_error",
        level: "error",
        message: error.message,
        metadata: { source: "status_poll", notchpay_status: remote.status },
      });
      throw new Error(error.message);
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
    const { data: orderTiming } = await supabaseAdmin
      .from("orders")
      .select("created_at, client_whatsapp")
      .eq("id", input.orderId)
      .maybeSingle();

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

    await supabaseAdmin
      .from("orders")
      .update({ status: "echoue" })
      .eq("id", input.orderId)
      .eq("status", "en_attente");
    await logPaymentEvent({
      order_id: input.orderId,
      notchpay_reference: input.notchpayReference,
      event_type: "notchpay_order_synced",
      level: "warn",
      metadata: { source: "status_poll", notchpay_status: remote.status },
    });
  }
}