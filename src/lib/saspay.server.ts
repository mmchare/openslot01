// SasPay API helpers (server-only).
// Docs: https://docs.saspay.me
//
// Flux :
//   1) POST /payments/softpay/  → { id, status, checkout_url }
//      - checkout_url vide  → une demande est poussée sur le téléphone (MTN CM)
//      - checkout_url non vide → il faut y rediriger le client (Orange, carte…)
//   2) GET /payments/{id}/verify/ → statut réel côté opérateur
//   3) SasPay POST notre webhook /api/public/webhooks/saspay
//      (HMAC-SHA256 hex de `${timestamp}.${rawBody}`)
//
// Env requis :
//   - SASPAY_API_KEY        (clé secrète sk_live_... / sk_test_...)
//   - SASPAY_WEBHOOK_SECRET (signing secret du webhook)

import { createHmac, timingSafeEqual } from "crypto";
import { logPaymentEvent } from "./payment-events.server";

const SASPAY_BASE = "https://api.saspay.me/api/v1";
const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SasPayNetwork = "mtn_cm" | "orange_cm";

export function isSasPayConfigured(): boolean {
  return Boolean(process.env["SASPAY_API_KEY"]);
}

function apiKey(): string {
  const key = process.env["SASPAY_API_KEY"];
  if (!key) throw new Error("SASPAY_API_KEY manquant : contactez le support.");
  return key;
}

// Devine l'opérateur camerounais à partir du numéro.
// MTN CM: 67, 680-684, 650-654 — Orange CM: 69, 655-659, 685-689
export function detectCameroonNetwork(phone: string): SasPayNetwork | null {
  const digits = phone.replace(/[^0-9]/g, "");
  const local = digits.startsWith("237") ? digits.slice(3) : digits;
  if (local.length < 3) return null;
  const p2 = local.slice(0, 2);
  const p3 = local.slice(0, 3);
  if (p2 === "67") return "mtn_cm";
  if (p2 === "69") return "orange_cm";
  if (["680", "681", "682", "683", "684"].includes(p3)) return "mtn_cm";
  if (["650", "651", "652", "653", "654"].includes(p3)) return "mtn_cm";
  if (["655", "656", "657", "658", "659"].includes(p3)) return "orange_cm";
  if (["685", "686", "687", "688", "689"].includes(p3)) return "orange_cm";
  return null;
}

// SasPay accepte le format international avec `+`.
export function normalizeCameroonPhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("237")) return `+${digits}`;
  if (digits.length === 9) return `+237${digits}`;
  return `+${digits}`;
}

function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0] ?? "Client";
  const last = parts.slice(1).join(" ") || first;
  return { first_name: first, last_name: last };
}

export function isSasPaySuccessful(status: string): boolean {
  return ["success", "successful", "completed", "complete"].includes(
    status.toLowerCase(),
  );
}

export function isSasPayFailed(status: string): boolean {
  return ["failed", "failure", "cancelled", "canceled", "expired", "rejected"].includes(
    status.toLowerCase(),
  );
}

interface SasPayEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: unknown;
  code?: number;
}

function unwrap<T extends Record<string, unknown>>(json: unknown): T {
  const env = json as SasPayEnvelope<T> & T;
  if (env && typeof env === "object" && "data" in env && env.data) {
    return env.data as T;
  }
  return env as T;
}

function readErrorMessage(json: unknown, fallback: string): string {
  const env = json as { error?: { message?: string } | Record<string, string[]>; message?: string };
  if (env?.error && typeof env.error === "object") {
    const asObj = env.error as { message?: string };
    if (typeof asObj.message === "string") return asObj.message;
    const first = Object.values(env.error as Record<string, string[]>)[0];
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
  }
  if (typeof env?.message === "string") return env.message;
  return fallback;
}

export interface CreatePaymentInput {
  orderId: string;
  amountFcfa: number;
  network: SasPayNetwork;
  customer: { email: string; name: string; phone: string };
  returnUrl: string;
}

export interface CreatePaymentResult {
  payment_id: string;
  status: string;
  checkout_url: string | null;
}

