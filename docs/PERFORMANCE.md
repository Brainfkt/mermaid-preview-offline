# Revue des performances — version 1.0

Cette revue couvre les chemins d’exécution de l’aperçu VS Code, du Diagram
Studio, des aperçus de documentation, des différences visuelles, des exports et
de la CLI. Elle exclut volontairement la revue cyber, conformément au périmètre
de la version 1.0.

## Résultat

| Indicateur | v0.7 | v1.0 | Évolution |
|---|---:|---:|---:|
| JavaScript des quatre moteurs web embarqués | ~59,6 Mio | 14,21 Mio | −76 % |
| VSIX final | 20 913 638 octets | 6 807 763 octets | −67 % |
| Budget de build automatisé | aucun | 20 Mio maximum | régression bloquante |
| Remplacement de 2 000 blocs dans un document de plus de 4 Mio | algorithme à recopies répétées | 18–38 ms | travail linéaire |
| Diff de 20 000 à 50 000 lignes | risque quadratique | 41–74 ms | travail borné |

Les valeurs temporelles sont des mesures locales de microbenchmarks et peuvent
varier selon la machine. Les tailles sont celles des artefacts produits lors de
la préparation de la version 1.0.

## Correctifs appliqués

### Chargement et taille du paquet

- Les quatre moteurs navigateur utilisent maintenant des modules ES partagés au
  lieu d’embarquer quatre copies complètes de Mermaid.
- Les implémentations de diagrammes Mermaid sont découpées en chunks et chargées
  à la demande.
- ZenUML et les deux collections Iconify ne sont chargés que lorsqu’un diagramme
  les utilise.
- La CLI charge directement le moteur modulaire local et ne transfère plus un
  script d’environ 15 Mio à Chromium par CDP à chaque lancement.
- Le build échoue si le JavaScript navigateur dépasse 20 Mio.

### Rendu interactif

- La validation suivie d’un rendu redondant a été remplacée par un seul appel de
  rendu Mermaid, qui fournit déjà les erreurs de syntaxe.
- Un aperçu Mermaid masqué ne relit plus le document, les images et le moteur à
  chaque frappe. Il reprend au premier affichage avec la version la plus récente.
- L’aperçu documentaire suit la même règle et annule les générations obsolètes.
- Le diff visuel rend une fois la version avant et une fois la version après,
  puis réutilise ces SVG pour l’overlay.
- La minimap emploie une URL Blob, met à jour son viewport au prochain frame et
  est désactivée au-delà de 5 Mio de SVG.
- L’activation automatique sur tout fichier Markdown, MDX ou AsciiDoc a été
  supprimée ; les commandes documentaires activent toujours l’extension à la
  demande.

### Algorithmes et mémoire

- Le remplacement des blocs documentaires reconstruit le résultat en un seul
  passage.
- Le calcul des statistiques de diff sélectionne un algorithme exact adapté à
  l’entrée et utilise un fallback déterministe lorsque le coût pathologique
  dépasserait son budget.
- Le prétraitement des blocs documentaires et le chargement des images utilisent
  une concurrence bornée.
- Le cache d’images locales est limité à 24 Mio et invalide une entrée lorsque sa
  taille ou sa date de modification change.
- Les exports documentaires limitent leur résultat Base64 cumulé afin d’éviter
  une agrégation non bornée dans la webview.

## Garde-fous mesurables

| Ressource | Limite v1.0 |
|---|---:|
| Source Mermaid rendue | 10 Mio UTF-8 |
| Images locales uniques par diagramme | 64 |
| Taille d’une image locale | 8 Mio |
| Images locales cumulées | 24 Mio |
| Concurrence de chargement d’images | 4 |
| Dimension raster maximale | 16 384 px par côté |
| Surface raster maximale | 32 000 000 pixels |
| Résultat Base64 d’un export ou d’un lot documentaire | 192 000 000 caractères |

Chaque dépassement produit un message demandant de réduire la source, le nombre
d’images, le facteur d’échelle ou le DPI. L’édition du fichier reste possible.

## Reproductibilité et plateformes

- Les identifiants Mermaid utilisent des seeds déterministes selon le contexte.
- Les exports SVG optimisés normalisent les identifiants internes et leurs
  références dans un ordre déterministe.
- Les métadonnées de source et d’heure sont désactivées par défaut ; elles
  restent disponibles en opt-in lorsque la traçabilité prime sur la
  reproductibilité octet par octet du SVG optimisé.
- Une police locale embarquée fixe les métriques de texte des aperçus et des
  exports optimisés sur macOS, Windows et Linux.
- À source et réglages identiques, le SVG optimisé sans métadonnées vise une
  sortie octet par octet reproductible. Les exports PNG, WebP et PDF restent
  visuellement stables, mais leurs octets peuvent varier avec la version et le
  codec du navigateur Chromium installé localement.
- Le rendu, les chunks, ZenUML, Iconify, les images intégrées et la police ne
  nécessitent aucun téléchargement à l’exécution.
- Le pipeline CI exécute la vérification sur macOS, Windows et Linux, puis les
  43 exemples dans trois familles de thème.

## Validation de release

- TypeScript : réussi.
- ESLint : réussi.
- Tests unitaires et d’intégration : 88/88 réussis.
- Build de production : réussi, 14,21 Mio sur le budget de 20 Mio.
- Package VSIX : réussi, 189 fichiers, 6,49 Mio compressés.
- Cohérence du lockfile en mode npm hors ligne : réussie.

Les tests nécessitant l’ouverture locale de Chromium n’ont pas été lancés dans
la session sans accès Trusted. Ils restent couverts par le pipeline visuel de la
release.
