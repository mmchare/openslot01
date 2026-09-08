import { createFileRoute } from "@tanstack/react-router";

// Diagnostic de configuration serveur : renvoie uniquement des booléens et des
// codes de statut, jamais la valeur des secrets.
//
// Usage : /api/public/health          → présence des variables
//         /api/public/health?tests=1  → teste en plus la base et SasPay
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
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

        const url = new URL(request.url);
        const wantsTests = url.searchParams.get("tests") === "1";

        let tests:
          | {
              database: { ok: boolean; detail: string };
              saspay: { ok: boolean; detail: string };
            }
          | undefined;

        if (wantsTests) {
          tests = {
            database: await testDatabaseSecret(),
            saspay: await testSasPayKey(),
          };
        }

        const ok =
          missing.length === 0 &&
          (!tests || (tests.database.ok && tests.saspay.ok));

        return Response.json(
          { ok, missing, env, tests },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});

// Vérifie que APP_SERVER_SECRET correspond bien au secret enregistré en base.
async function testDatabaseSecret(): Promise<{ ok: boolean; detail: string }> {
  try {
    const { serverDb, serverSecret } = await import("@/lib/server-db.server");
    const { error } = await serverDb().rpc("srv_get_order", {
      p_secret: serverSecret(),
      p_order_id: "00000000-0000-0000-0000-000000000000",
    });

    if (!error) return { ok: true, detail: "Secret serveur valide." };

    if (/unauthorized/i.test(error.message)) {
      return {
        ok: false,
        detail:
          "APP_SERVER_SECRET ne correspond pas à celui enregistré en base. Utilisez exactement la même valeur que sur l'app Lovable.",
      };
    }
    return { ok: false, detail: error.message };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Erreur base de données.",
    };
  }
}

// Vérifie que la clé SasPay est acceptée par la passerelle.
async function testSasPayKey(): Promise<{ ok: boolean; detail: string }> {
  const key = process.env["SASPAY_API_KEY"];
  if (!key) return { ok: false, detail: "SASPAY_API_KEY absente." };

  try {
    const res = await fetch("https://api.saspay.me/api/v1/checkout-sessions/", {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        detail:
          "SasPay refuse la clé (non autorisé). Vérifiez que SASPAY_API_KEY est bien la clé secrète, sans espace ni retour à la ligne.",
      };
    }
    if (!res.ok) {
      return { ok: false, detail: `SasPay a répondu ${res.status}.` };
    }
    return { ok: true, detail: "Clé SasPay acceptée." };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Appel SasPay impossible.",
    };
  }
}
