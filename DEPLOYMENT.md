OpenSlot est une application TanStack Start avec rendu serveur. Pour la production, utilisez un déploiement Cloudflare Worker, pas un hébergement statique.

## Cloudflare via GitHub

1. Connecter le dépôt GitHub dans Cloudflare Workers.
2. Utiliser la commande de build :

```bash
bun install
bun run build
```

3. Utiliser la commande de déploiement :

```bash
bun run deploy:cloudflare
```

4. Configurer ces variables côté Cloudflare :

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
APP_SERVER_SECRET
SASPAY_API_KEY
SASPAY_WEBHOOK_SECRET
ADMIN_PASSWORD
```

`SASPAY_API_KEY` est la clé secrète (sk_live_...) du tableau de bord SasPay ; `SASPAY_WEBHOOK_SECRET` est le secret de signature du webhook.

## Important

- Ne pas déployer ce projet comme un site statique Vercel ou Cloudflare Pages simple : les routes de commande, le webhook SasPay et les fonctions serveur nécessitent le Worker.
- L'URL webhook SasPay doit pointer vers le domaine Worker publié :

```text
https://votre-domaine/api/public/webhooks/saspay
```

## Sans clé service role

L'application n'utilise plus `SUPABASE_SERVICE_ROLE_KEY`. Toutes les écritures
sensibles passent par des fonctions SQL `SECURITY DEFINER` protégées par
`APP_SERVER_SECRET`. Ce secret doit être identique côté serveur et dans la
table interne `app_config` (clé `server_secret`).

Elle peut donc être déployée sur n'importe quel hébergeur (Cloudflare Worker,
Vercel, autre) avec uniquement les variables listées ci-dessus.

## Vercel

Les mêmes variables sont obligatoires côté Vercel (Project Settings →
Environment Variables), pour Production ET Preview :

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
APP_SERVER_SECRET
SASPAY_API_KEY
SASPAY_WEBHOOK_SECRET
ADMIN_PASSWORD
```

`APP_SERVER_SECRET` doit être **exactement identique** à celui enregistré en
base (table `app_config`, clé `server_secret`) et à celui de l'app Lovable.
Sinon la base refuse toute écriture de paiement avec « Unauthorized ».

Vérification après déploiement :

```text
https://votre-domaine-vercel/api/public/health?tests=1
```

La réponse indique si chaque variable est présente, si le secret serveur est
accepté par la base, et si la clé SasPay est acceptée par la passerelle.
