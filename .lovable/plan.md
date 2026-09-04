# Stabiliser les paiements NotchPay

## Résultat visé

Les paiements confirmés par NotchPay doivent automatiquement passer la commande à « payée » et livrer l’accès ou l’APK. Lorsqu’un prompt Mobile Money échoue temporairement, OpenSlot doit réessayer correctement avant de proposer la page de paiement sécurisée.

## Corrections

1. **Réparer la validation des notifications NotchPay**
   - Comparer la signature reçue et la signature calculée dans le même format hexadécimal.
   - Conserver la vérification HMAC obligatoire et le corps brut de la notification.
   - Cela corrige le rejet systématique actuellement visible dans les événements `webhook_invalid_signature`.

2. **Rendre le Direct Charge conforme à la documentation actuelle**
   - Envoyer d’abord `account_number`, format indiqué par NotchPay pour Mobile Money.
   - En cas d’erreur serveur temporaire, effectuer un seul réessai contrôlé avec la variante `phone` avant le fallback.
   - Journaliser distinctement chaque tentative sans exposer les données sensibles.

3. **Sécuriser la confirmation d’une commande**
   - Vérifier que les notifications répétées ne peuvent pas attribuer deux slots à une même commande.
   - Garder la vérification active du statut comme filet de sécurité si une notification est retardée.

4. **Valider le parcours complet**
   - Tester localement la signature avec un exemple HMAC connu, puis vérifier qu’une signature incorrecte reste refusée.
   - Vérifier le typage et la compilation.
   - Tester l’endpoint public et le parcours commande → attente → paiement confirmé.
   - Contrôler dans les événements que la notification est acceptée et que la commande est livrée une seule fois.

## Point externe confirmé

La dernière transaction Orange a bien été initialisée, mais l’appel Direct Charge a reçu une erreur HTTP 500 de NotchPay. Le correctif fiabilise le réessai et la confirmation, mais si Orange continue à renvoyer cette erreur après déploiement, l’activation du prompt dépendra du support NotchPay ; la page de paiement sécurisée restera alors le secours fonctionnel.

## Détails techniques

- Fichiers principaux : logique NotchPay et endpoint de notification.
- Aucun ajout de clé service role.
- Conservation de `APP_SERVER_SECRET`, de l’interface française et de la compatibilité Worker/Vercel.
