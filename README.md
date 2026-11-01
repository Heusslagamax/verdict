# Verdict — cockpit Meta Ads + radar concurrents

Cockpit privé pour deux personnes : chaque ad de tes campagnes avec sa créa, ses chiffres en
direct et un verdict (garder, itérer, couper, surveiller, attendre) tiré des règles Zecom ; en
face, les ads de tes concurrents relevées chaque jour dans TrendTrack (celles qui montent, les
validées, les coupées) et celles que tu peux récupérer, script comparé par l'IA.

**Lecture seule sur Meta** : le cockpit n'a aucun droit d'écriture, il ne touche jamais au budget.

## Ce qu'il y a dedans

| Écran | Ce qu'il répond |
| --- | --- |
| Cockpit | Que dit la campagne aujourd'hui (palier, scénario Zecom), et que fais-je de chaque ad ? |
| Radar concurrents | Quelles créas concurrentes reprendre, lesquelles montent, lesquelles viennent d'être coupées ? |
| Brief IA | Le résumé du matin, généré chaque matin vers 6 h 30 (heure de Paris en hiver) à partir des verdicts du moteur. |
| Réglages | Seuils ROAS par boutique (avec calculateur), colonnes du P&L, concurrents, état des branchements. |

### Les règles appliquées

- **Campagne** (`src/lib/engine/verdict.ts`) : arbre J1 / J2 / J4 en testing (50, 100, 200 €
  cumulés), puis scénarios de scaling 1 à 4 sur le ROAS 3 jours et d'hier. Le ROAS vient de ton
  P&L (onglet DAILY REPORT) dès qu'il est branché ; sinon de Meta, et l'écran le signale.
- **Ad dans une CBO** : la méthode juge la campagne, pas l'ad isolée. Le moteur applique donc les
  règles CBO de Zecom : 3 jours avant de juger une nouvelle créa, on ne coupe pas un milieu de
  terrain d'une campagne rentable, on garde et on décline les attaquants, et les seuils J2
  (ROAS < 1, coût/ATC > 20 % de l'AOV) pour couper.
- **Seuils** : formules de ton fichier « Calcul ROAS BE & TARGET ». Le « ROAS −20 % » y vaut
  1 / (m + 0,20) (1,34 pour Norveline), et non BE × 0,8 : c'est ton fichier qui fait foi.
- **Concurrents** (`src/lib/engine/competitors.ts`) : « monte » = +10 rangs ou +30 % de portée en
  7 jours ; « validée » = 14 jours de diffusion et top 10 de la page (ou 100 k de portée) ;
  « coupée » = passée inactive depuis le relevé précédent. « À récupérer » exige un script
  différent de ce qui est déjà testé (ou une itération), jamais une simple comparaison d'image.

Tests du moteur, sur les exemples chiffrés de la formation et sur ta ligne Norveline : `npm test`.

## Comptes et espaces

Verdict est multi-espaces. Chaque espace a ses boutiques, ses concurrents, ses seuils et
**ses propres clés** Meta, TrendTrack et Anthropic. Aucun espace ne voit les données d'un autre.

- **Accès sur invitation uniquement.** Un administrateur (page **Admin**) ouvre l'accès à un
  nouvel e-mail. L'espace de cette personne est créé, vide, à sa première connexion.
- **Membres.** Un propriétaire invite des membres dans son espace (Réglages → Membres). Un
  membre consulte, marque les créas et colle des scripts. Un propriétaire gère aussi les clés,
  les boutiques et les membres.
- **Clés.** Elles se collent dans Réglages → Connexions. Chacune est vérifiée auprès du
  service avant d'être enregistrée, puis chiffrée (AES-256-GCM). Seuls les 4 derniers
  caractères restent visibles.
- **P&L.** Chaque espace colle le lien de son Google Sheets et le partage en lecture avec
  l'adresse du compte de service de la plateforme, affichée dans Réglages → Espace.
- **Plusieurs espaces.** Une personne peut appartenir à plusieurs espaces : le sélecteur en
  haut à gauche permet de passer de l'un à l'autre.

## Variables de la plateforme (Vercel)

| Variable | Rôle |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Base et connexion (type Config). |
| `SUPABASE_SECRET_KEY` | Accès serveur à la base (type Secret). |
| `ENCRYPTION_KEY` | Facultatif : 32 octets en base64 pour chiffrer les clés des espaces. Sans elle, une clé est dérivée de `SUPABASE_SECRET_KEY`. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Compte de service Google en lecture seule, pour lire les P&L. |
| `CRON_SECRET` | Protège la tâche du matin. |
| `ANTHROPIC_MODEL`, `TRENDTRACK_ROWS`, `META_GRAPH_VERSION` | Facultatifs, valeurs par défaut correctes. |

Les clés Meta, TrendTrack et Anthropic ne vont **pas** dans Vercel : chaque espace saisit les
siennes dans l'application.

## Base de données

Les migrations sont dans `supabase/migrations/`, à appliquer dans l'ordre (SQL Editor) sur un
nouveau projet. `0004_workspaces.sql` reprend l'existant dans un premier espace.

## Lancer en local

```bash
npm install
cp .env.example .env.local   # sans Supabase : mode démo, données fictives
npm run dev                  # http://localhost:3000
```

## Architecture

- Next.js 16 (App Router, `src/proxy.ts` pour la session), React 19, Tailwind 4, Radix.
- Supabase : connexion par lien magique sur invitation, espaces et membres, RLS par
  appartenance sur toutes les tables, clés des services chiffrées (`src/lib/crypto.ts`).
- `src/lib/workspace.ts` : qui est connecté, espace actif (cookie), clés de l'espace. Toute
  page et toute action passent par là avant de lire ou d'écrire.
- `src/lib/adapters/` : Meta (API Marketing v26, lecture seule), TrendTrack (REST, normaliseur
  tolérant), Google Sheets (P&L), Anthropic (sorties structurées validées par zod).
- `src/lib/engine/` : fonctions pures, testées, sans accès réseau.
- `src/lib/data/` : lecture, synchronisation (Meta resynchronisé à l'ouverture si plus vieux que
  10 min), vues calculées pour l'interface.
- La méthode Pelegrini s'ajoutera comme un second jeu de règles dans `src/lib/engine/`.
