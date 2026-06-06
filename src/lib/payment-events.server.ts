// Diagnostic log for payment flow. Each step is recorded in `payment_events`
// so we can debug failures on a client's phone (especially Mobile Money USSD
// push issues). NEVER store full PINs, full card numbers, or secret keys.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PaymentEventType =
  | "order_created"
  | "notchpay_init_request"
  | "notchpay_init_success"
  | "notchpay_init_error"
  | "notchpay_dev_mode"
  | "redirect_to_gateway"
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
    await supabaseAdmin.from("payment_events").insert({
      order_id: input.order_id ?? null,
      notchpay_reference: input.notchpay_reference ?? null,
      event_type: input.event_type,
      level: input.level ?? "info",
      message: input.message ?? null,
      metadata: input.metadata
        ? (sanitizeMetadata(input.metadata) as unknown as never)
        : null,
    });
  } catch (err) {
    // Never let logging break the payment flow.
    console.error("[payment-events] log failed:", err);
  }
}
