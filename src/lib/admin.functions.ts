import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function checkPassword(password: string) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error("ADMIN_PASSWORD non configuré côté serveur.");
  // Comparaison constante simple
  if (password.length !== expected.length) throw new Error("Mot de passe invalide.");
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= password.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) throw new Error("Mot de passe invalide.");
}

const PasswordOnly = z.object({ password: z.string().min(1).max(200) });

export const verifyAdminPassword = createServerFn({ method: "POST" })
  .inputValidator((input) => PasswordOnly.parse(input))
  .handler(async ({ data }) => {
    checkPassword(data.password);
    return { ok: true };
  });

export const adminListApps = createServerFn({ method: "POST" })
  .inputValidator((input) => PasswordOnly.parse(input))
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const { data: apps, error } = await supabaseAdmin
      .from("applications")
      .select("id, name, category, price_fcfa, is_active, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);

    // Counts par app
    const ids = (apps ?? []).map((a) => a.id);
    const counts: Record<string, { dispo: number; vendu: number }> = {};
    for (const id of ids) counts[id] = { dispo: 0, vendu: 0 };
    if (ids.length) {
      const { data: stock } = await supabaseAdmin
        .from("slots_stock")
        .select("application_id, status")
        .in("application_id", ids);
      for (const s of stock ?? []) {
        const c = counts[s.application_id];
        if (!c) continue;
        if (s.status === "disponible") c.dispo++;
        else if (s.status === "vendu") c.vendu++;
      }
    }
    return (apps ?? []).map((a) => ({
      ...a,
      stock_disponible: counts[a.id]?.dispo ?? 0,
      stock_vendu: counts[a.id]?.vendu ?? 0,
    }));
  });

export const adminToggleApp = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    PasswordOnly.extend({
      application_id: z.string().uuid(),
      is_active: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const { error } = await supabaseAdmin
      .from("applications")
      .update({ is_active: data.is_active })
      .eq("id", data.application_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListSlots = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    PasswordOnly.extend({ application_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const { data: slots, error } = await supabaseAdmin
      .from("slots_stock")
      .select(
        "id, account_email, slot_number, profile_name, status, created_at",
      )
      .eq("application_id", data.application_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return slots ?? [];
  });

export const adminAddSlot = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    PasswordOnly.extend({
      application_id: z.string().uuid(),
      account_email: z.string().min(1).max(255),
      account_password: z.string().min(1).max(255),
      slot_number: z.number().int().min(1).max(20),
      profile_name: z.string().max(100).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const { error } = await supabaseAdmin.from("slots_stock").insert({
      application_id: data.application_id,
      account_email: data.account_email,
      account_password: data.account_password,
      slot_number: data.slot_number,
      profile_name: data.profile_name || null,
      status: "disponible",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteSlot = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    PasswordOnly.extend({ slot_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    // Sécurité: on n'autorise la suppression que pour les slots disponibles
    const { data: slot } = await supabaseAdmin
      .from("slots_stock")
      .select("status")
      .eq("id", data.slot_id)
      .maybeSingle();
    if (!slot) throw new Error("Slot introuvable.");
    if (slot.status !== "disponible") {
      throw new Error("Impossible de supprimer un slot déjà vendu/réservé.");
    }
    const { error } = await supabaseAdmin
      .from("slots_stock")
      .delete()
      .eq("id", data.slot_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
