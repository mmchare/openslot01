import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  createSasPayCheckoutSession,
  type SasPayNetwork,
} from "./saspay.server";
import { logPaymentEvent } from "./payment-events.server";
import {
  recoverRecentMtnProcessingOrder,
  syncOrderWithSasPay,
} from "./order-payment-sync.server";
import {
  serverDb,
  srvGetOrder,
  srvMarkOrderPaid,
  srvSetOrderReference,
} from "./server-db.server";
import type { OrderSuccessPayload } from "./types";

const CreateOrderInput = z.object({
  application_id: z.string().uuid(),
  client_name: z.string().min(2).max(255),
  client_email: z.string().email().max(255),
  client_whatsapp: z
    .string()
    .min(8)
    .max(20)
    .regex(/^\+?[0-9\s]+$/, "Numéro invalide"),
  channel: z.enum(["cm.mtn", "cm.orange"]),
  origin: z.string().url().optional(),
  user_id: z.string().uuid().optional(),
});

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((input) => CreateOrderInput.parse(input))
  .handler(async ({ data }) => {
    // La base valide le produit, le stock et le prix, puis crée la commande.
    const { data: created, error: createErr } = await serverDb().rpc(
      "create_order_secure",
      {
        p_application_id: data.application_id,
        p_client_name: data.client_name,
        p_client_email: data.client_email,
        p_client_whatsapp: data.client_whatsapp,
        p_user_id: data.user_id ?? null,
      },
    );

    if (createErr) {
      throw new Error(createErr.message.replace(/^.*?:\s*/, ""));
    }

    const order = created as unknown as {
      order_id: string;
      amount_paid: number;
      application_name: string;
      product_type: "account" | "apk";
    } | null;

    if (!order?.order_id) {
      throw new Error("Impossible de créer la commande.");
    }

    await logPaymentEvent({
      order_id: order.order_id,
      event_type: "order_created",
      metadata: {
        application_id: data.application_id,
        application_name: order.application_name,
        amount: order.amount_paid,
        product_type: order.product_type,
        phone: data.client_whatsapp,
        email: data.client_email,
      },
    });

    // Préférer l'origine envoyée par le client (window.location.origin)
    // car getRequestHost() renvoie le host interne du worker (ex: localhost:8080).
    let baseUrl = data.origin?.replace(/\/+$/, "");
    if (!baseUrl) {
      const host = getRequestHost();
      const protocol = host.startsWith("localhost") ? "http" : "https";
      baseUrl = `${protocol}://${host}`;
    }
    const returnUrl = `${baseUrl}/commande/succes/${order.order_id}`;

    const network: SasPayNetwork =
      data.channel === "cm.orange" ? "orange_cm" : "mtn_cm";

    // Parcours unifié : tous les paiements passent par la page hébergée
    // sécurisée SasPay (choix de l'opérateur + validation PIN côté passerelle).
    const openCheckout = async () => {
      const session = await createSasPayCheckoutSession({
        orderId: order.order_id,
        amountFcfa: order.amount_paid,
        customer: {
          email: data.client_email,
          name: data.client_name,
          phone: data.client_whatsapp,
        },
        returnUrl,
      });

      await srvSetOrderReference(order.order_id, session.session_id);
      await logPaymentEvent({
        order_id: order.order_id,
        notchpay_reference: session.session_id,
        event_type: "saspay_checkout_redirect",
        metadata: { network, checkout_url_available: true },
      });

      return {
        order_id: order.order_id,
        status: session.status,
        instruction:
          "Termine le paiement sur la page sécurisée SasPay : choisis ton opérateur, puis valide la demande avec ton code PIN. La commande se débloque automatiquement.",
        checkout_url: session.checkout_url,
        payment_mode: "checkout_fallback" as const,
      };
    };

    return await openCheckout();
  });

