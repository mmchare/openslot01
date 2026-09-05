// Diagnostic log for payment flow. Each step is recorded in `payment_events`
// so we can debug failures on a client's phone (especially Mobile Money USSD
// push issues). NEVER store full PINs, full card numbers, or secret keys.

import { serverDb, serverSecret } from "./server-db.server";

export type PaymentEventType =
  | "order_created"
  | "notchpay_init_request"
  | "notchpay_init_success"
  | "notchpay_init_error"
  | "notchpay_dev_mode"
  | "redirect_to_gateway"
  | "direct_charge_failed_checkout_fallback"
  | "webhook_received"
  | "webhook_invalid_signature"
  | "webhook_order_not_found"
  | "webhook_allocation_success"
  | "webhook_allocation_error"
  | "webhook_payment_failed"
  | "dev_simulate_success"
  | "dev_simulate_error"
  | "notchpay_direct_charge_success"
  | "notchpay_direct_charge_error"
  | "notchpay_status_check_success"
  | "notchpay_status_check_error"
  | "notchpay_failed_deferred"
  | "notchpay_order_synced"
  | "saspay_init_request"
  | "saspay_init_success"
  | "saspay_init_error"
  | "saspay_checkout_redirect"
  | "saspay_status_check_success"
  | "saspay_status_check_error"
  | "saspay_failed_deferred"
  | "saspay_order_synced"
  | "success_page_view";

export type PaymentEventLevel = "info" | "warn" | "error";

export interface LogPaymentEventInput {
  order_id?: string | null;
  notchpay_reference?: string | null;
  event_type: PaymentEventType;
  level?: PaymentEventLevel;
  message?: string;
  metadata?: Record<string, unknown>;
}

// Mask phone number: keep country code + last 2 digits.
function maskPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length <= 4) return "***";
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  const u = user.length <= 2 ? "*" : `${user[0]}***${user[user.length - 1]}`;
  return `${u}@${domain}`;
}

export function sanitizeMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v == null) {
      out[k] = v;
    } else if (k === "phone" && typeof v === "string") {
      out[k] = maskPhone(v);
    } else if (k === "email" && typeof v === "string") {
      out[k] = maskEmail(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function logPaymentEvent(input: LogPaymentEventInput): Promise<void> {
  try {
    const { error } = await serverDb().rpc("srv_log_payment_event", {
      p_secret: serverSecret(),
      p_order_id: (input.order_id ?? null) as unknown as string,
      p_reference: (input.notchpay_reference ?? null) as unknown as string,
      p_event_type: input.event_type,
      p_level: input.level ?? "info",
      p_message: (input.message ?? null) as unknown as string,
      p_metadata: (input.metadata
        ? sanitizeMetadata(input.metadata)
        : null) as never,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    // Never let logging break the payment flow.
    console.error("[payment-events] log failed:", err);
  }
}
