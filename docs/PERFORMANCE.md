# Revue des performances — version 1.1.2

Cette revue couvre les chemins d’exécution de l’aperçu VS Code, du Diagram
Studio, des aperçus de documentation, des différences visuelles, des exports et
de la CLI. Elle exclut volontairement la revue cyber, conformément au périmètre
de la version 1.1.2.

## Résultat

| Indicateur | Référence | v1.1.2 | Évolution |
|---|---:|---:|---:|
| JavaScript des quatre moteurs web embarqués | ~59,6 Mio en v0.7 | 17,41 Mio | −71 % |
| VSIX final | 20 913 638 octets en v0.7 | 5 855 345 octets | −72 % |
| Budget de build automatisé | aucun en v0.7 | 20 Mio maximum | régression bloquante |
| Mise à jour d’un aperçu documentaire de 50 blocs | 283 ms avant optimisation | 33 ms | −88 % |
| Écritures tardives dans des cartes de galerie détachées | 19 avant optimisation | 0 | supprimées |
| Blob de minimap lorsque celle-ci reste masquée | ~263 Kio avant optimisation | 0 | allocation évitée |
| Validation statique d’une source de 10 Mio | 127 ms avant optimisation | ~52 ms | −59 % |
| Remplacement de 2 000 blocs dans un document de plus de 4 Mio | algorithme à recopies répétées en v0.7 | 18–38 ms | travail linéaire |
| Diff de 20 000 à 50 000 lignes | risque quadratique en v0.7 | 41–74 ms | travail borné |

Les valeurs temporelles sont des mesures locales de microbenchmarks et peuvent
varier selon la machine. Les tailles sont celles des artefacts produits lors de
la préparation des versions 1.1.0 et 1.1.2. Les quatre mesures propres à la
1.1.2 comparent, sur la même machine, le chemin antérieur et le chemin optimisé.

## Correctifs appliqués

### Chargement et taille du paquet

- Les quatre moteurs navigateur utilisent maintenant des modules ES partagés au
  lieu d’embarquer quatre copies complètes de Mermaid.
- Les implémentations de diagrammes Mermaid sont découpées en chunks et chargées
  à la demande.
- ZenUML, tidy-tree et les trois collections Iconify ne sont chargés ou
  enregistrés que lorsqu’un diagramme en a besoin.
- La CLI charge directement le moteur modulaire local et ne transfère plus un
  script d’environ 15 Mio à Chromium par CDP à chaque lancement.
- La CLI et les tâches utilisent le pipe de débogage natif de Chromium, avec
  framing borné et timeout de 15 secondes, y compris sous le Node.js 20 intégré
  aux versions de VS Code prises en charge.
- Les graisses normales Latin et Latin Extended de Noto Sans et Inter totalisent
  127 424 octets WOFF2 avant leur intégration au bundle. Elles sont partagées
  par les moteurs web et ne provoquent aucun chargement réseau au rendu.
- Les captures destinées au README et aux guides restent dans le dépôt public,
  mais sont exclues du VSIX par `.vscodeignore`. Le README Marketplace les
  charge depuis GitHub tandis que l’icône de l’extension reste embarquée.
- Le build échoue si le JavaScript navigateur dépasse 20 Mio.

### Rendu interactif

- La validation suivie d’un rendu redondant a été remplacée par un seul appel de
  rendu Mermaid, qui fournit déjà les erreurs de syntaxe.
- Un aperçu Mermaid masqué ne relit plus le document, les images et le moteur à
  chaque frappe. Il reprend au premier affichage avec la version la plus récente.
- L’aperçu documentaire réconcilie désormais les cartes par identifiant. Une
  modification ne reconstruit et ne rend que les blocs ajoutés ou modifiés ;
  les SVG, contrôleurs de navigation et positions des blocs inchangés sont
  conservés. Une modification isolée dans un document de 50 blocs passe ainsi
  de 283 ms à 33 ms dans le microbenchmark local.
- Le Diagram Studio et la galerie d’exemples attribuent une génération à chaque
  série de rendus. Les travaux obsolètes vérifient leur génération et la
  présence de leur cible dans le DOM avant toute écriture : le scénario de test
  passe de 19 écritures dans des cartes détachées à aucune.
- Le diff visuel rend une fois la version avant et une fois la version après,
  puis réutilise ces SVG pour l’overlay.
- La minimap ne crée son image et son URL Blob qu’après avoir établi qu’elle est
  activée et que le diagramme déborde réellement. Lorsqu’elle reste masquée,
  l’allocation d’environ 263 Kio du scénario de référence disparaît. Son
  viewport est toujours mis à jour au prochain frame et elle reste désactivée
  au-delà de 5 Mio de SVG.
- La validation statique lit le texte du document une seule fois et réutilise la
  déclaration Mermaid déjà détectée pour rechercher les blocs non fermés. Son
  délai est porté au minimum à 350 ms à partir de 1 Mio de caractères et à
  600 ms à partir de 5 Mio, afin d’absorber les rafales de saisie. Le passage
  statique sur la source de référence de 10 Mio passe de 127 ms à environ 52 ms.
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

| Ressource | Limite en v1.1.2 |
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
- La police par défaut suit `--vscode-font-family` dans les webviews et une pile
  d’interface système dans le CLI. Elle évite toute police distante et s’accorde
  à l’éditeur, mais ses métriques peuvent varier selon la machine.
- Les choix Noto Sans et Inter utilisent des faces WOFF2 intégrées pour Latin et
  Latin Extended. Ils fixent les métriques de texte des aperçus et des exports
  préparés sur macOS, Windows et Linux.
- À source, réglages et police embarquée identiques, le SVG optimisé sans
  métadonnées vise une sortie octet par octet reproductible. Le mode `vscode`
  n’offre cette garantie que lorsque la pile de polices résolue est identique.
  Les exports PNG, WebP et PDF restent visuellement stables, mais leurs octets
  peuvent varier avec la version et le codec du navigateur Chromium installé
  localement.
- Le rendu, les chunks, ZenUML, Iconify, les images intégrées et les polices ne
  nécessitent aucun téléchargement à l’exécution. Le SVG original reste
  volontairement inchangé et ne reçoit pas de face embarquée à l’export.
- Le pipeline CI exécute la vérification sur macOS, Windows et Linux, puis les
  44 exemples dans trois familles de thème, soit 132 rendus.

## Validation de release

- TypeScript : réussi.
- ESLint : réussi.
- Tests unitaires et d’intégration : 130/130 réussis.
- Régression visuelle : 132/132 rendus réussis, plus Diagram Studio et le diff visuel.
- Build de production : réussi, 17,41 Mio sur le budget de 20 Mio.
- Package VSIX : réussi, 188 fichiers, 5,58 Mio compressés
  (5 855 345 octets). Les captures du dépôt en sont bien exclues.
- Cohérence du lockfile en mode npm hors ligne : réussie.

Les tests nécessitant Chromium ont été exécutés localement avec les connexions
réseau bloquées par le harness, puis la baseline mise à jour a repassé le contrôle
strict sans différence.
