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

    const createdAt = orderTiming?.created_at
      ? new Date(orderTiming.created_at).getTime()
      : Date.now();
    const ageMs = Date.now() - createdAt;
    const isMtn = detectCameroonChannel(orderTiming?.client_whatsapp ?? "") === "cm.mtn";

    // MTN renvoie parfois "failed" quelques secondes après le Direct Charge,
    // alors que NotchPay demande encore une validation manuelle via *126#.
    // On garde donc la commande en attente le temps que le client confirme.
    if (isMtn && ageMs < 5 * 60 * 1000) {
      await logPaymentEvent({
        order_id: input.orderId,
        notchpay_reference: input.notchpayReference,
        event_type: "notchpay_failed_deferred",
        level: "warn",
        metadata: {
          source: "status_poll",
          notchpay_status: remote.status,
          grace_seconds_remaining: Math.ceil((5 * 60 * 1000 - ageMs) / 1000),
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