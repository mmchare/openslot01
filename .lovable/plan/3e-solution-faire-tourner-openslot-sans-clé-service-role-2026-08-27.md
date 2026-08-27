# 3e solution : faire tourner OpenSlot sans clé service role

## Idée

Aujourd'hui tout le serveur écrit dans la base avec la clé « service role » (droits illimités), impossible à récupérer sur Lovable Cloud, donc impossible à copier dans Vercel.

La 3e voie : **déplacer les écritures sensibles dans la base elle-même**, sous forme de fonctions SQL protégées (`SECURITY DEFINER`) appelées avec la simple clé publique. La base exécute la logique avec ses propres droits, mais uniquement les opérations précises qu'on autorise. Résultat : le serveur n'a plus jamais besoin de la clé service role — ni sur Lovable, ni sur Vercel, ni ailleurs.

Pour les opérations réservées (admin, webhook NotchPay), on ajoute un **secret d'appel** partagé : la fonction SQL refuse de s'exécuter si l'appelant ne présente pas ce secret. Ce secret, lui, est une variable que tu peux créer toi-même et coller dans Vercel.

## Ce qui sera fait

### 1. Fonctions SQL sécurisées (migration base de données)

Créées côté base, appelables avec la clé publique :

- `create_order_secure(...)` : vérifie que le produit existe, est actif et en stock, crée la commande, renvoie son identifiant et son montant. Le prix vient de la base, jamais du navigateur.
- `set_order_reference(order_id, reference, secret)` : enregistre la référence NotchPay.
- `log_payment_event(...)` : journalise un événement de paiement.
- `get_order_status(order_id)` : renvoie le suivi de commande, et les accès livrés **uniquement** si la commande est payée.
- `mark_order_paid(reference, secret)` / `mark_order_failed(reference, secret)` : réservées au webhook et à la synchronisation NotchPay, protégées par le secret.
- `admin_*` : les opérations du panneau admin (produits, prix, slots, APK) passent par des fonctions équivalentes protégées par le même contrôle de secret.

Toutes ces fonctions sont en `SECURITY DEFINER` avec `search_path` figé, et ne renvoient jamais de données sensibles sans condition.

### 2. Un secret applicatif à la place de la clé service role

Nouvelle variable `APP_SERVER_SECRET` (valeur aléatoire, générée puis stockée), utilisée par le serveur pour appeler les fonctions protégées. Tu pourras la recopier dans Vercel ou Cloudflare.

### 3. Réécriture côté serveur

- Remplacer `supabaseAdmin` par un client Supabase « public » (déjà existant dans `catalog.server.ts`) dans :
  - `orders.functions.ts` (création de commande, page succès, lien APK)
  - `payment-events.server.ts`
  - `order-payment-sync.server.ts`
  - `admin.functions.ts`
  - `api/public/webhooks/notchpay.ts`
- Toutes les écritures passent par les fonctions SQL ci-dessus.
- Le lien de téléchargement APK signé : le bucket `apk-files` reste privé, la signature se fait via une fonction SQL qui ne s'exécute que si la commande est payée.
- `client.server.ts` reste en place mais n'est plus importé nulle part.

### 4. Vérifications

- Aucune politique d'accès ouverte : les tables restent verrouillées, seules les fonctions contrôlées écrivent.
- Aucune écriture directe autorisée pour l'anonyme sur `orders`, `slots_stock`, `applications`.
- Test complet : catalogue → commande → paiement Orange/MTN → webhook → livraison des accès → panneau admin.

## Résultat

Le projet fonctionne à l'identique, mais peut être déployé n'importe où (Vercel, Cloudflare, autre) avec seulement : URL Supabase, clé publique, secret applicatif, clés NotchPay, mot de passe admin.

## Point d'attention

Le secret applicatif devient la pièce critique : s'il fuite, quelqu'un peut marquer une commande comme payée. Il ne sera jamais envoyé au navigateur — uniquement utilisé côté serveur.
