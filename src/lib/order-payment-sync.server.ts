import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logPaymentEvent } from "./payment-events.server";
import {
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