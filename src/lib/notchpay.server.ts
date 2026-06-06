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
  direct_status?: "requires_manual_confirmation" | "processing" | "fallback";
  direct_message?: string;
}

type DirectChargeResponse = {
  action?: string;
  message?: string;
  transaction?: { status?: string; message?: string };
};

export async function initializeNotchPayment(
  input: InitializePaymentInput,
): Promise<InitializePaymentResult> {
  const key = process.env.NOTCHPAY_PUBLIC_KEY;

  // DEV MODE — no Notch Pay key configured yet.
  if (!key) {
    const ref = `DEV_${input.orderId}`;
    await logPaymentEvent({
      order_id: input.orderId,
      notchpay_reference: ref,
      event_type: "notchpay_dev_mode",
      level: "warn",
      message: "NOTCHPAY_PUBLIC_KEY non configurée — paiement simulé.",
    });
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
  const internationalPhone = `+${phone}`;

  await logPaymentEvent({
    order_id: input.orderId,
    event_type: "notchpay_init_request",
    metadata: {
      amount: input.amountFcfa,
      phone,
      email: input.customer.email,
      phone_raw_length: input.customer.phone.length,
    },
  });

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
    await logPaymentEvent({
      order_id: input.orderId,
      event_type: "notchpay_init_error",
      level: "error",
      message: `Notch Pay init failed (${res.status})`,
      metadata: { status: res.status, body: text.slice(0, 1000) },
    });
    throw new Error(`Notch Pay init failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    transaction?: { reference: string };
    authorization_url?: string;
  };

  if (!json.transaction?.reference || !json.authorization_url) {
    await logPaymentEvent({
      order_id: input.orderId,
      event_type: "notchpay_init_error",
      level: "error",
      message: "Réponse Notch Pay invalide",
      metadata: { json: json as unknown as Record<string, unknown> },
    });
    throw new Error("Notch Pay returned an invalid response");
  }

  await logPaymentEvent({
    order_id: input.orderId,
    notchpay_reference: json.transaction.reference,
    event_type: "notchpay_init_success",
    metadata: { authorization_url: json.authorization_url },
  });

  // === Direct charge: déclenche le push USSD immédiatement sur le téléphone du client ===
  // Sans cet appel, Notch Pay attend que le client clique « Payer » sur sa page hébergée,
  // donc l'opérateur (MTN/Orange) ne reçoit AUCUNE transaction tant que ça n'a pas eu lieu.
  const channel = detectCameroonChannel(phone);
  try {
    const chargeRes = await fetch(
      `${NOTCHPAY_BASE}/payments/${json.transaction.reference}`,
      {
        method: "POST",
        headers: {
          Authorization: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel,
          data: {
            phone: internationalPhone,
            account_number: internationalPhone,
            country: "CM",
          },
        }),
      },
    );
    const chargeText = await chargeRes.text();
    let chargeJson: DirectChargeResponse | null = null;
    try {
      chargeJson = JSON.parse(chargeText) as DirectChargeResponse;
    } catch {
      // Keep raw text in diagnostics below.
    }
    if (!chargeRes.ok) {
      await logPaymentEvent({
        order_id: input.orderId,
        notchpay_reference: json.transaction.reference,
        event_type: "notchpay_direct_charge_error",
        level: "warn",
        message: `Direct charge failed (${chargeRes.status}) — fallback page hébergée`,
        metadata: { status: chargeRes.status, body: chargeText.slice(0, 800), channel },
      });
      // Fallback: on garde la page hébergée Notch Pay
      return {
        reference: json.transaction.reference,
        authorization_url: json.authorization_url,
        dev_mode: false,
      };
    }

    await logPaymentEvent({
      order_id: input.orderId,
      notchpay_reference: json.transaction.reference,
      event_type: "notchpay_direct_charge_success",
      metadata: { channel, body: chargeText.slice(0, 500) },
    });

    // Push USSD envoyé → on renvoie directement le client vers la page de succès
    // qui poll le statut jusqu'à confirmation par webhook.
    return {
      reference: json.transaction.reference,
      authorization_url: input.callbackUrl,
      dev_mode: false,
      direct_status: chargeJson?.action === "confirm" ? "requires_manual_confirmation" : "processing",
      direct_message: chargeJson?.message ?? chargeJson?.transaction?.message,
    };
  } catch (err) {
    await logPaymentEvent({
      order_id: input.orderId,
      notchpay_reference: json.transaction.reference,
      event_type: "notchpay_direct_charge_error",
      level: "error",
      message: err instanceof Error ? err.message : "direct charge exception",
      metadata: { channel },
    });
    return {
      reference: json.transaction.reference,
      authorization_url: json.authorization_url,
      dev_mode: false,
    };
  }
}

// Détecte l'opérateur camerounais depuis un numéro normalisé (237XXXXXXXXX).
// MTN : 67, 680-684, 650-654 — Orange : 69, 655-659, 685-689.
// Fallback : "cm.mobile" laisse Notch Pay auto-détecter.
function detectCameroonChannel(phone: string): string {
  const m = phone.match(/^237(\d{9})$/);
  if (!m) return "cm.mobile";
  const local = m[1];
  const p2 = local.slice(0, 2);
  const p3 = local.slice(0, 3);
  if (p2 === "67") return "cm.mtn";
  if (p2 === "69") return "cm.orange";
  if (["680", "681", "682", "683", "684"].includes(p3)) return "cm.mtn";
  if (["650", "651", "652", "653", "654"].includes(p3)) return "cm.mtn";
  if (["655", "656", "657", "658", "659"].includes(p3)) return "cm.orange";
  if (["685", "686", "687", "688", "689"].includes(p3)) return "cm.orange";
  return "cm.mobile";
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
