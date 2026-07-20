// Notch Pay API helpers (server-only).
// Docs: https://developer.notchpay.co/accept-payments/charge
//
// Flow Direct Charge :
//   1) POST /payments  → renvoie { transaction.reference }
//   2) POST /payments/{reference}  { channel, data: { phone } }
//      → Notch Pay pousse un prompt USSD sur le téléphone du client.
//   3) Le client valide (PIN Mobile Money). Notch Pay POST notre webhook
//      /api/public/webhooks/notchpay (HMAC-SHA256 sur le body brut).
//
// Env requis :
//   - NOTCHPAY_PUBLIC_KEY  (Authorization header)
//   - NOTCHPAY_HASH        (secret HMAC webhook)

import { createHmac, timingSafeEqual } from "crypto";
import { logPaymentEvent } from "./payment-events.server";

const NOTCHPAY_BASE = "https://api.notchpay.co";

export type MobileMoneyChannel = "cm.mtn" | "cm.orange";

export function isNotchPayConfigured(): boolean {
  return Boolean(process.env.NOTCHPAY_PUBLIC_KEY);
}

// Devine l'opérateur camerounais à partir du numéro.
// MTN CM: 67, 680-684, 650-654
// Orange CM: 69, 655-659, 685-689
export function detectCameroonChannel(phone: string): MobileMoneyChannel | null {
  const digits = phone.replace(/[^0-9]/g, "");
  const local = digits.startsWith("237") ? digits.slice(3) : digits;
  if (local.length < 3) return null;
  const p2 = local.slice(0, 2);
  const p3 = local.slice(0, 3);
  if (p2 === "67") return "cm.mtn";
  if (p2 === "69") return "cm.orange";
  if (["680", "681", "682", "683", "684"].includes(p3)) return "cm.mtn";
  if (["650", "651", "652", "653", "654"].includes(p3)) return "cm.mtn";
  if (["655", "656", "657", "658", "659"].includes(p3)) return "cm.orange";
  if (["685", "686", "687", "688", "689"].includes(p3)) return "cm.orange";
  return null;
}

// Notch Pay attend un numéro E.164 : `+237XXXXXXXXX`.
export function normalizeCameroonPhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("237")) return `+${digits}`;
  if (digits.length === 9) return `+237${digits}`;
  return `+${digits}`;
}

export interface InitializePaymentInput {
  orderId: string;
  amountFcfa: number;
  customer: { email: string; name: string; phone: string };
  callbackUrl: string;
}

export interface InitializePaymentResult {
  reference: string;
  authorization_url: string;
}

