// Accès base de données côté serveur SANS clé service role.
// Toutes les écritures sensibles passent par des fonctions SQL SECURITY DEFINER
// protégées par APP_SERVER_SECRET.
import { createPublicCatalogClient } from "./catalog.server";

export function serverDb() {
  return createPublicCatalogClient();
}

export function serverSecret(): string {
  const secret = process.env["APP_SERVER_SECRET"]?.trim();
  if (!secret) {
    throw new Error(
      "Configuration du serveur incomplète (APP_SERVER_SECRET manquant). Ajoutez cette variable d'environnement puis redéployez.",
    );
  }
  return secret;
}

// "Unauthorized" vient de la base quand APP_SERVER_SECRET ne correspond pas
// à la valeur enregistrée : on renvoie un message compréhensible.
export function explainDbError(message: string): Error {
  if (/unauthorized/i.test(message)) {
    return new Error(
      "Serveur non autorisé par la base de données : la variable APP_SERVER_SECRET de ce déploiement ne correspond pas à celle enregistrée. Mettez la même valeur partout, puis redéployez.",
    );
  }
  return new Error(message);
}

export interface ServerOrder {
  id: string;
  status: "en_attente" | "paye" | "echoue";
  created_at: string;
  client_name: string;
  client_email: string;
  client_whatsapp: string;
  amount_paid: number;
  slot_id: string | null;
  application_id: string;
  notchpay_reference: string | null;
  subscription_start_at: string | null;
  subscription_end_at: string | null;
  application: {
    name: string;
    product_type: "account" | "apk";
    apk_version: string | null;
    apk_size_bytes: number | null;
    apk_file_path: string | null;
  };
  access: {
    email: string;
    password: string;
    slot_number: number;
    profile_name: string | null;
    profile_password: string | null;
  } | null;
}

export async function srvGetOrder(orderId: string): Promise<ServerOrder | null> {
  const { data, error } = await serverDb().rpc("srv_get_order", {
    p_secret: serverSecret(),
    p_order_id: orderId,
  });
  if (error) throw explainDbError(error.message);
  return (data as unknown as ServerOrder | null) ?? null;
}

export async function srvSetOrderReference(orderId: string, reference: string) {
  const { error } = await serverDb().rpc("srv_set_order_reference", {
    p_secret: serverSecret(),
    p_order_id: orderId,
    p_reference: reference,
  });
  if (error) throw explainDbError(error.message);
}

export async function srvSetOrderStatus(
  orderId: string,
  status: "en_attente" | "echoue",
  expected?: "en_attente" | "paye" | "echoue",
): Promise<boolean> {
  const { data, error } = await serverDb().rpc("srv_set_order_status", {
    p_secret: serverSecret(),
    p_order_id: orderId,
    p_status: status,
    p_expected_status: (expected ?? null) as unknown as string,
  });
  if (error) throw explainDbError(error.message);
  return Boolean(data);
}

export async function srvMarkOrderPaid(
  orderId: string,
): Promise<{ application_name: string | null; remaining_stock: number | null }> {
  const { data, error } = await serverDb().rpc("srv_mark_order_paid", {
    p_secret: serverSecret(),
    p_order_id: orderId,
  });
  if (error) throw explainDbError(error.message);
  return (data as unknown as {
    application_name: string | null;
    remaining_stock: number | null;
  }) ?? { application_name: null, remaining_stock: null };
}

export async function srvFindOrderByReference(
  reference: string,
  trxref?: string | null,
): Promise<{
  id: string;
  status: "en_attente" | "paye" | "echoue";
  application_id: string;
  created_at: string;
  client_whatsapp: string;
  notchpay_reference: string | null;
} | null> {
  const { data, error } = await serverDb().rpc("srv_find_order_by_reference", {
    p_secret: serverSecret(),
    p_reference: reference,
    p_trxref: (trxref ?? null) as unknown as string,
  });
  if (error) throw explainDbError(error.message);
  return (data as never) ?? null;
}

export async function srvLastMtnProcessingEvent(orderId: string): Promise<{
  id: string;
  notchpay_reference: string | null;
  created_at: string;
} | null> {
  const { data, error } = await serverDb().rpc("srv_last_mtn_processing_event", {
    p_secret: serverSecret(),
    p_order_id: orderId,
  });
  if (error) throw explainDbError(error.message);
  return (data as never) ?? null;
}

export async function srvAdmin<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await serverDb().rpc("srv_admin", {
    p_secret: serverSecret(),
    p_action: action,
    p_payload: payload as never,
  });
  if (error) throw explainDbError(error.message);
  return data as unknown as T;
}
