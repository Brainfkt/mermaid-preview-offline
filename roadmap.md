# Roadmap — Mermaid Preview Offline à partir de la v0.2.1

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

- [ ] Ajouter une minimap pour les grands diagrammes.
- [ ] Ajouter un mode plein écran.
- [ ] Ajouter un mode présentation sans interface.
- [ ] Masquer automatiquement la barre d’outils.
- [ ] Ajouter une grille optionnelle.
- [ ] Ajouter des repères d’alignement.
- [ ] Afficher la taille réelle du diagramme.
- [ ] Permettre de verrouiller la position et le zoom.
- [ ] Synchroniser le zoom de plusieurs aperçus côte à côte.
- [ ] Ajouter un mode comparaison entre deux diagrammes.

## v0.5 — Export professionnel

- [ ] Exporter en PNG.
- [ ] Exporter en WebP.
- [ ] Exporter en PDF.
- [ ] Copier directement une image PNG dans le presse-papiers.
- [ ] Configurer la résolution et le facteur d’échelle.
- [ ] Choisir un fond transparent ou coloré.
- [ ] Définir les marges autour du diagramme.
- [ ] Exporter uniquement la zone sélectionnée.
- [ ] Exporter tous les fichiers Mermaid d’un dossier.
- [ ] Ajouter une commande d’export utilisable dans les tâches VS Code.
- [ ] Fournir une CLI d’export hors ligne.
- [ ] Exporter une page HTML autonome.
- [ ] Intégrer les images, icônes, styles et polices dans les exports.
- [ ] Prévisualiser le résultat avant l’export.
- [ ] Mémoriser des profils d’export.
- [ ] Copier le SVG optimisé ou le SVG original.
- [ ] Optimiser automatiquement les SVG exportés.
- [ ] Ajouter les métadonnées du fichier source dans l’export.
- [ ] Exporter avec un thème différent de celui de VS Code.
- [ ] Ajouter un nom de fichier configurable par modèle.

## v0.6 — Thèmes et personnalisation

- [ ] Ajouter un sélecteur de thème Mermaid dans la barre d’outils.
- [ ] Fournir plusieurs thèmes intégrés.
- [ ] Créer un éditeur visuel de variables de thème.
- [ ] Prévisualiser instantanément les couleurs modifiées.
- [ ] Enregistrer des thèmes au niveau utilisateur ou workspace.
- [ ] Importer et exporter des thèmes JSON.
- [ ] Définir un thème différent selon le type de diagramme.
- [ ] Personnaliser la police, la taille du texte et l’espacement.
- [ ] Charger des polices locales de manière sécurisée.
- [ ] Ajouter des packs d’icônes hors ligne optionnels.
- [ ] Enregistrer des packs Iconify personnalisés.
- [ ] Supporter des icônes SVG locales personnalisées.
- [ ] Configurer la couleur du canvas et de la grille.
- [ ] Ajouter un mode d’impression à contraste renforcé.
- [ ] Respecter le réglage VS Code de réduction des animations.
- [ ] Prévisualiser simultanément un diagramme dans plusieurs thèmes.

## v0.7 — Gestion de projet et productivité

- [ ] Créer un nouveau diagramme depuis une galerie de modèles.
- [ ] Ajouter un explorateur visuel des exemples Mermaid.
- [ ] Générer un fichier Mermaid depuis un modèle personnalisable.
- [ ] Afficher toutes les miniatures Mermaid d’un dossier.
- [ ] Ajouter une vue Gallery pour parcourir un projet.
- [ ] Générer un index HTML de tous les diagrammes.
- [ ] Détecter les liens et images locales manquants.
- [ ] Renommer ou déplacer les ressources sans casser les références.
- [ ] Ajouter des favoris et diagrammes récents.
- [ ] Épingler certains aperçus.
- [ ] Ajouter des tags et descriptions dans le frontmatter.
- [ ] Rechercher dans les titres, nœuds et métadonnées.
- [ ] Appliquer une configuration Mermaid commune au workspace.
- [ ] Autoriser une configuration spécifique par fichier.
- [ ] Ajouter des profils de projet.
- [ ] Afficher les différences visuelles entre deux versions Git.
- [ ] Générer un aperçu avant/après dans l’éditeur de diff.
- [ ] Ajouter une commande « Export changed diagrams ».
- [ ] Vérifier tous les diagrammes avant un commit.
- [ ] Fournir une tâche CI hors ligne pour valider et exporter les diagrammes.

## v0.8 — Markdown et documentation

- [ ] Prévisualiser le bloc Mermaid sous le curseur dans un fichier Markdown.
- [ ] Afficher tous les blocs Mermaid d’un document Markdown.
- [ ] Exporter les diagrammes d’un README.
- [ ] Remplacer les blocs Mermaid par des images lors d’un export.
- [ ] Supporter les blocs Mermaid dans MDX.
- [ ] Supporter les blocs Mermaid dans AsciiDoc.
- [ ] Naviguer du diagramme vers son bloc source.
- [ ] Mettre à jour uniquement le bloc modifié.
- [ ] Générer une documentation HTML statique complète.
- [ ] Ajouter des légendes et textes alternatifs aux exports.
- [ ] Vérifier que chaque diagramme possède une description accessible.
- [ ] Générer automatiquement une table des diagrammes du projet.

