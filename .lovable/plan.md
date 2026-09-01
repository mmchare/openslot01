# Plan d’évolution OpenSlot

## Objectif
Ajouter 4 fonctionnalités qui améliorent la rétention client et la gestion du business :
1. Authentification client + historique de commandes
2. Dashboard admin (stats ventes, revenus, stock faible)
3. Codes promo/coupons
4. Programme de parrainage avec crédit

## Contraintes projet
- Pas de `SUPABASE_SERVICE_ROLE_KEY` côté serveur : toute écriture sensible passe par des RPC `srv_*` protégées par `APP_SERVER_SECRET`.
- Interface en français.
- Déploiement cible Worker SSR (Cloudflare) mais compatible Vercel.
- WhatsApp support : +237 683179424.

---

## Phase 1 — Comptes clients

### Tables / migrations
- `profiles` (id uuid refs auth.users, full_name text, phone text, created_at, updated_at)
- `auth.users` déjà géré par Supabase Auth.
- GRANT SELECT/INSERT/UPDATE sur `profiles` à `authenticated`.
- RLS : utilisateur ne lit/modifie que son profil.

### Auth
- Route `/auth` : connexion / inscription email+mot de passe.
- Configurer email auth (auto-confirm si demandé).
- Route `_authenticated/` pour les pages protégées.
- Middleware `functionMiddleware` : conserver l’attachement bearer existant.

### Pages client
- `/compte` : profil + historique des commandes.
- `/compte/commandes` : liste des commandes passées avec lien vers `/commande/$orderId`.
- Adapter `create_order_secure` pour accepter un `p_user_id uuid` optionnel et l’enregistrer dans `orders.user_id`.

### RPC
- `srv_get_user_orders(p_secret, p_user_id)` : historique sécurisé.
- `srv_update_profile(p_secret, p_user_id, p_payload)` : mise à jour profil.

---

## Phase 2 — Dashboard admin

### Tables / migrations
- Vue matérialisée ou table `daily_stats` (date, revenue, order_count, app_breakdown jsonb) alimentée par trigger ou batch.
- Pour commencer : RPC `srv_admin_stats(p_secret, p_from, p_to)` qui agrège `orders` à la volée.

### UI admin
- Nouvelle page `/admin/dashboard` :
  - Revenus aujourd’hui / cette semaine / ce mois.
  - Nombre de commandes par statut.
  - Produits les plus vendus.
  - Alertes stock faible (stock < 2).
- Graphique simple (barres/lignes) sans lib lourde, ou tableau de chiffres.

### RPC
- `srv_admin_stats(p_secret, p_from date, p_to date)` → jsonb.
- `srv_admin_low_stock(p_secret)` → liste produits avec stock restant.

---

## Phase 3 — Coupons promo

### Tables / migrations
- `coupons` (
  id uuid,
  code text unique not null,
  discount_type enum('fixed','percent') not null,
  discount_value integer not null,
  max_uses integer,
  used_count integer default 0,
  valid_from timestamp,
  valid_until timestamp,
  is_active boolean default true,
  created_at
)
- GRANT SELECT à `anon`/`authenticated` pour validation publique.
- GRANT ALL à `service_role` ; admin via `srv_admin`.

### Logique commande
- Champ `coupon_id` nullable dans `orders`.
- RPC `srv_validate_coupon(p_secret, p_code, p_app_id, p_amount)` → coupon valide + montant final.
- Adapter `create_order_secure` pour accepter `p_coupon_code` et calculer le montant final côté SQL.
- UI : champ "Code promo" dans le formulaire de commande, affichage du montant réduit.

### UI admin
- Page `/admin/coupons` : liste, création, activation/désactivation, suppression.

---

## Phase 4 — Parrainage

### Tables / migrations
- `referrals` (
  id uuid,
  referrer_id uuid refs auth.users,
  referred_id uuid refs auth.users unique,
  code text not null,
  reward_amount integer default 500,
  status enum('pending','converted') default 'pending',
  created_at,
  converted_at
)
- `profiles` : ajouter `referral_code text unique`, `referral_balance integer default 0`.
- RLS : utilisateur ne voit que ses propres referrals et son solde.

### Logique
- Générer un code de parrainage à l’inscription.
- Champ `referral_code` optionnel à l’inscription / au checkout.
- Lorsqu’une commande d’un filleul passe en `paye` :
  - Créditer `referral_balance` du parrain du montant configuré.
  - Marquer `referrals.status = 'converted'`.
- Le solde peut être utilisé comme coupon automatique au checkout (déduction du montant).

### UI
- `/compte/parrainage` : code à partager, solde, liste des filleuls convertis.
- Affichage du solde utilisable dans le panier.

### RPC
- `srv_apply_referral(p_secret, p_referrer_code, p_referred_id)` : enregistre le parrainage.
- `srv_credit_referral_on_payment(p_secret, p_order_id)` : déclenché par webhook/paiement.
- `srv_use_referral_balance(p_secret, p_user_id, p_order_id, p_amount)` : déduit le solde.

---

## Livraison proposée
1. Phase 1 (comptes clients) en premier : elle débloque l’historique et facilite les phases 3 et 4.
2. Phase 2 (stats admin) : rapide à implémenter et utile immédiatement.
3. Phase 3 (coupons) : augmenter les conversions.
4. Phase 4 (parrainage) : plus complexe, à faire en dernier.

## Risques / points d’attention
- Email auth : nécessite une configuration email (Lovable Cloud gère par défaut).
- RLS : chaque nouvelle table doit avoir ses GRANTs et policies.
- Stockage mots de passe : jamais en clair ; Supabase Auth gère cela.
- RPC `srv_*` : chaque nouvelle fonction doit vérifier `APP_SERVER_SECRET`.
- Compatibilité Vercel/Cloudflare : aucune dépendance Node-only ; les graphiques resteront simples.
