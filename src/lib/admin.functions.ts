import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { serverDb, srvAdmin } from "./server-db.server";

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

export interface AdminApp {
  id: string;
  name: string;
  category: string;
  price_fcfa: number;
  image_url: string | null;
  subscription_duration_days: number;
  is_active: boolean;
  sort_order: number;
  product_type: "account" | "apk";
  apk_file_path: string | null;
  apk_version: string | null;
  apk_size_bytes: number | null;
  stock_disponible: number;
  stock_vendu: number;
}

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
    return await srvAdmin<AdminApp[]>("list_apps");
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
    await srvAdmin("create_app", {
      name: data.name,
      category: data.category,
      description: data.description || null,
      price_fcfa: data.price_fcfa,
      image_url: data.image_url || null,
      subscription_duration_days: data.subscription_duration_days,
      product_type: data.product_type ?? "account",
    });
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
    await srvAdmin("update_app", {
      application_id: data.application_id,
      image_url: url,
    });
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
    const ext =
      (data.file_name.split(".").pop() || "png")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 5) || "png";
    const path = `${crypto.randomUUID()}.${ext}`;
    const bytes = Buffer.from(data.data_base64, "base64");
    const db = serverDb();
    const { error: upErr } = await db.storage
      .from("app-icons")
      .upload(path, bytes, { contentType: data.content_type, upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { data: pub } = db.storage.from("app-icons").getPublicUrl(path);
    const publicUrl = pub.publicUrl;
    if (data.application_id) {
      await srvAdmin("update_app", {
        application_id: data.application_id,
        image_url: publicUrl,
      });
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
    await srvAdmin("update_app", {
      application_id: data.application_id,
      subscription_duration_days: data.subscription_duration_days,
    });
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
    await srvAdmin("update_app", {
      application_id: data.application_id,
      is_active: data.is_active,
    });
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
    await srvAdmin("update_app", {
      application_id: data.application_id,
      price_fcfa: data.price_fcfa,
    });
    return { ok: true };
  });

export interface AdminSlot {
  id: string;
  account_email: string;
  slot_number: number;
  profile_name: string | null;
  profile_password: string | null;
  status: "disponible" | "vendu" | "bloque";
  created_at: string;
}

export const adminListSlots = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    PasswordOnly.extend({ application_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    return await srvAdmin<AdminSlot[]>("list_slots", {
      application_id: data.application_id,
    });
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
    await srvAdmin("add_slot", {
      application_id: data.application_id,
      account_email: data.account_email,
      account_password: data.account_password,
      slot_number: data.slot_number,
      profile_name: data.profile_name || null,
      profile_password: data.profile_password || null,
    });
    return { ok: true };
  });

export const adminDeleteSlot = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    PasswordOnly.extend({ slot_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    await srvAdmin("delete_slot", { slot_id: data.slot_id });
    return { ok: true };
  });

// ---- Gestion des APK ----

// Crée une URL signée pour que l'admin upload directement le .apk dans le bucket privé.
export const adminCreateApkUploadUrl = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    PasswordOnly.extend({
      application_id: z.string().uuid(),
      file_name: z.string().min(1).max(255),
      file_size: z.number().int().min(1).max(220 * 1024 * 1024),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const ext =
      (data.file_name.split(".").pop() || "apk")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 5) || "apk";
    const path = `${data.application_id}/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await serverDb()
      .storage.from("apk-files")
      .createSignedUploadUrl(path);
    if (error || !signed) {
      throw new Error(error?.message || "Impossible de créer l'URL d'upload.");
    }
    return {
      path,
      token: signed.token,
      signed_url: signed.signedUrl,
    };
  });

// Finalise un upload APK : met à jour le path/version/taille sur l'application,
// et supprime l'ancien fichier APK si présent.
export const adminFinalizeApkUpload = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    PasswordOnly.extend({
      application_id: z.string().uuid(),
      apk_file_path: z.string().min(1).max(500),
      apk_size_bytes: z.number().int().min(1).max(220 * 1024 * 1024),
      apk_version: z.string().max(50).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const db = serverDb();

    const { data: head } = await db.storage
      .from("apk-files")
      .list(data.apk_file_path.split("/").slice(0, -1).join("/"), {
        search: data.apk_file_path.split("/").pop(),
      });
    if (!head || head.length === 0) {
      throw new Error("Le fichier n'a pas été trouvé dans le stockage.");
    }

    const prev = await srvAdmin<{ apk_file_path: string | null } | null>("get_app", {
      application_id: data.application_id,
    });

    await srvAdmin("update_app", {
      application_id: data.application_id,
      product_type: "apk",
      apk_file_path: data.apk_file_path,
      apk_size_bytes: data.apk_size_bytes,
      apk_version: data.apk_version?.trim() || null,
    });

    if (prev?.apk_file_path && prev.apk_file_path !== data.apk_file_path) {
      await db.storage.from("apk-files").remove([prev.apk_file_path]);
    }
    return { ok: true };
  });

// Met à jour uniquement la version APK
export const adminUpdateApkVersion = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    PasswordOnly.extend({
      application_id: z.string().uuid(),
      apk_version: z.string().max(50).nullable(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    await srvAdmin("update_app", {
      application_id: data.application_id,
      apk_version: data.apk_version?.trim() || null,
    });
    return { ok: true };
  });

// ============================================================
//  DIAGNOSTIC : événements de paiement
// ============================================================

export interface AdminPaymentEvent {
  id: string;
  order_id: string | null;
  notchpay_reference: string | null;
  event_type: string;
  level: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AdminDiagnosticOrder {
  id: string;
  status: string;
  client_name: string;
  client_whatsapp: string;
  client_email: string;
  amount_paid: number;
  notchpay_reference: string | null;
  created_at: string;
}

export const adminGetPaymentEvents = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    PasswordOnly.extend({
      query: z.string().min(3).max(100),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const res = await srvAdmin<{
      order: AdminDiagnosticOrder | null;
      events: AdminPaymentEvent[];
    }>("payment_events", { query: data.query.trim() });
    return {
      order: res?.order ?? null,
      events: res?.events ?? [],
    };
  });

// Liste les commandes récentes (24h) avec statut, pour le tableau de bord diagnostic.
export const adminListRecentPaymentOrders = createServerFn({ method: "POST" })
  .inputValidator((input) => PasswordOnly.parse(input))
  .handler(async ({ data }) => {
    checkPassword(data.password);
    return await srvAdmin<
      Array<{
        id: string;
        status: string;
        client_name: string;
        client_whatsapp: string;
        amount_paid: number;
        notchpay_reference: string | null;
        created_at: string;
        application_name: string;
      }>
    >("recent_orders");
  });
