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
      .select(
        "id, name, category, price_fcfa, image_url, subscription_duration_days, is_active, sort_order, product_type, apk_file_path, apk_version, apk_size_bytes",
      )
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);

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

export const adminCreateApp = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    PasswordOnly.extend({
      name: z.string().min(1).max(100),
      category: z.string().min(1).max(50),
      description: z.string().max(1000).optional().nullable(),
      price_fcfa: z.number().int().min(0).max(10_000_000),
      image_url: z.string().url().max(500).optional().nullable(),
      subscription_duration_days: z.number().int().min(1).max(3650),
      product_type: z.enum(["account", "apk"]).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const { error } = await supabaseAdmin.from("applications").insert({
      name: data.name,
      category: data.category,
      description: data.description || null,
      price_fcfa: data.price_fcfa,
      image_url: data.image_url || null,
      subscription_duration_days: data.subscription_duration_days,
      product_type: data.product_type ?? "account",
      is_active: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateAppImage = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    PasswordOnly.extend({
      application_id: z.string().uuid(),
      image_url: z.string().max(500).nullable(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const url = data.image_url?.trim() || null;
    if (url && !/^https?:\/\//i.test(url)) {
      throw new Error("L'URL de l'icône doit commencer par http(s)://");
    }
    const { error } = await supabaseAdmin
      .from("applications")
      .update({ image_url: url })
      .eq("id", data.application_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUploadAppImage = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    PasswordOnly.extend({
      application_id: z.string().uuid().optional().nullable(),
      file_name: z.string().min(1).max(255),
      content_type: z.string().min(1).max(100),
      // base64 sans préfixe data:
      data_base64: z.string().min(1).max(4_000_000), // ~3 MB binaire
    }).parse(input),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    if (!data.content_type.startsWith("image/")) {
      throw new Error("Le fichier doit être une image.");
    }
    const ext = (data.file_name.split(".").pop() || "png")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 5) || "png";
    const path = `${crypto.randomUUID()}.${ext}`;
    const bytes = Buffer.from(data.data_base64, "base64");
    const { error: upErr } = await supabaseAdmin.storage
      .from("app-icons")
      .upload(path, bytes, { contentType: data.content_type, upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { data: pub } = supabaseAdmin.storage
      .from("app-icons")
      .getPublicUrl(path);
    const publicUrl = pub.publicUrl;
    if (data.application_id) {
      const { error } = await supabaseAdmin
        .from("applications")
        .update({ image_url: publicUrl })
        .eq("id", data.application_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true, image_url: publicUrl };
  });

export const adminUpdateAppDuration = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    PasswordOnly.extend({
      application_id: z.string().uuid(),
      subscription_duration_days: z.number().int().min(1).max(3650),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const { error } = await supabaseAdmin
      .from("applications")
      .update({ subscription_duration_days: data.subscription_duration_days })
      .eq("id", data.application_id);
    if (error) throw new Error(error.message);
    return { ok: true };
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

export const adminUpdateAppPrice = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    PasswordOnly.extend({
      application_id: z.string().uuid(),
      price_fcfa: z.number().int().min(0).max(10_000_000),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const { error } = await supabaseAdmin
      .from("applications")
      .update({ price_fcfa: data.price_fcfa })
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
        "id, account_email, slot_number, profile_name, profile_password, status, created_at",
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
      profile_password: z.string().max(255).optional().nullable(),
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
      profile_password: data.profile_password || null,
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
