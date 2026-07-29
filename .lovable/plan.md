## Diagnostic confirmé

- Le backend hébergé est sain : la base, le stockage et les fonctions serveur répondent normalement.
- Le projet est configuré pour un rendu serveur TanStack Start + Cloudflare Worker, pas pour un déploiement statique Vercel classique.
- Les paiements récents montrent que l’initialisation NotchPay réussit, puis l’échec arrive au moment du Direct Charge Mobile Money.
- La documentation NotchPay confirme que le payload Direct Charge attendu est simple :

```text
POST /payments/{reference}
{
  "channel": "cm.mtn" | "cm.orange",
  "data": { "phone": "+237XXXXXXXXX" }
}
```

- Les derniers logs disponibles montrent des erreurs NotchPay `500` sur Orange pendant le Direct Charge. Donc l’app crée bien la commande et la transaction NotchPay, mais elle bloque ensuite au déclenchement du prompt opérateur.

## Objectif

Stabiliser la production en deux axes :

1. Remettre un déploiement fiable via Cloudflare, puisque Vercel n’est pas le bon hébergement principal pour cette architecture.
2. Rendre le paiement robuste : ne plus bloquer une commande quand NotchPay Direct Charge échoue, et garder un parcours utilisable pour Orange et MTN.

## Plan d’action

### 1. Déploiement : arrêter de dépendre de Vercel pour la production

- Ajouter une configuration de déploiement Cloudflare claire dans le projet :
  - script dédié dans `package.json` pour construire et déployer le Worker ;
  - documentation courte des variables nécessaires ;
  - vérification que `wrangler.jsonc` pointe bien vers l’entrée Worker SSR.
- Garder Vercel uniquement comme ancien miroir ou le désactiver côté plateforme, car un déploiement statique Vercel peut afficher des 404 ou servir une ancienne version sans les fonctions serveur.
- Supprimer ou neutraliser les fichiers de redirection statique qui entretiennent la confusion avec un hébergement SPA/statique.

### 2. Paiement : corriger le flux NotchPay sans casser Orange

- Revenir à un Direct Charge strictement conforme à la documentation :

```text
{ channel, data: { phone: "+237..." } }
```

- Supprimer le fallback `account_number`, car il n’est pas dans la doc Direct Charge lue et peut provoquer des comportements imprévisibles.
- Changer `createOrder` pour ne plus faire échouer toute la commande si Direct Charge renvoie une erreur serveur NotchPay :
  - la commande reste `en_attente` ;
  - la référence NotchPay est conservée ;
  - l’utilisateur est envoyé vers la page NotchPay hébergée (`authorization_url`) comme fallback ;
  - l’événement diagnostic indique clairement `direct_charge_failed_checkout_fallback`.
- Conserver le Direct Charge quand il réussit, pour continuer à déclencher le prompt opérateur directement.

### 3. Séparer le comportement Orange et MTN

- Orange : Direct Charge d’abord, fallback checkout immédiat si NotchPay renvoie `500` ou une erreur opérateur.
- MTN : Direct Charge d’abord, puis page d’attente avec instructions `*126#`; si NotchPay renvoie une erreur directe, fallback checkout au lieu d’afficher une erreur finale.
- Ne plus afficher “Paiement échoué” trop vite pour MTN quand un Direct Charge vient juste de répondre `processing`.

### 4. Améliorer le diagnostic admin

- Ajouter dans les logs paiement :
  - payload utilisé (`phone`) ;
  - canal choisi (`cm.orange` / `cm.mtn`) ;
  - type de fallback (`checkout`, `direct_charge`) ;
  - statut NotchPay brut.
- Sur la page diagnostic admin, rendre visible si une commande est bloquée par :
  - initialisation NotchPay ;
  - Direct Charge opérateur ;
  - webhook absent ;
  - allocation stock.

### 5. Validation après correction

- Tester en local sans déclencher de vrai débit quand possible : création commande, redirection, conservation de la référence NotchPay.
- Tester un paiement Orange réel : vérifier que si Direct Charge marche, l’utilisateur reste sur la page d’attente puis passe en payé.
- Tester un paiement MTN réel : vérifier que l’utilisateur reçoit soit l’instruction `*126#`, soit le fallback checkout, mais jamais une erreur bloquante immédiate.
- Vérifier que le webhook `/api/public/webhooks/notchpay` reste accessible sur l’URL Cloudflare publiée.

## Résultat attendu

- Les mises à jour ne dépendront plus de Vercel : Cloudflare deviendra la cible de production cohérente avec le projet.
- Une panne ou anomalie NotchPay Direct Charge ne cassera plus le paiement : l’utilisateur aura toujours un chemin de secours via la page NotchPay.
- Orange retrouvera un flux fonctionnel, et MTN sera isolé avec une logique plus tolérante au comportement instable de l’opérateur.