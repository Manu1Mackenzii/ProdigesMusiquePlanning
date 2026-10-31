# Prodiges Musique — sauvegarde partagée

Le site conserve le thème blanc, le logo et le planning validés. Les changements de disponibilités, de dates et titres des cultes et de réservations studio sont envoyés à Supabase via Netlify Functions.

## Ce qui est prêt

- Disponibilités publiques, édition de sa ligne après vérification du PIN par le serveur.
- Administrateur : accès au planning et à l'annuaire, modification de toutes les lignes, dates/titres des cultes et réservations studio.
- Réponses enregistrées cellule par cellule. Deux membres ne remplacent pas leurs réponses respectives.
- Mois séparés pour les disponibilités et le studio. Nouveaux statuts : « À définir ».
- Contrôle de révision pour les dates et les réservations : une modification concurrente produit un message demandant d'actualiser.
- Actualisation des disponibilités toutes les 30 secondes, hors édition des dates. Le calendrier studio se recharge lorsqu'il est affiché ; actualiser la page permet de récupérer l'ensemble des changements.
- PIN hachés, session signée pendant 8 heures dans un cookie HttpOnly. Les PIN et les affectations privées ne sont plus inscrits dans le HTML public.
- Limitation à 10 tentatives de connexion en 15 minutes par adresse et par identité.

## 1. Créer la base Supabase

1. Sur https://supabase.com/dashboard, créer un projet, choisir une région proche des utilisateurs et conserver le mot de passe de base dans votre gestionnaire de mots de passe.
2. Ouvrir **SQL Editor**, créer une requête, coller puis exécuter `database/01_schema.sql`.
3. Ouvrir le fichier `configuration-privee/02_initialisation_privee.sql` fourni à côté de ce dossier. Coller et exécuter son contenu dans une seconde requête SQL. Ce fichier contient les membres et les données initiales, avec les PIN hachés.
4. Dans **Table Editor**, vérifier `pm_members` (88 entrées de la dernière v5), `pm_months` (novembre 2026), `pm_studio` (réservations initiales) et `pm_settings` (planning validé).
5. Dans les paramètres du projet / clés API, relever **Project URL** et une **Secret key** serveur (`sb_secret_...`). Elles seront renseignées dans Netlify uniquement. La clé publique publishable ne remplace pas cette clé serveur dans cette application.

Les politiques RLS sont activées et les rôles visiteurs/membres Supabase n'ont aucun accès direct aux tables. Les fonctions Netlify vérifient les droits avant d'utiliser la clé serveur. Il n'y a pas de compte Supabase Auth individuel à créer pour chaque membre.

L'initialisation ne remplace pas les données existantes si vous la relancez. Les changements déjà présents uniquement dans votre ancien navigateur ne sont pas importés automatiquement. Les données initiales sont celles de la dernière v5 fournie. La liste actuelle contient 88 entrées, conformément à cette v5.

## 2. Mettre le code sur GitHub

Créer un dépôt **privé** nommé par exemple `prodiges-musique`. Le dossier à envoyer est **le contenu de `prodiges-musique` uniquement** : `public`, `netlify`, `database/01_schema.sql`, `netlify.toml`, `package.json`, `tests`, `.gitignore`, `.env.example` et ce guide.

**Ne pas envoyer le dossier `configuration-privee` sur GitHub**, même avec « Upload files ». Ne pas déposer les anciens HTML contenant les codes PIN ni un fichier `.env` avec des secrets.

Avec GitHub Desktop : ajouter le dossier `prodiges-musique`, faire un premier commit puis **Publish repository**, en conservant le dépôt privé.

Ou, dans le terminal ouvert dans le dossier `prodiges-musique` :

```bash
git init -b main
git add .
git commit -m "Site PM avec sauvegarde partagée"
git remote add origin https://github.com/VOTRE-COMPTE/prodiges-musique.git
git push -u origin main
```

Remplacer `VOTRE-COMPTE` par le compte choisi. Ces commandes ne sont pas nécessaires si vous utilisez GitHub Desktop.

## 3. Relier GitHub à Netlify

