// Notch Pay API helpers (server-only).
// Docs: https://docs.notchpay.co
// Required runtime env (added via secrets when the user is ready):
//   - NOTCHPAY_PUBLIC_KEY
//   - NOTCHPAY_HASH        (webhook signature secret)
//
// If NOTCHPAY_PUBLIC_KEY is missing, we fall back to DEV mode that simulates
// a successful payment immediately so the full UX can be tested end-to-end.

import { createHmac, timingSafeEqual } from "crypto";
import { logPaymentEvent } from "./payment-events.server";

const NOTCHPAY_BASE = "https://api.notchpay.co";

export function isNotchPayConfigured(): boolean {
  return Boolean(process.env.NOTCHPAY_PUBLIC_KEY);
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
  dev_mode: boolean;
}

export async function initializeNotchPayment(
  input: InitializePaymentInput,
): Promise<InitializePaymentResult> {
  const key = process.env.NOTCHPAY_PUBLIC_KEY;

  // DEV MODE — no Notch Pay key configured yet.
  if (!key) {
    const ref = `DEV_${input.orderId}`;
    // Direct success URL with a special dev query param the success page handles.
    return {
      reference: ref,
      authorization_url: `${input.callbackUrl}?reference=${ref}&dev=1`,
      dev_mode: true,
    };
  }

  // Notch Pay attend un numéro purement numérique avec indicatif pays
  // (ex: 237683179424). On retire +, espaces, tirets, parenthèses.
  let phone = input.customer.phone.replace(/[^0-9]/g, "");
  // Si le numéro local camerounais (9 chiffres commençant par 6 ou 2)
  // est envoyé sans indicatif, on préfixe 237.
  if (/^[62]\d{8}$/.test(phone)) {
    phone = `237${phone}`;
  }

  const res = await fetch(`${NOTCHPAY_BASE}/payments/initialize`, {
    method: "POST",
    headers: {
      Authorization: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amountFcfa,
      currency: "XAF",
      email: input.customer.email,
      phone,
      name: input.customer.name,
      reference: input.orderId,
      description: `OpenSlot — Commande ${input.orderId}`,
      callback: input.callbackUrl,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notch Pay init failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    transaction?: { reference: string };
    authorization_url?: string;
  };

  if (!json.transaction?.reference || !json.authorization_url) {
    throw new Error("Notch Pay returned an invalid response");
  }

  return {
    reference: json.transaction.reference,
    authorization_url: json.authorization_url,
    dev_mode: false,
  };
}

export function verifyNotchPaySignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const secret = process.env.NOTCHPAY_HASH;
  if (!secret || !signature) return false;
  try {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