// Initie l'encaissement : push direct sur le téléphone, ou page hébergée.
export async function createSasPayPayment(
  input: CreatePaymentInput,
): Promise<CreatePaymentResult> {
  const phone = normalizeCameroonPhone(input.customer.phone);

  await logPaymentEvent({
    order_id: input.orderId,
    event_type: "saspay_init_request",
    metadata: {
      amount: input.amountFcfa,
      network: input.network,
      phone,
      email: input.customer.email,
    },
  });

  const res = await fetch(`${SASPAY_BASE}/payments/softpay/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      // Une clé par commande : un retry réseau ne crée pas un 2e paiement.
      "Idempotency-Key": input.orderId,
    },
    body: JSON.stringify({
      amount: input.amountFcfa.toFixed(2),
      currency: "XAF",
      country: "CM",
      network: input.network,
      description: `OpenSlot — Commande ${input.orderId}`,
      customer: {
        email: input.customer.email,
        phone,
        ...splitName(input.customer.name),
      },
      metadata: { order_id: input.orderId },
      return_url: input.returnUrl,
    }),
  });

  const bodyText = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(bodyText);
  } catch {
    // conserver bodyText pour le diagnostic
  }

  if (!res.ok) {
    await logPaymentEvent({
      order_id: input.orderId,
      event_type: "saspay_init_error",
      level: "error",
      message: `SasPay init failed (${res.status})`,
      metadata: {
        status: res.status,
        network: input.network,
        body: bodyText.slice(0, 1000),
      },
    });
    throw new Error(
      readErrorMessage(json, `Paiement SasPay impossible (${res.status}).`),
    );
  }

  const data = unwrap<{ id?: string; status?: string; checkout_url?: string }>(json);

  if (!data?.id) {
    await logPaymentEvent({
      order_id: input.orderId,
      event_type: "saspay_init_error",
      level: "error",
      message: "Réponse SasPay invalide",
      metadata: { body: bodyText.slice(0, 1000) },
    });
    throw new Error("SasPay a renvoyé une réponse invalide.");
  }

  const checkoutUrl = data.checkout_url ? data.checkout_url : null;

  await logPaymentEvent({
    order_id: input.orderId,
    notchpay_reference: data.id,
    event_type: "saspay_init_success",
    metadata: {
      status: data.status ?? "PENDING",
      network: input.network,
      mode: checkoutUrl ? "checkout" : "push",
    },
  });

  return {
    payment_id: data.id,
    status: (data.status ?? "PENDING").toLowerCase(),
    checkout_url: checkoutUrl,
  };
}

export interface SasPayStatusResult {
  id: string;
  status: string;
  amount: number | null;
  currency: string | null;
}

export async function getSasPayPaymentStatus(
  paymentId: string,
  orderId?: string,
): Promise<SasPayStatusResult> {
  const res = await fetch(
    `${SASPAY_BASE}/payments/${encodeURIComponent(paymentId)}/verify/`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        Accept: "application/json",
      },
    },
  );

  const bodyText = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(bodyText);
  } catch {
    // conserver bodyText
  }

  if (!res.ok) {
    await logPaymentEvent({
      order_id: orderId ?? null,
      notchpay_reference: paymentId,
      event_type: "saspay_status_check_error",
      level: "error",
      message: `SasPay status failed (${res.status})`,
      metadata: { status: res.status, body: bodyText.slice(0, 1000) },
    });
    throw new Error(
      readErrorMessage(json, `Vérification SasPay impossible (${res.status}).`),
    );
  }

  const data = unwrap<{
    id?: string;
    status?: string;
    requested_amount?: string;
    net_amount?: string;
    currency?: string;
  }>(json);

  const status = (data.status ?? "PENDING").toLowerCase();
  const rawAmount = data.net_amount ?? data.requested_amount ?? null;

  await logPaymentEvent({
    order_id: orderId ?? null,
    notchpay_reference: paymentId,
    event_type: "saspay_status_check_success",
    metadata: { status, amount: rawAmount, currency: data.currency ?? null },
  });

  return {
    id: data.id ?? paymentId,
    status,
    amount: rawAmount ? Number(rawAmount) : null,
    currency: data.currency ?? null,
  };
}

// Signature webhook : HMAC-SHA256 hex de `${timestamp}.${rawBody}`.
export function verifySasPaySignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
): boolean {
  const secret = process.env["SASPAY_WEBHOOK_SECRET"];
  if (!secret || !signature || !timestamp) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const received = Buffer.from(signature.trim().toLowerCase(), "utf8");
  const computed = Buffer.from(expected, "utf8");
  if (received.length !== computed.length) return false;
  return timingSafeEqual(received, computed);
}