## v0.9 — Accessibilité et internationalisation

- [ ] Rendre toute la barre d’outils accessible au clavier.
- [ ] Ajouter des labels complets pour les lecteurs d’écran.
- [ ] Fournir une représentation textuelle structurée du diagramme.
- [ ] Naviguer entre les nœuds au clavier.
- [ ] Annoncer les erreurs et changements de rendu.
- [ ] Améliorer les contrastes de l’interface.
- [ ] Ajouter un mode daltonisme.
- [ ] Personnaliser la taille de l’interface.
- [ ] Respecter les préférences d’animation du système.
- [ ] Traduire l’extension en français.
- [ ] Préparer l’extension pour d’autres traductions.
- [ ] Détecter automatiquement la langue de VS Code.
- [ ] Localiser les commandes, paramètres, erreurs et écrans d’accueil.
- [ ] Ajouter une documentation accessible pour chaque raccourci.

## v0.10 — Performance, sécurité et fiabilité

- [ ] Déplacer le rendu dans un worker dédié.
- [ ] Charger Mermaid et ses plug-ins à la demande.
- [ ] Mettre en cache les diagrammes inchangés.
- [ ] Réduire la taille du bundle.
- [ ] Libérer automatiquement les aperçus inactifs.
- [ ] Ajouter des benchmarks pour les diagrammes complexes.
- [ ] Afficher un avertissement lorsque le rendu devient anormalement coûteux.
- [ ] Ajouter un mode de diagnostic entièrement local.
- [ ] Mesurer localement les étapes du rendu sans télémétrie.
- [ ] Respecter complètement VS Code Workspace Trust.
- [ ] Demander confirmation avant d’ouvrir les liens externes.
- [ ] Renforcer la validation des SVG et images locales.
- [ ] Tester automatiquement les traversées de chemins.
- [ ] Générer un SBOM pour chaque version.
- [ ] Signer et vérifier les artefacts de publication.
- [ ] Automatiser les audits de dépendances.
- [ ] Tester la CSP et l’absence totale de requêtes réseau.
- [ ] Ajouter des tests de mémoire et de fuite des webviews.
- [ ] Prévoir une stratégie de mise à jour contrôlée de Mermaid.
- [ ] Publier une matrice de compatibilité générée automatiquement.

## v1.0 — Version de référence

- [ ] Stabiliser toutes les commandes et tous les paramètres.
- [ ] Garantir la restauration complète des sessions.
- [ ] Garantir l’export identique sur macOS, Windows et Linux.
- [ ] Couvrir chaque diagramme pris en charge par un test visuel.
- [ ] Fournir une documentation complète et localisée.
- [ ] Ajouter un écran d’accueil interactif.
- [ ] Proposer une visite guidée au premier lancement.
- [ ] Inclure une galerie de modèles professionnels.
- [ ] Finaliser l’accessibilité clavier et lecteur d’écran.
- [ ] Publier des engagements clairs de confidentialité et de compatibilité.
- [ ] Fournir une procédure de migration entre versions.
- [ ] Atteindre une ouverture instantanée sur les diagrammes courants.
- [ ] Ne déclencher aucune connexion réseau à l’exécution.
- [ ] Garantir des exports autonomes et reproductibles.
- [ ] Obtenir une expérience cohérente dans VS Code Desktop et les environnements distants.

## Idées expérimentales après la v1.0

- [ ] Éditeur visuel optionnel par glisser-déposer.
- [ ] Création de liens entre nœuds à la souris.
- [ ] Conversion des modifications visuelles en code Mermaid.
- [ ] Animation contrôlée des diagrammes.
- [ ] Mode présentation avec étapes successives.
- [ ] Diagrammes paramétrables à partir de fichiers JSON, YAML ou CSV locaux.
- [ ] Génération d’ERD depuis un schéma SQL local.
- [ ] Génération de diagrammes de classes depuis un projet local.
- [ ] Génération d’un graphe de dépendances depuis `package.json`.
- [ ] Génération de diagrammes d’architecture depuis des fichiers de configuration.
- [ ] API d’extension pour ajouter des renderers hors ligne.
- [ ] Système de plug-ins locaux vérifiés.
- [ ] Partage de thèmes et modèles sous forme de fichiers.
- [ ] Comparaison sémantique de deux diagrammes.
- [ ] Détection des nœuds orphelins ou inaccessibles.
- [ ] Analyse de complexité d’un diagramme.
- [ ] Suggestions locales d’amélioration de lisibilité.
- [ ] Mode storyboard pour enchaîner plusieurs diagrammes.
- [ ] Création de collections de diagrammes exportables.
- [ ] Génération de packages de documentation entièrement hors ligne.
