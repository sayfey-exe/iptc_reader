# Lecteur IPTC

Application locale, 100% dans le navigateur, pour lire les métadonnées IPTC d'images.

## Fonctionnalités

- Glisser-déposer une ou plusieurs images, ou un/plusieurs dossiers (y compris avec des sous-dossiers imbriqués) — les fichiers non-images sont ignorés automatiquement.
- Boutons "Choisir des images" / "Choisir un dossier" en alternative au glisser-déposer.
- Navigation entre les images avec les flèches ◀ ▶ (ou les touches gauche/droite du clavier).
- Pellicule de miniatures cliquables en bas, triée par nom/chemin.
- Ajout d'images ou de dossiers supplémentaires à tout moment via "+ Images" / "+ Dossier".

## Utilisation

Aucune installation ni build n'est nécessaire : tout tourne côté client dans le navigateur avec [exifr](https://github.com/MikeKovarik/exifr) (fourni dans `vendor/exifr.js`).

Deux façons de l'ouvrir :

1. **Directement** : double-cliquez sur `index.html` pour l'ouvrir dans votre navigateur.
2. **Via un petit serveur local** (recommandé si le glisser-déposer ne fonctionne pas en `file://`) :
   ```bash
   npm start
   ```
   puis ouvrez http://localhost:8080.

Aucune image n'est envoyée où que ce soit : tout le traitement se fait localement dans le navigateur.
