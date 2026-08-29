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
NOTCHPAY_PUBLIC_KEY
NOTCHPAY_HASH
ADMIN_PASSWORD
```

`NOTCHPAY_PRIVATE_KEY` n'est pas nécessaire pour le flux actuel si NotchPay confirme que la clé publique suffit à l'initialisation et au Direct Charge.

## Important

- Ne pas déployer ce projet comme un site statique Vercel ou Cloudflare Pages simple : les routes de commande, le webhook NotchPay et les fonctions serveur nécessitent le Worker.
- L'URL webhook NotchPay doit pointer vers le domaine Worker publié :

```text
https://votre-domaine/api/public/webhooks/notchpay
```

## Sans clé service role

L'application n'utilise plus `SUPABASE_SERVICE_ROLE_KEY`. Toutes les écritures
sensibles passent par des fonctions SQL `SECURITY DEFINER` protégées par
`APP_SERVER_SECRET`. Ce secret doit être identique côté serveur et dans la
table interne `app_config` (clé `server_secret`).

Elle peut donc être déployée sur n'importe quel hébergeur (Cloudflare Worker,
Vercel, autre) avec uniquement les variables listées ci-dessus.
