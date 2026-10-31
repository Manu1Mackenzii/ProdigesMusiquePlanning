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

## 2. Mettre le code sur GitHub

## 3. Relier GitHub à Netlify


## 4. Vérifier la sauvegarde réellement partagée

