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

## Mise en ligne, pas à pas (≈ 45 min)

Tu crées les comptes et colles les clés ; le code est prêt.

### 1. Mettre le code sur GitHub

1. Crée un dépôt **privé** sur github.com (par exemple `verdict`).
2. Dans le dossier du projet :
   ```bash
   git init && git add . && git commit -m "Verdict v1"
   git branch -M main
   git remote add origin https://github.com/<ton-compte>/verdict.git
   git push -u origin main
   ```

### 2. Supabase (base de données + connexion)

1. Crée un projet sur supabase.com, région Europe (Paris ou Francfort).
2. **SQL Editor** → colle le contenu de `supabase/migrations/0001_init.sql` → Run. Puis colle
   `supabase/seed.sql` → Run (tes deux boutiques, les seuils Norveline, BagIt, Inolyo et Stryde).
3. **Authentication → Sign In / Providers** : désactive « Allow new users to sign up ». Seuls
   les comptes que tu crées pourront entrer.
4. **Authentication → Users → Add user → Create new user** : ton e-mail, coche « Auto Confirm
   User ». Refais-le pour ton associé. Chaque compte créé devient membre automatiquement.
5. **Authentication → URL Configuration** : Site URL = l'adresse Vercel de l'étape 4 ; ajoute
   `https://<ton-domaine>/auth/confirm` dans « Redirect URLs ».
6. **Project Settings → API Keys** : note l'URL du projet, la clé « publishable » et la clé
   « secret ».

### 3. Les clés des services

- **Meta (lecture seule)** :
  1. developers.facebook.com → Créer une app de type « Business », rattachée au BM Moulay Agency.
  2. business.facebook.com → Paramètres → Utilisateurs système → Ajouter (rôle Employé).
  3. « Attribuer des éléments » : comptes pub « compte PUB1 » et « Movesana », permission
     « Voir les performances » seulement.
  4. « Générer un jeton » : choisis l'app, coche **ads_read** et rien d'autre, expiration
     « Jamais ». C'est `META_ACCESS_TOKEN`.
- **TrendTrack** : app.trendtrack.io → Workspace settings → API → nouvelle clé. Coût : environ
  3 × `TRENDTRACK_ROWS` crédits par concurrent et par relevé. Avec 3 concurrents et un relevé par
  jour, compte environ 4 000 crédits par mois sur tes 10 000, plus tes relevés manuels.
- **Anthropic** : console.anthropic.com → API Keys. Modèle par défaut : `claude-sonnet-5-5`.
- **P&L Google Sheets** :
  1. console.cloud.google.com → nouveau projet → active « Google Sheets API ».
  2. IAM → Comptes de service → Créer → onglet Clés → Ajouter une clé JSON.
  3. Ouvre « Copie de P&L - Zecom Academy » → Partager → colle l'e-mail du compte de service en
     **Lecteur**.
  4. `PNL_SPREADSHEET_ID` = `1G1Du9llysrNUx4rUHV-Ri79cfOzLW0B9iuPXuefy9Ps`.
  5. Colonnes déjà réglées : Norveline A, F, J, M ; Movesana A, W, AA, AD (modifiables dans Réglages).

### 4. Vercel (hébergement)

1. vercel.com → Add New → Project → importe le dépôt GitHub.
2. Avant « Deploy », ouvre « Environment Variables » et colle chaque ligne de `.env.example`
   avec tes valeurs. Pour `CRON_SECRET`, mets une longue chaîne aléatoire.
3. Deploy. Reporte l'adresse obtenue dans Supabase (étape 2.5).
4. La tâche du matin (`vercel.json`) tourne chaque jour à 5 h 30 UTC : relevé Meta, photo
   TrendTrack, comparaison IA des scripts, brief.

### 5. Premier contrôle

1. Connecte-toi : `/login`, lien reçu par e-mail.
2. **Réglages** : les cinq branchements doivent afficher « Branché ». Saisis les seuils de
   Movesana (calculateur intégré, ou ta ligne du fichier).
3. **Radar → Relever maintenant**. Pour vérifier la forme des données TrendTrack (1 crédit) :
   `/api/debug/trendtrack?bt=b624f76d-5a4d-4db5-9af3-a383b1ba269b`.
4. Dans le cockpit, ouvre une ad et colle son script : le radar ne te proposera plus de créa au
   script identique, même traduite.

## Lancer en local

```bash
npm install
cp .env.example .env.local   # sans Supabase : mode démo
npm run dev                  # http://localhost:3000
```

## Architecture

- Next.js 16 (App Router, `src/proxy.ts` pour la session), React 19, Tailwind 4, Radix.
- Supabase : connexion par lien magique, membres uniquement (RLS sur toutes les tables).
- `src/lib/adapters/` : Meta (API Marketing v26, lecture seule), TrendTrack (REST, normaliseur
  tolérant), Google Sheets (P&L), Anthropic (sorties structurées validées par zod).
- `src/lib/engine/` : fonctions pures, testées, sans accès réseau.
- `src/lib/data/` : lecture, synchronisation (Meta resynchronisé à l'ouverture si plus vieux que
  10 min), vues calculées pour l'interface.
- La méthode Pelegrini s'ajoutera comme un second jeu de règles dans `src/lib/engine/`.