export async function initializeNotchPayment(
  input: InitializePaymentInput,
): Promise<InitializePaymentResult> {
  const key = process.env.NOTCHPAY_PUBLIC_KEY;
  if (!key) {
    throw new Error("NOTCHPAY_PUBLIC_KEY manquant : contactez le support.");
  }

  const phone = normalizeCameroonPhone(input.customer.phone);

  await logPaymentEvent({
    order_id: input.orderId,
    event_type: "notchpay_init_request",
    metadata: {
      amount: input.amountFcfa,
      phone,
      email: input.customer.email,
    },
  });

  const res = await fetch(`${NOTCHPAY_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: key,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      amount: input.amountFcfa,
      currency: "XAF",
      description: `OpenSlot — Commande ${input.orderId}`,
      reference: input.orderId,
      callback: input.callbackUrl,
      customer: {
        name: input.customer.name,
        email: input.customer.email,
        phone,
      },
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    await logPaymentEvent({
      order_id: input.orderId,
      event_type: "notchpay_init_error",
      level: "error",
      message: `Notch Pay init failed (${res.status})`,
      metadata: { status: res.status, body: bodyText.slice(0, 1000) },
    });
    throw new Error(`Notch Pay init failed (${res.status}): ${bodyText}`);
  }

  const json = JSON.parse(bodyText) as {
    transaction?: { reference: string };
    authorization_url?: string;
  };

  if (!json.transaction?.reference || !json.authorization_url) {
    await logPaymentEvent({
      order_id: input.orderId,
      event_type: "notchpay_init_error",
      level: "error",
      message: "Réponse Notch Pay invalide",
      metadata: { body: bodyText.slice(0, 1000) },
    });
    throw new Error("Notch Pay returned an invalid response");
  }

  await logPaymentEvent({
    order_id: input.orderId,
    notchpay_reference: json.transaction.reference,
    event_type: "notchpay_init_success",
    metadata: { authorization_url: json.authorization_url },
  });

  return {
    reference: json.transaction.reference,
    authorization_url: json.authorization_url,
  };
}

export interface DirectChargeInput {
  reference: string;
  channel: MobileMoneyChannel;
  phone: string;
  orderId: string;
}

export interface DirectChargeResult {
  status: string;
  message: string;
  raw: unknown;
}

export interface NotchPayStatusResult {
  reference: string;
  trxref: string | null;
  status: string;
  amount: number | null;
  currency: string | null;
  raw: unknown;
}

function readTransactionStatus(json: {
  status?: string;
  payment?: { status?: string; reference?: string; trxref?: string; amount?: number; currency?: string };
  transaction?:
    | string
    | { status?: string; reference?: string; trxref?: string; amount?: number; currency?: string };
}): string {
  if (typeof json.transaction === "object" && json.transaction?.status) {
    return json.transaction.status;
  }
  if (json.payment?.status) return json.payment.status;
  return json.status ?? "processing";
}

function readTransactionObject(json: {
  payment?: { status?: string; reference?: string; trxref?: string; amount?: number; currency?: string };
  transaction?:
    | string
    | { status?: string; reference?: string; trxref?: string; amount?: number; currency?: string };
}) {
  if (typeof json.transaction === "object" && json.transaction) return json.transaction;
  return json.payment ?? null;
}

// Déclenche le prompt USSD sur le téléphone du client.
export async function directChargeMobileMoney(
  input: DirectChargeInput,
): Promise<DirectChargeResult> {
  const key = process.env.NOTCHPAY_PUBLIC_KEY;
  if (!key) throw new Error("NOTCHPAY_PUBLIC_KEY manquant.");

  const phone = normalizeCameroonPhone(input.phone);

  const attempts = [
    {
      variant: "phone",
      body: { channel: input.channel, data: { phone } },
    },
    {
      variant: "account_number",
      body: { channel: input.channel, data: { account_number: phone } },
    },
  ];

  let lastErrorMessage = `Impossible de déclencher le paiement. Vérifie ton numéro ${input.channel === "cm.mtn" ? "MTN" : "Orange"}.`;

  for (const [index, attempt] of attempts.entries()) {
    const res = await fetch(
      `${NOTCHPAY_BASE}/payments/${encodeURIComponent(input.reference)}`,
      {
        method: "POST",
        headers: {
          Authorization: key,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(attempt.body),
      },
    );

    const bodyText = await res.text();
    let json: {
      status?: string;
      message?: string;
      payment?: { status?: string };
      transaction?: string | { status?: string };
    } = {};
    try {
      json = JSON.parse(bodyText);
    } catch {
      // keep bodyText for logging
    }

    if (res.ok) {
      await logPaymentEvent({
        order_id: input.orderId,
        notchpay_reference: input.reference,
        event_type: "notchpay_direct_charge_success",
        metadata: {
          channel: input.channel,
          payload_variant: attempt.variant,
          status: readTransactionStatus(json),
          response_message: json.message ?? null,
        },
      });

      return {
        status: readTransactionStatus(json),
        message: json.message ?? "Prompt envoyé sur le téléphone.",
        raw: json,
      };
    }

    lastErrorMessage =
      json.message ||
      `Impossible de déclencher le paiement (${res.status}). Vérifie ton numéro ${input.channel === "cm.mtn" ? "MTN" : "Orange"}.`;

    await logPaymentEvent({
      order_id: input.orderId,
      notchpay_reference: input.reference,
      event_type: "notchpay_direct_charge_error",
      level: "error",
      message: `Direct charge failed (${res.status})`,
      metadata: {
        status: res.status,
        body: bodyText.slice(0, 1000),
        channel: input.channel,
        payload_variant: attempt.variant,
        will_retry: res.status >= 500 && index < attempts.length - 1,
      },
    });

    if (res.status < 500) break;
  }

  throw new Error(lastErrorMessage);
}

export async function getNotchPaymentStatus(
  reference: string,
  orderId?: string,
): Promise<NotchPayStatusResult> {
  const key = process.env.NOTCHPAY_PUBLIC_KEY;
  if (!key) throw new Error("NOTCHPAY_PUBLIC_KEY manquant.");

  const res = await fetch(
    `${NOTCHPAY_BASE}/payments/${encodeURIComponent(reference)}`,
    {
      method: "GET",
      headers: {
        Authorization: key,
        Accept: "application/json",
      },
    },
  );

  const bodyText = await res.text();
  let json: {
    status?: string;
    message?: string;
    payment?: {
      status?: string;
      reference?: string;
      trxref?: string;
      amount?: number;
      currency?: string;
    };
    transaction?:
      | string
      | {
          status?: string;
          reference?: string;
          trxref?: string;
          amount?: number;
          currency?: string;
        };
  } = {};
  try {
    json = JSON.parse(bodyText);
  } catch {
    // keep bodyText for diagnostics
  }

  if (!res.ok) {
    await logPaymentEvent({
      order_id: orderId ?? null,
      notchpay_reference: reference,
      event_type: "notchpay_status_check_error",
      level: "error",
      message: `Notch Pay status failed (${res.status})`,
      metadata: { status: res.status, body: bodyText.slice(0, 1000) },
    });
    throw new Error(json.message || `Vérification Notch Pay impossible (${res.status}).`);
  }

  const tx = readTransactionObject(json);
  const status = readTransactionStatus(json).toLowerCase();

  await logPaymentEvent({
    order_id: orderId ?? null,
    notchpay_reference: reference,
    event_type: "notchpay_status_check_success",
    metadata: {
      status,
      trxref: tx?.trxref ?? null,
      amount: tx?.amount ?? null,
      currency: tx?.currency ?? null,
    },
  });

  return {
    reference: tx?.reference ?? reference,
    trxref: tx?.trxref ?? null,
    status,
    amount: tx?.amount ?? null,
    currency: tx?.currency ?? null,
    raw: json,
  };
}

export function isNotchPaymentSuccessful(status: string): boolean {
  return ["complete", "completed", "success", "successful", "paid"].includes(
    status.toLowerCase(),
  );
}

export function isNotchPaymentFailed(status: string): boolean {
  return [
    "failed",
    "fail",
    "canceled",
    "cancelled",
    "expired",
    "declined",
    "rejected",
  ].includes(status.toLowerCase());
}

export function verifyNotchPaySignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const secret = process.env.NOTCHPAY_HASH;
  if (!secret || !signature) return false;
  try {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const normalized = signature.trim().replace(/^sha256=/i, "");
    const a = Buffer.from(normalized, "hex");
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
