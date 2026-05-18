import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CatalogItem } from "./types";

export const getCatalog = createServerFn({ method: "GET" }).handler(
  async (): Promise<CatalogItem[]> => {
    const { data, error } = await supabaseAdmin
      .from("applications_catalog")
      .select("*");
    if (error) {
      console.error("[catalog] error:", error);
      return [];
    }
    return (data ?? []) as CatalogItem[];
  },
);

export const getApplicationById = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<CatalogItem | null> => {
    const { data: row, error } = await supabaseAdmin
      .from("applications_catalog")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) {
      console.error("[catalog] getById error:", error);
      return null;
    }
    return (row as CatalogItem | null) ?? null;
  });
