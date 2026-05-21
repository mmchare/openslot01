import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { initializeNotchPayment } from "./notchpay.server";
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
});

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((input) => CreateOrderInput.parse(input))
  .handler(async ({ data }) => {
    // Récupère le produit
    const { data: app, error: appErr } = await supabaseAdmin
      .from("applications")
      .select("id, name, price_fcfa, is_active")
      .eq("id", data.application_id)
      .maybeSingle();

    if (appErr || !app || !app.is_active) {
      throw new Error("Produit indisponible.");
    }

    // Vérifie le stock
    const { count } = await supabaseAdmin
      .from("slots_stock")
      .select("id", { count: "exact", head: true })
      .eq("application_id", app.id)
      .eq("status", "disponible");

    if (!count || count <= 0) {
      throw new Error("Désolé, ce produit est en rupture de stock.");
    }

    // Crée la commande en attente
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

    // Construit l'URL de callback (page de succès)
    const host = getRequestHost();
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const callbackUrl = `${protocol}://${host}/commande/succes/${order.id}`;

    // Initialise Notch Pay (ou DEV mode)
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

    // Stocke la référence Notch Pay
    await supabaseAdmin
      .from("orders")
      .update({ notchpay_reference: pay.reference })
      .eq("id", order.id);

    return {
      order_id: order.id,
      authorization_url: pay.authorization_url,
      dev_mode: pay.dev_mode,
    };
  });

export const getOrderForSuccess = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<OrderSuccessPayload | null> => {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, status, client_name, client_whatsapp, amount_paid, slot_id, subscription_start_at, subscription_end_at, applications(name)",
      )
      .eq("id", data.order_id)
      .maybeSingle();

    if (!order) return null;

    let access: OrderSuccessPayload["access"] = null;
    if (order.slot_id) {
      const { data: slot } = await supabaseAdmin
        .from("slots_stock")
        .select("account_email, account_password, slot_number, profile_name")
        .eq("id", order.slot_id)
        .maybeSingle();
      if (slot) {
        access = {
          email: slot.account_email,
          password: slot.account_password,
          slot_number: slot.slot_number,
          profile_name: slot.profile_name,
        };
      }
    }

    return {
      order_id: order.id,
      status: order.status,
      client_name: order.client_name,
      client_whatsapp: order.client_whatsapp,
      application_name:
        (order.applications as { name: string } | null)?.name ?? "Produit",
      amount_paid: order.amount_paid,
      subscription_start_at: order.subscription_start_at,
      subscription_end_at: order.subscription_end_at,
      access,
    };
  });


// DEV: simule un paiement réussi (utilisé uniquement quand Notch Pay
// n'est pas encore configuré). Sécurité: vérifie que la commande est en
// mode DEV (référence préfixée DEV_).
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
    if (error) throw new Error(error.message);

    // Alerte stock (côté webhook réel aussi)
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