export const getOrderForSuccess = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<OrderSuccessPayload | null> => {
    let order = await srvGetOrder(data.order_id);
    if (!order) return null;

    if (order.status === "echoue") {
      try {
        const recovered = await recoverRecentMtnProcessingOrder({
          orderId: order.id,
          currentStatus: order.status,
          createdAt: order.created_at,
          phone: order.client_whatsapp,
        });
        if (recovered) order.status = "en_attente";
      } catch (err) {
        await logPaymentEvent({
          order_id: order.id,
          notchpay_reference: order.notchpay_reference,
          event_type: "notchpay_status_check_error",
          level: "error",
          message: err instanceof Error ? err.message : "MTN recovery failed",
        });
      }
    }

    if (order.status === "en_attente" && order.notchpay_reference) {
      try {
        await syncOrderWithSasPay({
          orderId: order.id,
          notchpayReference: order.notchpay_reference,
          currentStatus: order.status,
        });
        const refreshed = await srvGetOrder(data.order_id);
        if (refreshed) order = refreshed;
      } catch (err) {
        await logPaymentEvent({
          order_id: order.id,
          notchpay_reference: order.notchpay_reference,
          event_type: "notchpay_status_check_error",
          level: "error",
          message: err instanceof Error ? err.message : "Status sync failed",
        });
      }
    }

    await logPaymentEvent({
      order_id: order.id,
      event_type: "success_page_view",
      metadata: { status: order.status },
    });

    return {
      order_id: order.id,
      application_id: order.application_id,
      status: order.status,
      client_name: order.client_name,
      client_whatsapp: order.client_whatsapp,
      application_name: order.application?.name ?? "Produit",
      amount_paid: order.amount_paid,
      subscription_start_at: order.subscription_start_at,
      subscription_end_at: order.subscription_end_at,
      product_type: order.application?.product_type ?? "account",
      apk_version: order.application?.apk_version ?? null,
      apk_size_bytes: order.application?.apk_size_bytes ?? null,
      access: order.access,
    };
  });

export const simulateDevPayment = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const order = await srvGetOrder(data.order_id);

    if (!order) throw new Error("Commande introuvable.");
    if (order.status === "paye") return { ok: true };
    if (!order.notchpay_reference?.startsWith("DEV_")) {
      throw new Error("Mode dev indisponible (paiement réel en cours).");
    }

    let remaining: number | null = null;
    try {
      const res = await srvMarkOrderPaid(order.id);
      remaining = res.remaining_stock;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Allocation échouée";
      await logPaymentEvent({
        order_id: order.id,
        notchpay_reference: order.notchpay_reference,
        event_type: "dev_simulate_error",
        level: "error",
        message,
      });
      throw new Error(message);
    }

    await logPaymentEvent({
      order_id: order.id,
      notchpay_reference: order.notchpay_reference,
      event_type: "dev_simulate_success",
    });

    try {
      if (remaining === 0) {
        const { sendTelegramAlert, buildStockAlertMessage } = await import(
          "./telegram.server"
        );
        await sendTelegramAlert(
          buildStockAlertMessage(order.application?.name ?? "Produit"),
        );
      }
    } catch (err) {
      console.error("[dev pay] stock alert err:", err);
    }

    return { ok: true };
  });

// Génère un lien de téléchargement signé (24h) pour l'APK d'une commande payée.
export const getApkDownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const order = await srvGetOrder(data.order_id);

    if (!order) throw new Error("Commande introuvable.");
    if (order.status !== "paye") {
      throw new Error("Le paiement n'est pas encore confirmé.");
    }

    const app = order.application;
    if (!app || app.product_type !== "apk" || !app.apk_file_path) {
      throw new Error("Aucun APK associé à cette commande.");
    }

    const downloadName = `${app.name.replace(/[^a-zA-Z0-9._-]+/g, "_")}.apk`;
    const { data: signed, error } = await serverDb()
      .storage.from("apk-files")
      .createSignedUrl(app.apk_file_path, 60 * 60 * 24, {
        download: downloadName,
      });

    if (error || !signed) {
      throw new Error(error?.message || "Impossible de générer le lien de téléchargement.");
    }

    return {
      url: signed.signedUrl,
      expires_in_seconds: 60 * 60 * 24,
      file_name: downloadName,
    };
  });