1. Dans Netlify, **Add new project → Import an existing project → GitHub**.
2. Autoriser l'accès au dépôt privé puis sélectionner `prodiges-musique`.
3. Branche : `main`. Base directory : vide si les fichiers sont à la racine du dépôt.
4. Build command : laisser vide. Publish directory : `public`. Functions directory : `netlify/functions`. Le fichier `netlify.toml` définit déjà ces répertoires.
5. Ajouter les quatre variables ci-dessous dans les variables d'environnement du projet Netlify, avec accès au contexte Production et aux Functions. Si les variables sont ajoutées après un premier déploiement, relancer un déploiement.

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | URL du projet Supabase, par exemple `https://xxxx.supabase.co` |
| `SUPABASE_SECRET_KEY` | Clé serveur secrète Supabase `sb_secret_...` |
| `ADMIN_PASSWORD` | Nouveau mot de passe de 12 caractères minimum choisi pour le pôle organisation |
| `SESSION_SECRET` | Secret aléatoire d'au moins 64 caractères |

Pour produire `SESSION_SECRET` sur votre ordinateur avec Node.js :

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Copier le résultat dans Netlify ; ne pas le mettre dans un fichier du dépôt. Le mot de passe administrateur `1234` de la maquette est remplacé par `ADMIN_PASSWORD`.

6. Lancer **Deploy** puis ouvrir le lien HTTPS fourni par Netlify.
7. Dans **Functions**, vérifier que `api` est présente. Un simple dépôt du HTML via Netlify Drop ne déploie pas ce backend : utiliser la liaison au dépôt GitHub.

## 4. Vérifier la sauvegarde réellement partagée

1. Ouvrir le site dans une fenêtre et dans une fenêtre privée.
2. Dans la première, sélectionner un membre et entrer son PIN existant (1001 à 1088, suivant la liste déjà transmise). Modifier une disponibilité.
3. Le message doit indiquer **« Enregistré et partagé »**. Actualiser la deuxième fenêtre : elle doit afficher la même réponse.
4. Se connecter au pôle organisation avec `ADMIN_PASSWORD`, modifier un titre/date de culte et enregistrer. Vérifier dans la deuxième fenêtre après actualisation.
5. Réserver un jour du studio, actualiser et vérifier depuis une deuxième session administrateur. Un seul créneau par jour est conservé dans cette version, comme dans v5.
6. Sans connexion administrateur, le planning privé et les réservations ne doivent pas être retournés par l'API. Un membre ne peut écrire que sa propre ligne.
7. Faire un test de conflit : deux responsables ouvrent les mêmes dates, le premier enregistre ; le second doit recevoir un message de conflit lorsqu'il enregistre sa version ancienne.

## Fonctionnement quotidien

Les changements de contenu s'enregistrent dans la base. **Il n'est pas nécessaire de modifier GitHub ou de redéployer pour une disponibilité ou une réservation.** GitHub sert à conserver le code. Un changement du code poussé sur `main` déclenche un nouveau déploiement Netlify, sans réinitialiser les données Supabase.

La session expire après 8 heures. Se reconnecter au besoin. Pour revenir du mode administrateur au mode membre, utiliser le bouton du haut : il déconnecte la session serveur.

Les données du planning des équipes sont chargées depuis `pm_settings`, clé `planning`. Cette version ne propose pas d'éditeur d'affectations : les ajustements s'effectuent dans cette table ou par une future interface dédiée.

Les anciens PIN numériques sont conservés pour faciliter le passage au site partagé. Un code personnel peut être remplacé par l'administrateur dans `pm_members.pin_hash`, avec une nouvelle valeur hachée : ne jamais mettre le PIN en clair dans cette colonne. Une interface de renouvellement des codes n'est pas incluse.

## Tests et limites vérifiées

Exécuter `npm test` avec Node.js 22 ou supérieur. Les tests couvrent les droits, les sessions, les PIN, les dates, les conflits et l'écriture par cellule avec une base simulée.

Le projet n'est pas encore configuré sur votre Supabase, poussé sur votre GitHub ni déployé sur votre Netlify. Les tests de bout en bout contre vos services devront être effectués après configuration. Le HTML ne se lance plus seul en double-cliquant : il attend les fonctions Netlify.

## Sources officielles utilisées

- https://docs.netlify.com/start/quickstarts/deploy-from-repository/
- https://docs.netlify.com/build/functions/environment-variables/
- https://docs.netlify.com/build/functions/get-started/
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/getting-started/api-keys
