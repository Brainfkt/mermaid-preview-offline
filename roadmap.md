# Roadmap — Mermaid Preview Offline 1.0

## v0.2.1 — Finition et stabilité

- [x] Restaurer précisément le zoom, la position et le mode Source de chaque onglet.
- [x] Conserver l’état des aperçus après un redémarrage de VS Code.
- [x] Ajouter une commande explicite « Open Preview to the Side ».
- [x] Ajouter les actions d’aperçu au menu contextuel de l’Explorateur.
- [x] Permettre de choisir l’éditeur par défaut pour `.mmd` et `.mermaid`.
- [x] Améliorer les messages d’erreur Mermaid avec ligne, colonne et extrait concerné.
- [x] Ajouter un bouton de nouvelle tentative après une erreur.
- [x] Annuler les rendus obsolètes pendant une saisie rapide.
- [x] Configurer le délai de rafraîchissement automatique.
- [x] Ajouter un mode de rafraîchissement manuel.
- [x] Améliorer le comportement avec les fichiers très volumineux.
- [x] Supprimer la mention « Local » dans l’aperçu.
- [x] Moderniser l’interface avec un glassmorphism minimal.
- [x] Permettre de choisir plusieurs thèmes de couleurs pour les diagrammes.
- [x] Garantir le fonctionnement avec les espaces de travail multi-dossiers.
- [x] Tester Windows, macOS, Linux, WSL, SSH et Dev Containers.
- [x] Ajouter des tests visuels de non-régression pour chaque type de diagramme.
- [x] Ajouter des tests automatiques sur les thèmes clair, sombre et contraste élevé.

## v0.3 — Expérience d’édition avancée

- [x] Afficher les erreurs dans le panneau Problems de VS Code.
- [x] Souligner les erreurs directement dans l’éditeur.
- [x] Ajouter des corrections rapides pour les erreurs fréquentes.
- [x] Proposer l’autocomplétion des mots-clés Mermaid.
- [x] Ajouter des snippets pour chaque famille de diagrammes.
- [x] Fournir une documentation contextuelle au survol des mots-clés.
- [x] Ajouter une commande de formatage Mermaid.
- [x] Ajouter une commande pour insérer rapidement un nouveau nœud ou lien.
- [x] Générer automatiquement les identifiants manquants.
- [x] Renommer un identifiant dans tout le diagramme.
- [x] Proposer un mode Source vertical ou horizontal.
- [x] Permettre de modifier la proportion entre source et aperçu.
- [x] Ajouter un mode aperçu seul, source seule et partagé.

## v0.4 — Navigation et lecture

- [x] Ajouter une minimap en bas à droite pour les grands diagrammes.
- [x] Ajouter un mode plein écran.
- [x] Afficher la taille réelle du fichier
- [x] Améliorer comportement Preview Mode / Split Mode

## v0.5 — Export professionnel

- [x] Exporter en PNG.
- [x] Exporter en WebP.
- [x] Exporter en PDF.
- [x] Copier directement une image PNG dans le presse-papiers.
- [x] Configurer la résolution et le facteur d’échelle.
- [x] Choisir un fond transparent ou coloré.
- [x] Définir les marges autour du diagramme.
- [x] Exporter tous les fichiers Mermaid d’un dossier.
- [x] Ajouter une commande d’export utilisable dans les tâches VS Code.
- [x] Fournir une CLI d’export hors ligne.
- [x] Prévisualiser le résultat avant l’export.
- [x] Mémoriser des profils d’export.
- [x] Copier le SVG optimisé ou le SVG original.
- [x] Optimiser automatiquement les SVG exportés.
- [x] Ajouter les métadonnées du fichier source dans l’export.
- [x] Exporter avec un thème différent de celui de VS Code.
- [x] Ajouter un nom de fichier configurable par modèle.

## v0.6 — Gestion de projet et productivité

- [x] Créer un nouveau diagramme depuis une galerie de modèles.
- [x] Ajouter un explorateur visuel des exemples Mermaid.
- [x] Générer un fichier Mermaid depuis un modèle personnalisable.
- [x] Afficher les différences visuelles entre deux versions Git.
- [x] Générer un aperçu avant/après dans l’éditeur de diff.

## v0.7 — Markdown et documentation

- [x] Prévisualiser le bloc Mermaid sous le curseur dans un fichier Markdown.
- [x] Afficher tous les blocs Mermaid d’un document Markdown.
- [x] Remplacer les blocs Mermaid par des images lors d’un export.
- [x] Supporter les blocs Mermaid dans MDX.
- [x] Supporter les blocs Mermaid dans AsciiDoc.
- [x] Naviguer du diagramme vers son bloc source.

## v1.0 — Version de référence

- [x] Stabiliser toutes les commandes et tous les paramètres.
- [x] Garantir la restauration complète des sessions.
- [x] Stabiliser le rendu des exports sur macOS, Windows et Linux.
- [x] Couvrir chaque diagramme pris en charge par un test visuel.
- [x] Fournir une documentation complète et localisée.
- [x] Inclure une galerie de modèles professionnels.
- [x] Publier des engagements clairs de confidentialité et de compatibilité.
- [x] Atteindre une ouverture instantanée sur les diagrammes courants.
- [x] Garantir des exports autonomes et des SVG optimisés reproductibles.
- [x] Génération d’ERD depuis un schéma SQL local.
- [x] Génération d’un graphe de dépendances depuis `package.json`.
- [x] Inviter dans l'app à laisser un avis sur le marketplace.
