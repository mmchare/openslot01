import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  directChargeMobileMoney,
  initializeNotchPayment,
  type MobileMoneyChannel,
} from "./notchpay.server";
import { logPaymentEvent } from "./payment-events.server";
import {
  recoverRecentMtnProcessingOrder,
  syncOrderWithNotchPay,
} from "./order-payment-sync.server";
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
});


export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((input) => CreateOrderInput.parse(input))
  .handler(async ({ data }) => {
    const { data: app, error: appErr } = await supabaseAdmin
      .from("applications")
      .select("id, name, price_fcfa, is_active, product_type, apk_file_path")
      .eq("id", data.application_id)
      .maybeSingle();

    if (appErr || !app || !app.is_active) {
      throw new Error("Produit indisponible.");
    }

    if (app.product_type === "apk") {
      if (!app.apk_file_path) {
        throw new Error("Cet APK n'est pas encore disponible au téléchargement.");
      }
    } else {
      const { count } = await supabaseAdmin
        .from("slots_stock")
        .select("id", { count: "exact", head: true })
        .eq("application_id", app.id)
        .eq("status", "disponible");

      if (!count || count <= 0) {
        throw new Error("Désolé, ce produit est en rupture de stock.");
      }
    }

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        application_id: app.id,
        client_name: data.client_name,
        client_email: data.client_email,
        client_whatsapp: data.client_whatsapp,
        amount_paid: app.price_fcfa,
        status: "en_attente",
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      throw new Error("Impossible de créer la commande.");
    }

    await logPaymentEvent({
      order_id: order.id,
      event_type: "order_created",
      metadata: {
        application_id: app.id,
        application_name: app.name,
        amount: app.price_fcfa,
        product_type: app.product_type,
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
    const callbackUrl = `${baseUrl}/commande/succes/${order.id}`;

    const pay = await initializeNotchPayment({
      orderId: order.id,
      amountFcfa: app.price_fcfa,
      customer: {
        email: data.client_email,
        name: data.client_name,
        phone: data.client_whatsapp,
      },
      callbackUrl,
    });

    await supabaseAdmin
      .from("orders")
      .update({ notchpay_reference: pay.reference })
      .eq("id", order.id);

    // Direct Charge — déclenche immédiatement le prompt USSD sur le téléphone.
    // C'est ce qui fait apparaître la transaction en attente sur MTN MoMo / Orange Money.
    const charge = await directChargeMobileMoney({
      reference: pay.reference,
      channel: data.channel as MobileMoneyChannel,
      phone: data.client_whatsapp,
      orderId: order.id,
    });

    const instruction =
      data.channel === "cm.orange"
        ? "Attends le prompt Orange Money sur ton téléphone, puis entre ton PIN pour confirmer. Si rien n'apparaît sous 30s, compose #150*50# pour valider la transaction en attente."
        : "Un prompt MTN Mobile Money va s'afficher sur ton téléphone (10–30s). Entre ton PIN pour confirmer. Si le prompt ne s'affiche pas, compose *126# → Approve payment (ou *126*1*7#) pour valider la transaction en attente.";

    return {
      order_id: order.id,
      status: charge.status,
      instruction,
    };
  });


export const getOrderForSuccess = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<OrderSuccessPayload | null> => {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, status, created_at, client_name, client_whatsapp, amount_paid, slot_id, application_id, notchpay_reference, subscription_start_at, subscription_end_at, applications(name, product_type, apk_version, apk_size_bytes)",
      )
      .eq("id", data.order_id)
      .maybeSingle();

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
        await syncOrderWithNotchPay({
          orderId: order.id,
          notchpayReference: order.notchpay_reference,
          currentStatus: order.status,
        });
        const { data: refreshed } = await supabaseAdmin
          .from("orders")
          .select(
            "id, status, created_at, client_name, client_whatsapp, amount_paid, slot_id, application_id, notchpay_reference, subscription_start_at, subscription_end_at, applications(name, product_type, apk_version, apk_size_bytes)",
          )
          .eq("id", data.order_id)
          .maybeSingle();
        if (refreshed) Object.assign(order, refreshed);
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

    const appRel = order.applications as
      | {
          name: string;
          product_type: "account" | "apk";
          apk_version: string | null;
          apk_size_bytes: number | null;
        }
      | null;

    let access: OrderSuccessPayload["access"] = null;
    if (order.slot_id) {
      const { data: slot } = await supabaseAdmin
        .from("slots_stock")
        .select("account_email, account_password, slot_number, profile_name, profile_password")
        .eq("id", order.slot_id)
        .maybeSingle();
      if (slot) {
        access = {
          email: slot.account_email,
          password: slot.account_password,
          slot_number: slot.slot_number,
          profile_name: slot.profile_name,
          profile_password: slot.profile_password,
        };
      }
    }

    return {
      order_id: order.id,
      application_id: order.application_id,
      status: order.status,
      client_name: order.client_name,
      client_whatsapp: order.client_whatsapp,
      application_name: appRel?.name ?? "Produit",
      amount_paid: order.amount_paid,
      subscription_start_at: order.subscription_start_at,
      subscription_end_at: order.subscription_end_at,
      product_type: appRel?.product_type ?? "account",
      apk_version: appRel?.apk_version ?? null,
      apk_size_bytes: appRel?.apk_size_bytes ?? null,
      access,
    };
  });

export const simulateDevPayment = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, status, notchpay_reference, application_id")
      .eq("id", data.order_id)
      .maybeSingle();

    if (!order) throw new Error("Commande introuvable.");
    if (order.status === "paye") return { ok: true };
    if (!order.notchpay_reference?.startsWith("DEV_")) {
      throw new Error("Mode dev indisponible (paiement réel en cours).");
    }

    const { error } = await supabaseAdmin.rpc("allocate_slot_for_order", {
      p_order_id: order.id,
    });
    if (error) {
      await logPaymentEvent({
        order_id: order.id,
        notchpay_reference: order.notchpay_reference,
        event_type: "dev_simulate_error",
        level: "error",
        message: error.message,
      });
      throw new Error(error.message);
    }

    await logPaymentEvent({
      order_id: order.id,
      notchpay_reference: order.notchpay_reference,
      event_type: "dev_simulate_success",
    });

    try {
      const { count } = await supabaseAdmin
        .from("slots_stock")
        .select("id", { count: "exact", head: true })
        .eq("application_id", order.application_id)
        .eq("status", "disponible");
      if (count === 0) {
        const { data: app } = await supabaseAdmin
          .from("applications")
          .select("name")
          .eq("id", order.application_id)
          .maybeSingle();
        const { sendTelegramAlert, buildStockAlertMessage } = await import(
          "./telegram.server"
        );
        await sendTelegramAlert(buildStockAlertMessage(app?.name ?? "Produit"));
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
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, status, application_id")
      .eq("id", data.order_id)
      .maybeSingle();

    if (!order) throw new Error("Commande introuvable.");
    if (order.status !== "paye") {
      throw new Error("Le paiement n'est pas encore confirmé.");
    }

    const { data: app } = await supabaseAdmin
      .from("applications")
      .select("product_type, apk_file_path, name")
      .eq("id", order.application_id)
      .maybeSingle();

    if (!app || app.product_type !== "apk" || !app.apk_file_path) {
      throw new Error("Aucun APK associé à cette commande.");
    }

    const downloadName = `${app.name.replace(/[^a-zA-Z0-9._-]+/g, "_")}.apk`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("apk-files")
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
