import { createFileRoute } from "@tanstack/react-router";

// Diagnostic de configuration serveur : renvoie uniquement des booléens,
// jamais la valeur des secrets.
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const required = [
          "SUPABASE_URL",
          "SUPABASE_PUBLISHABLE_KEY",
          "APP_SERVER_SECRET",
          "SASPAY_API_KEY",
          "SASPAY_WEBHOOK_SECRET",
          "ADMIN_PASSWORD",
        ];

        const env: Record<string, boolean> = {};
        for (const key of required) {
          env[key] = Boolean(process.env[key]);
        }
        env["SUPABASE_ANON_KEY_fallback"] = Boolean(
          process.env["SUPABASE_ANON_KEY"],
        );

        const missing = required.filter((k) => !env[k]);

        return Response.json(
          { ok: missing.length === 0, missing, env },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
