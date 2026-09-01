import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { serverDb, serverSecret } from "./server-db.server";

export interface UserOrder {
  id: string;
  status: "en_attente" | "paye" | "echoue";
  created_at: string;
  client_name: string;
  client_email: string;
  client_whatsapp: string;
  amount_paid: number;
  application_name: string;
  product_type: "account" | "apk";
  subscription_start_at: string | null;
  subscription_end_at: string | null;
}

export const getUserOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserOrder[]> => {
    const { data, error } = await serverDb().rpc("srv_get_user_orders", {
      p_secret: serverSecret(),
      p_user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return (data as unknown as UserOrder[]) ?? [];
  });

const UpdateProfileInput = z.object({
  full_name: z.string().min(2).max(255).optional(),
  phone: z.string().min(8).max(20).optional(),
});

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateProfileInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await serverDb().rpc("srv_update_profile", {
      p_secret: serverSecret(),
      p_user_id: context.userId,
      p_payload: data,
    });
    if (error) throw new Error(error.message);
    return res as unknown as { ok: boolean };
  });
