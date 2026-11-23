# Chantiers Direct

Plateforme qui met à disposition des professionnels (artisans, entreprises, prestataires) les chantiers issus de votre prospection commerciale. Les pros paient pour accéder aux coordonnées du client.

## Modèle de revenus (réglable dans Administration > Réglages)

| Formule | Ce que paie le pro | Ce qu'il obtient |
| --- | --- | --- |
| Découverte | 0 € | Liste des chantiers (résumé, ville, budget) |
| À l'unité | % du budget estimé (avec minimum et maximum) ou prix fixe par chantier | Coordonnées complètes du client |
| Abonnement Pro | Montant mensuel récurrent | Descriptions complètes + remise sur chaque accès |

Chaque chantier est limité à un nombre de places (pros) pour garder de la valeur.

## Fonctionnement technique

- `public/` : site (HTML, CSS, JavaScript, sans compilation)
- `netlify/functions/api.mjs` : API `/api/*`
- `src/server/` : logique (stockage Netlify Blobs, sessions, tarifs, Stripe)
- Données stockées dans Netlify Blobs (store `chantiers-direct`)

## Variables d'environnement (Netlify > Project configuration > Environment variables)

| Variable | Rôle |
| --- | --- |
| `ADMIN_EMAIL` | E-mail de connexion de l'administrateur |
| `ADMIN_PASSWORD` | Mot de passe administrateur (secret) |
| `SESSION_SECRET` | Clé de signature des sessions (secret, longue et aléatoire) |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe `sk_live_…` (ou `sk_test_…` pour tester) |
| `STRIPE_WEBHOOK_SECRET` | Secret du webhook Stripe `whsec_…` |

Après toute modification d'une variable : Deploys > Trigger deploy.

## Activer le paiement par carte (Stripe)

1. Créer un compte sur stripe.com (SIRET, IBAN, pièce d'identité).
2. Developers > API keys : copier la clé secrète dans `STRIPE_SECRET_KEY`.
3. Developers > Webhooks > Add endpoint : URL `https://VOTRE-SITE/api/stripe/webhook`, événements `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`. Copier le « Signing secret » dans `STRIPE_WEBHOOK_SECRET`.
4. Redéployer. Dans Administration > Réglages, décocher « Mode test ».

Paiements hors ligne (virement, espèces…) : Administration > Professionnels > « Enregistrer un paiement ».

## Agent Instagram (Administration > Instagram)

Pour chaque chantier ouvert, l'agent prépare automatiquement un post Instagram :

- **Visuel** 1080 × 1350 (format portrait) aux couleurs du site : métier, titre, ville, budget arrondi, délai, places restantes.
- **Légende** prête à publier avec hashtags adaptés au métier, à la ville et au département (modifiable avant publication).
- **Aucune donnée client** n'est publiée : ni nom, ni téléphone, ni adresse, ni description complète. Le budget est arrondi.

Sans configuration : boutons « Télécharger l'image » et « Copier la légende » pour publier depuis le téléphone, puis « Marquer comme publié » pour le suivi.

### Publication en un clic (API Instagram)

Prérequis : un compte Instagram **professionnel** (Business ou Créateur).

1. Sur developers.facebook.com, créer une app de type « Business » et ajouter le produit **Instagram** (« API Instagram avec connexion Instagram »).
2. Ajouter votre compte Instagram, accorder la permission `instagram_business_content_publish` et générer un jeton d'accès (longue durée, 60 jours).
3. Dans Netlify, ajouter les variables :

| Variable | Rôle |
| --- | --- |
| `INSTAGRAM_USER_ID` | Identifiant du compte Instagram professionnel (affiché à côté du jeton) |
| `INSTAGRAM_ACCESS_TOKEN` | Jeton d'accès (secret) |
| `INSTAGRAM_GRAPH_HOST` | Facultatif. `graph.instagram.com` par défaut ; mettre `graph.facebook.com` si le compte est relié via une Page Facebook |

4. Redéployer. Le bouton « Publier sur Instagram » apparaît. Le visuel est servi publiquement à `/api/ig/ID.jpg` pour qu'Instagram puisse le télécharger.

Le jeton expire au bout de 60 jours : pensez à le renouveler (ou à le rafraîchir via l'API) et à mettre à jour la variable.

## Agent YouTube (Administration > YouTube)

Pour chaque chantier ouvert, l'agent crée un **YouTube Short** :

- **Vidéo** verticale 1080 × 1920 de 12 secondes, animée (étiquette, métier, titre, infos une par une, appel à l'action). Elle est fabriquée directement dans le navigateur (MP4 sur Chrome/Edge récents, WebM sinon), sans logiciel de montage. Pas de son.
- **Titre** (100 caractères max, avec `#Shorts`), **description** avec liens vers le chantier et le site, **tags** adaptés au métier et à la ville. Tout est modifiable avant l'envoi.
- **Aucune donnée client** n'est publiée, le budget est arrondi.

Sans configuration : « Créer et télécharger la vidéo » puis « Copier titre + description » pour la mettre en ligne depuis YouTube Studio, puis « Marquer comme publié ».

### Publication en un clic (API YouTube Data v3)

1. Sur console.cloud.google.com : créer un projet, activer **YouTube Data API v3**.
2. « Écran de consentement OAuth » : type Externe, ajouter votre adresse Google comme utilisateur test.
3. « Identifiants » > Créer un **ID client OAuth** de type « Application Web », avec `https://developers.google.com/oauthplayground` comme URI de redirection autorisée.
4. Sur developers.google.com/oauthplayground : roue dentée > « Use your own OAuth credentials » (coller l'ID et le secret), choisir le scope `https://www.googleapis.com/auth/youtube.upload`, autoriser avec le compte de la chaîne, puis « Exchange authorization code for tokens » et copier le **refresh token**.
5. Dans Netlify, ajouter les variables :

| Variable | Rôle |
| --- | --- |
| `YOUTUBE_CLIENT_ID` | ID client OAuth |
| `YOUTUBE_CLIENT_SECRET` | Secret client OAuth (secret) |
| `YOUTUBE_REFRESH_TOKEN` | Jeton de rafraîchissement (secret) |

6. Redéployer. Le bouton « Créer et publier sur YouTube » apparaît.

À savoir :
- Tant que le projet Google n'a pas été **vérifié** par Google (audit de l'API), les vidéos envoyées par l'API restent **privées**. Passez-les en public dans YouTube Studio, ou demandez l'audit (formulaire « YouTube API Services – Audit »).
- Si l'écran de consentement reste en mode « Test », le refresh token expire au bout de 7 jours. Passez l'application « En production » pour qu'il dure.
- Quota gratuit : 10 000 unités/jour, un envoi en coûte 1 600, soit environ 6 Shorts par jour.
