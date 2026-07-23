# Mermaid Preview Offline 1.2.4 — Guide utilisateur

[Read this guide in English](USER_GUIDE.md).

Mermaid Preview Offline est à la fois un éditeur VS Code, un service de langage,
un outil d’export et un espace de travail pour les diagrammes Mermaid. Le rendu
s’effectue localement avec le moteur Mermaid et les ressources intégrées à
l’extension. Aucun compte, service de rendu dans le cloud, CDN ou service de
télémétrie n’est nécessaire.

Ce guide couvre toutes les fonctionnalités de la version 1.2.4. Pour connaître la
syntaxe Mermaid exacte et son niveau de stabilité, consultez le
[catalogue de 44 exemples](../examples/README.md) et la
[matrice de compatibilité](../examples/COMPATIBILITY.md).

## Démarrage rapide

1. Installez l’extension, puis ouvrez un fichier `.mmd` ou `.mermaid`.
2. Utilisez le bouton de disposition dans la barre d’outils de l’aperçu pour
   choisir **Preview only**, **Source only**, **Beside** ou **Above**.
3. Modifiez le code source dans VS Code. Lorsque l’actualisation automatique est
   activée, l’aperçu se met à jour après le délai configuré.
4. Utilisez **Export** pour prévisualiser le résultat et l’enregistrer au format
   PNG, WebP, PDF, SVG optimisé ou SVG original.

Pour ouvrir temporairement un fichier Mermaid en texte brut, exécutez
**Reopen Editor With…** → **Text Editor**. Pour modifier l’association au niveau
de l’espace de travail, exécutez **Mermaid Preview: Configure Default Editor**.

![Un processus complet de commande et de livraison rendu hors ligne dans VS Code](../media/screenshots/flowchart.png)

## Ouvrir et organiser les diagrammes

### Fichiers pris en charge et association de l’éditeur

L’éditeur personnalisé est enregistré pour les fichiers `.mmd` et `.mermaid`.
Vous pouvez l’ouvrir en double-cliquant sur un fichier, en exécutant
**Mermaid Preview: Open Offline Preview** ou depuis le menu contextuel de
l’Explorateur. **Open Preview to the Side** conserve l’éditeur actuel visible et
ouvre l’aperçu dans un autre groupe.

**Configure Default Editor** propose trois choix :

- **Mermaid Preview (Offline)** associe les deux extensions de fichiers à
  l’aperçu personnalisé ;
- **Text Editor** les ouvre par défaut comme des documents texte VS Code
  ordinaires ;
- **Reset association** supprime la surcharge de l’espace de travail.

### Quatre dispositions

| Disposition | Résultat |
|---|---|
| **Preview only** | Le diagramme rendu occupe tout le groupe d’éditeurs. |
| **Source only** | L’éditeur texte Mermaid natif de VS Code occupe tout le groupe d’éditeurs. |
| **Beside** | Le code source est à gauche et l’aperçu à droite. |
| **Above** | Le code source est au-dessus de l’aperçu. |

![Le sélecteur de disposition proposant Preview only, Source only, Beside et Above](../media/screenshots/editor-layout.png)

Beside et Above utilisent un véritable éditeur texte VS Code : la coloration
syntaxique, l’autocomplétion, l’aide au survol, le formatage, les diagnostics,
les snippets, les corrections rapides et le renommage restent donc disponibles.
Faites glisser le séparateur des groupes d’éditeurs VS Code pour redimensionner
la paire. L’extension mémorise cette proportion pour chaque fichier et la
restaure lorsque la vue fractionnée est recréée.
Lorsque l’aperçu possède le focus, appuyez plusieurs fois sur `P` pour parcourir
Preview only, Beside, Above, puis revenir à Preview only. Depuis l’éditeur source
Mermaid, utilisez `Alt+P` (`Option+P` sous macOS) pour rejoindre ou poursuivre ce
cycle ; la touche `P` seule reste ainsi disponible pour écrire.
Cliquez n’importe où sur le canevas du diagramme ou la minicarte pour donner le
focus à l’aperçu. Le focus est également restauré après chaque changement de
disposition, et `P` continue de fonctionner lorsqu’un bouton de la barre d’outils
possède le focus. Les champs du formulaire d’export conservent leur saisie normale.

Une seule paire source/aperçu compagnon suit le fichier Mermaid actif. Lorsque
vous sélectionnez un autre fichier dans l’Explorateur ou un autre onglet texte
Mermaid en mode Beside ou Above, les deux parties passent sur ce fichier, quel
que soit le groupe qui possédait auparavant le focus. Fermer la partie source
conserve le diagramme en mode Preview only ; fermer la partie aperçu conserve
l’éditeur natif en mode Source only.

Copier l’aperçu dans une nouvelle fenêtre VS Code ne modifie pas la disposition
Beside ou Above de la fenêtre principale. Les aperçus auxiliaires sont
indépendants et n’interfèrent ni avec la navigation entre fichiers ni avec la
réconciliation de la vue fractionnée principale.

### Restauration de session

La disposition sélectionnée est enregistrée pour l’espace de travail. Pour
chaque fichier Mermaid, l’extension enregistre également le zoom, le mode
d’ajustement, la position de défilement et la proportion de la vue fractionnée
native. VS Code restaure les onglets ouverts ; lorsqu’un aperçu est reconstruit,
l’extension réapplique son état d’affichage enregistré. Le thème et la police
des diagrammes sont communs aux aperçus de la fenêtre VS Code actuelle.

Si la vue fractionnée restaurée ne correspond plus à la disposition attendue,
sélectionnez de nouveau la disposition voulue. Si un aperçu obsolète subsiste
après l’interruption d’une session distante, fermez cet onglet et rouvrez la
source Mermaid ; le fichier source reste la référence.

## Rendu et navigation

### Actualisation automatique et manuelle

En mode **automatic**, les modifications du document sont rendues après le
délai `mermaidPreviewOffline.refreshDelay` (140 ms par défaut). Une modification
plus récente annule ou remplace un rendu en attente devenu obsolète. Les fichiers
dont la taille atteint ou dépasse `mermaidPreviewOffline.largeFileThresholdKb`
utilisent un délai minimal de 400 ms et affichent un indicateur de fichier
volumineux.

En mode **manual**, le diagramme actuel reste visible et le pied de page indique
**Changes pending**. Sélectionnez **Refresh** ou appuyez sur `R` pour rendre le
texte actuel. Le retour au mode automatique déclenche immédiatement le rendu.

Le pied de page indique la taille UTF-8 de la source, les dimensions naturelles
du diagramme, l’état et la durée du rendu, ainsi que le pourcentage de zoom
actuel.

### Garde-fous sur les ressources

Les limites fixes suivantes empêchent un aperçu ou un export de consommer une
quantité de mémoire non bornée. Il s’agit de plafonds de sécurité, et non de
réglages de qualité configurables.

| Ressource | Limite | Comportement visible |
|---|---:|---|
| Source Mermaid | 10 Mio de source UTF-8 | L’aperçu suspend le rendu et affiche la taille mesurée ainsi que le plafond de 10 Mio. L’édition du texte reste disponible. Le CLI et le rendu de dossier/par lot rejettent ou ignorent le fichier trop volumineux avec la même limite. |
| Images locales d’un diagramme | 64 images relatives uniques | Le rendu s’arrête en indiquant le nombre détecté et le plafond de 64 images. |
| Une image locale | 8 Mio | Le rendu s’arrête et identifie la référence trop volumineuse. |
| Ensemble des images locales d’un diagramme | 24 Mio cumulés | Le rendu s’arrête avec un message signalant la limite cumulée. |
| Export matriciel | 32 000 000 pixels (32 Mpx) | L’export PNG, WebP ou PDF s’arrête avant de créer un canevas trop volumineux et demande de réduire l’échelle ou le DPI. |

SVG étant un format vectoriel, il n’est pas soumis au budget matriciel de
32 mégapixels. Optimisez ou répartissez les images d’un diagramme qui en contient
beaucoup ; scindez une source exceptionnellement volumineuse en plusieurs petits
diagrammes ; et réduisez le DPI ou l’échelle lorsqu’un export matriciel dépasse
son budget.

### Zoom, déplacement, minimap et focus

| Action | Commande |
|---|---|
| Ajuster le diagramme entier | **Fit** dans la barre d’outils, ou `Ctrl/Cmd + 0` |
| Faire un zoom avant ou arrière | `+` / `-` dans la barre d’outils ou au clavier ; `Ctrl/Cmd` ou `Alt/Option` + molette pour un zoom centré sur le pointeur et le pincement trackpad |
| Zoomer depuis le canevas | `Alt/Option` + clic pour zoomer ; ajoutez `Shift` pour dézoomer |
| Déplacer la vue | Faites glisser selon `navigation.mouse` |
| Parcourir un diagramme qui dépasse | Cliquez ou faites glisser dans la minimap |
| Rechercher un libellé rendu | `/` ou `Ctrl/Cmd+F`, puis Entrée/Maj+Entrée |
| Afficher la source | Cliquez sur un nœud, cluster, acteur, élément mindmap ou timeline |
| Copier l’aperçu dans une autre fenêtre | **Open in new window** dans la barre d’outils ; l’original reste visible |

![Recherche de libellés correspondants dans un tableau Mermaid, avec atténuation des autres nœuds](../media/screenshots/search.png)

Le zoom est limité à une plage pratique de 15 à 400 %. Réglez
`mermaidPreviewOffline.navigation.mouse` sur `always`, `alt` ou `never`, et
`mermaidPreviewOffline.navigation.controls` sur `always`, `onHoverOrFocus` ou
`never`. La minimap apparaît
uniquement lorsqu’elle est activée et que le diagramme dépasse la zone visible.
Son rectangle représente la zone affichée ; cliquez ou faites-le glisser pour
déplacer cette zone dans un grand diagramme. Son fond et ses éventuels points
ou sa grille restent synchronisés avec le canevas actif.

![Une mindmap Mermaid agrandie avec sa minimap déplaçable](../media/screenshots/minimap.png)

### Thèmes de diagramme et thèmes de couleurs VS Code

La galerie visuelle propose **Adaptive**, **Default**, **Dark**, **Forest**,
**Neutral**, **Base**, **Neo**, **Neo Dark**, **Vibrant**, **Vibrant Dark** et
**Sketch**. Sketch utilise une graine manuscrite déterministe. Adaptive et
Sketch choisissent une palette claire ou sombre d’après le fond du canevas,
puis d’après VS Code lorsque le canevas suit l’éditeur.

Choisissez une densité Compact, Comfortable ou Spacious, puis un fond VS Code,
blanc, papier, gris doux, bleu doux, rose doux, ardoise, minuit ou une couleur
personnalisée. Les motifs sans trame, points et grille sont indépendants. Ces
réglages d’espace de travail sont partagés par les aperçus, la documentation,
Diagram Studio, les diffs visuels et les exports. Les choix effectués dans un
aperçu de fichier sont conservés dans l’état de l’espace de travail : changer,
fermer ou rouvrir un diagramme ne rétablit plus les valeurs par défaut.

Le thème de l’aperçu et celui de l’export sont indépendants. Vous pouvez ainsi
travailler dans un espace sombre tout en exportant, par exemple, un diagramme
neutre sur fond blanc.

![La galerie d’apparence complète avec les thèmes classiques, Neo, Vibrant et Sketch, les densités, les motifs et les fonds de canevas](../media/screenshots/appearance.png)

### Typographie des diagrammes

`mermaidPreviewOffline.diagramFontFamily` contrôle le texte des aperçus de
fichiers et de documentation, de Diagram Studio, des comparaisons visuelles et
des exports préparés. Ce réglage à portée de fenêtre accepte trois valeurs :

| Valeur | Comportement |
|---|---|
| `vscode` (par défaut) | Utilise la valeur résolue de `--vscode-font-family`. Les moteurs dépourvus de cette variable CSS, notamment le CLI autonome, utilisent une pile de polices d’interface système. |
| `noto-sans` | Utilise la graisse normale de Noto Sans intégrée pour les textes Latin et Latin Extended. |
| `inter` | Utilise la graisse normale d’Inter intégrée pour les textes Latin et Latin Extended. |

Choisissez `vscode` pour accorder le diagramme à l’éditeur actuel. La police
installée exacte et ses métriques peuvent varier selon le système d’exploitation
ou le profil VS Code. Choisissez Noto Sans ou Inter lorsque la cohérence des
caractères accentués, des métriques de mise en page et du résultat entre les
plateformes est prioritaire : les deux polices sont intégrées à l’extension et
ne nécessitent aucun téléchargement à l’exécution.

Les rendus SVG optimisé, PNG, WebP et PDF peuvent embarquer la police intégrée
sélectionnée ; Noto Sans et Inter sont donc les choix portables et
reproductibles pour les exports partagés. Le **SVG original** conserve
volontairement la sortie Mermaid sans modification : aucune police ne lui est
ajoutée au moment de l’export et une police de remplacement peut être utilisée
s’il est ouvert sur une machine dépourvue de la police nommée.

## Erreurs et assistance à l’édition

### Erreurs de rendu

Si Mermaid ne peut pas rendre la source, l’aperçu affiche un message lisible et,
lorsque Mermaid les fournit, une ligne, une colonne et un extrait de la source
concernée. Utilisez **Open source** pour revenir à l’éditeur natif. Après avoir
corrigé la source, sélectionnez **Retry** ou **Refresh**.

La même erreur de rendu actuelle est publiée dans le panneau **Problems** de
VS Code et sous forme de soulignement dans l’éditeur. Les diagnostics associés à
une version obsolète du document sont ignorés au lieu d’être appliqués à une
source plus récente.

### Fonctionnalités de langage

L’extension fournit la coloration syntaxique Mermaid, la configuration du
langage et 43 snippets correspondant aux familles de diagrammes pour les
fichiers `.mmd` et `.mermaid`. L’éditeur texte natif propose également :

- l’autocomplétion des déclarations Mermaid et des mots-clés courants ;
- une documentation contextuelle au survol des mots-clés connus ;
- le formatage du document selon le réglage actif de tabulations ou d’espaces ;
- des diagnostics pour les déclarations inconnues, les flèches Unicode et les
  blocs non fermés ;
- des corrections rapides pour les fautes dans les déclarations, l’absence de
  déclaration flowchart, les flèches Unicode, les instructions `end` manquantes
  et les nœuds flowchart anonymes ;
- **Insert Node or Link**, qui demande des identifiants et des libellés sûrs ;
- **Generate Missing Identifiers**, qui attribue des identifiants stables aux
  nœuds anonymes ;
- **Rename Identifier**, qui renomme l’identifiant sélectionné dans tout le
  fichier Mermaid actuel.

Le renommage accepte les identifiants commençant par une lettre ou un caractère
de soulignement, puis composés de lettres, chiffres, caractères de soulignement
ou traits d’union. Avant d’appliquer une modification sémantique à l’ensemble
d’un projet, examinez la source modifiée, car les identifiants Mermaid peuvent
être réutilisés dans des libellés et des syntaxes propres à chaque diagramme.

<p align="center">
  <img src="../media/screenshots/code-completion.png" alt="Complétion des déclarations Mermaid avec documentation contextuelle" width="66%">
  <img src="../media/screenshots/commands-2.png" alt="Commandes Mermaid d’insertion, de génération d’identifiants et de renommage" width="30%">
</p>

## Compatibilité des diagrammes et des ressources

Mermaid `11.16.0` est intégré et épinglé. Le catalogue validé couvre les
44 fichiers et fonctionnalités suivants :

| Groupe | Couverture incluse |
|---|---|
| Flux et général | Flowchart, flowchart avec ELK, mindmap avec layouts par défaut et tidy-tree, timeline, pie, donut, quadrant, Venn, Ishikawa, Cynefin et tree view |
| UML et conception logicielle | Sequence, class, state, entity relationship, cinq variantes C4, ZenUML, architecture et packet |
| Planification et produit | User journey, Gantt, Git graph, Kanban, Wardley Map, Event Modeling et swimlanes |
| Données et graphiques | Sankey, XY chart, radar, treemap et block diagram |
| Grammaires et diagnostics | Native railroad, EBNF railroad, ABNF railroad, PEG railroad et informations du moteur Mermaid |
| Ressources intégrées | Packs d’icônes Iconify et images locales relatives |

<p align="center">
  <img src="../media/screenshots/entity-relationship.png" alt="Un modèle entité-association commercial complet rendu hors ligne" width="49%">
  <img src="../media/screenshots/gantt.png" alt="Un plan de livraison complet de la version 1.0 rendu en diagramme de Gantt Mermaid" width="49%">
</p>

Les alias historiques tels que `graph`, `flowchart-v2`, `classDiagram-v2` et
`stateDiagram` utilisent les mêmes familles de diagrammes intégrées. Les
syntaxes dont le mot-clé Mermaid contient `-beta`, ainsi que C4 et ZenUML,
doivent être considérées comme expérimentales même si leurs exemples intégrés
ont été validés.

### ZenUML

Le plug-in officiel `@mermaid-js/mermaid-zenuml` est inclus dans le bundle local
de l’extension et chargé à la demande lors du rendu d’un diagramme ZenUML.
Commencez un diagramme par `zenuml` ; aucun téléchargement n’est nécessaire
pendant l’exécution. Consultez `examples/41-zenuml.mmd`.

### Icônes Iconify

Les packs Iconify `logos`, `mdi` et `material-icon-theme` sont intégrés et
enregistrés localement. Utilisez la syntaxe d’icône Mermaid habituelle, par
exemple `icon: "logos:react"` ou `icon: "mdi:account-edit"`. Les autres packs ne sont
pas téléchargés automatiquement. Consultez `examples/42-icon-packs.mmd`.

![Un pipeline de livraison hors ligne rendu avec les packs Iconify intégrés](../media/screenshots/icon-packs-2.png)

### Images locales

Les références d’images relatives dans les attributs Mermaid `img:` sont
résolues depuis le répertoire du diagramme et intégrées sous forme d’URI `data:`
avant le rendu. Les extensions prises en charge sont SVG, PNG, JPEG, GIF, WebP,
AVIF, BMP et ICO. Le SVG enregistré reste ainsi portable.

![Un flowchart Mermaid intégrant une image relative de l’espace de travail pour un export hors ligne portable](../media/screenshots/local-image.png)

Utilisez un chemin situé dans l’espace de travail actuel, par exemple :

```text
flowchart LR
  logo@{ img: "assets/logo.svg", label: "Local logo" }
```

Les chemins absolus, les URL réseau et les chemins qui se résolvent en dehors
de l’espace de travail ne sont pas pris en charge. Dans un espace multi-racine,
le dossier d’espace de travail propre au diagramme est utilisé. Les espaces de
travail distants utilisent le fournisseur de système de fichiers VS Code actif.

## Exporter les diagrammes

Ouvrez la boîte de dialogue d’export depuis la barre d’outils de l’aperçu, la
palette de commandes, le titre de l’éditeur ou le menu contextuel de
l’Explorateur. Elle génère un aperçu en direct et affiche les dimensions finales
en pixels ou de la page avant l’enregistrement.

![La boîte de dialogue d’export professionnel avec aperçu, format, thème, DPI, marge, arrière-plan et profils](../media/screenshots/export-window.png)

### Formats

| Format | Comportement |
|---|---|
| **PNG** | Sortie matricielle sans perte ; prend en charge le DPI, l’échelle, la marge, l’arrière-plan, les métadonnées et la copie dans le presse-papiers. |
| **WebP** | Sortie matricielle compacte avec les mêmes réglages de dimensions. |
| **PDF** | Une page opaque dimensionnée selon le diagramme rendu et ses marges. |
| **Optimized SVG** | Sortie vectorielle portable avec optimisation, métadonnées, marge et arrière-plan facultatifs. |
| **Original SVG** | SVG rendu par Mermaid, copié ou enregistré sans modification ; les réglages de décoration de sortie sont désactivés. |

Le bouton **Copy SVG** de la barre d’outils copie le SVG original actuellement
rendu. **Save SVG** ouvre une boîte de dialogue native pour enregistrer
directement ce même SVG original. Ces deux actions n’ouvrent pas l’export
professionnel, qui peut copier séparément le SVG original, le SVG optimisé ou le
PNG.

![Copie directe du SVG original depuis la barre d’outils de l’aperçu Mermaid](../media/screenshots/copy-svg.png)

### Réglages d’export

- **Theme:** tous les thèmes classiques, Neo, Vibrant et Sketch.
- **Scale:** de 0.25 à 8.
- **DPI:** de 72 à 600 pour les sorties matricielles et PDF.
- **Margin:** de 0 à 512 pixels CSS.
- **Background:** Transparent, une couleur hexadécimale à six chiffres ou le
  canevas actuel de l’aperçu. Le PDF est toujours opaque.
- **Name template:** jusqu’à 160 caractères, avec `{name}`, `{format}`, `{theme}`,
  `{scale}`, `{dpi}`, `{date}`, `{time}` et `{ext}`.
- **Optimize SVG:** simplifie la sortie vectorielle préparée avant son
  enregistrement ou sa conversion matricielle.
- **Include metadata:** active explicitement l’ajout du nom de la source, de son
  URI et de l’heure d’export aux formats compatibles. Cette option est désactivée
  par défaut afin que les SVG optimisés répétés restent reproductibles octet par
  octet. PNG, WebP et PDF restent visuellement stables, mais leur encodage peut
  varier selon la version locale de Chromium.
- **Original SVG:** conserve la sortie vectorielle Mermaid originale lorsque
  SVG est le format sélectionné.

Les caractères interdits dans les noms de fichiers sont remplacés avant
l’enregistrement. Une extension de format manquante est ajoutée automatiquement.
Si le PNG, WebP ou PDF demandé devait dépasser 32 000 000 pixels, la boîte de
dialogue d’export indique les dimensions demandées et invite à réduire l’échelle
ou le DPI au lieu d’allouer le canevas trop volumineux.

### Profils et export de dossier

Saisissez un nom de profil et sélectionnez **Save profile** pour conserver les
réglages d’export actuels. Les profils sont disponibles dans tous les espaces de
travail du même profil VS Code ; jusqu’à 40 profils normalisés sont conservés.
Sélectionnez un profil pour l’appliquer ou utilisez **Delete** pour le supprimer.

Sélectionnez **Export folder…** pour choisir un dossier source et une
destination. L’extension recherche récursivement les fichiers `.mmd` et
`.mermaid`, conserve leur arborescence relative, applique les réglages d’export
actifs et signale chaque échec sans écraser les fichiers sources.

Vous pouvez aussi faire un clic droit sur un dossier dans l’Explorateur puis
sélectionner **Mermaid Preview: Export Folder…**. Le dossier sélectionné devient
immédiatement la source : seule la destination reste à choisir. L’action utilise
le même export récursif par lot et les réglages d’export configurés.

## CLI hors ligne

Le dépôt et l’extension empaquetée incluent l’outil de rendu en ligne de commande
`mpo`. Il nécessite Node.js 22 et Chrome, Chromium ou Edge 120 ou plus récent ;
aucun service de rendu distant n’est utilisé.

```bash
npm ci
npm run build
npm link

mpo examples/01-flowchart.mmd --format png --dpi 300 --scale 2 --font noto-sans
mpo examples --output exported --format pdf --theme neutral --json
```

| Option | Fonction |
|---|---|
| `-o, --output <path>` | Fichier ou dossier de sortie. |
| `--format <format>` | `svg`, `png`, `webp` ou `pdf`. |
| `--scale <factor>` | Échelle de 0.25 à 8. |
| `--dpi <number>` | Résolution de 72 à 600 DPI. |
| `--density <density>` | `compact`, `comfortable` ou `spacious`. |
| `--margin <pixels>` | Espace autour du diagramme. |
| `--background <value>` | `transparent` ou `#rrggbb`. |
| `--theme <theme>` | Identifiant d’un thème classique, Neo, Redux/Vibrant ou Sketch. |
| `--font <font>` | `vscode`, `noto-sans` ou `inter` ; `vscode` utilise la pile d’interface système en dehors de VS Code. |
| `--name-template <template>` | Jetons de nommage de sortie utilisés par la boîte de dialogue d’export. |
| `--profile <json>` | Charge les réglages d’export depuis un profil JSON. |
| `--original-svg` | Conserve la sortie SVG inchangée. |
| `--no-optimize` | Désactive l’optimisation SVG. |
| `--metadata` | Inclut les métadonnées de source et d’export (opt-in, désactivé par défaut). |
| `--no-metadata` | Omet explicitement les métadonnées de source et d’export, y compris si un profil les active. |
| `--browser <path>` | Utilise un exécutable Chrome, Chromium ou Edge précis. |
| `--json` | Affiche des résultats lisibles par une machine. |
| `-h, --help` | Affiche toutes les options. |
| `-v, --version` | Affiche la version du CLI. |

Pour un dossier en entrée, le CLI exporte récursivement les fichiers Mermaid et
conserve l’arborescence du répertoire source dans le dossier de sortie choisi.
Un code de sortie non nul indique une erreur d’arguments, de découverte, de
navigateur, de rendu ou d’écriture.

## Tâches d’export VS Code

L’extension fournit le type de tâche `mermaid-export`. Il utilise le même moteur
de rendu local et peut exporter un fichier ou un dossier depuis **Run Task** ou
dans les environnements CI qui disposent d’un navigateur compatible.

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Export Mermaid documentation",
      "type": "mermaid-export",
      "source": "${workspaceFolder}/docs/diagrams",
      "output": "${workspaceFolder}/build/diagrams",
      "format": "png",
      "theme": "neutral",
      "font": "noto-sans",
      "scale": 2,
      "dpi": 300,
      "margin": 24,
      "background": "#ffffff",
      "nameTemplate": "{name}.{format}",
      "optimizeSvg": true,
      "includeMetadata": false
    }
  ]
}
```

| Propriété | Obligatoire/valeur par défaut | Fonction |
|---|---|---|
| `type` | Obligatoire : `mermaid-export` | Sélectionne ce fournisseur de tâche. |
| `source` | Obligatoire | Fichier ou dossier Mermaid. Prend en charge `${workspaceFolder}`, `${file}` et `${fileDirname}`. |
| `output` | Selon la source | Fichier ou dossier de sortie ; prend en charge les mêmes variables. |
| `format` | `png` | `svg`, `png`, `webp` ou `pdf`. |
| `theme` | `default` | Tout thème Mermaid pris en charge. |
| `font` | Réglage de l’espace de travail | `vscode`, `noto-sans` ou `inter`. Si elle est omise, la tâche utilise `mermaidPreviewOffline.diagramFontFamily`. |
| `scale` | `1` | Échelle de 0.25 à 8. |
| `dpi` | `144` | Résolution de 72 à 600. |
| `margin` | `24` | Marge de 0 à 512. |
| `background` | `transparent` | `transparent` ou une couleur `#rrggbb`. |
| `nameTemplate` | `{name}-{theme}@{scale}x.{format}` | Modèle de nommage de sortie. |
| `optimizeSvg` | `true` | Optimise le SVG généré. |
| `includeMetadata` | `false` | Active les métadonnées prises en charge ; laisser désactivé pour un SVG optimisé reproductible. |
| `browser` | Détection automatique | Chemin facultatif de l’exécutable du navigateur. |

## Diagram Studio et générateurs

Exécutez **Mermaid Preview: New Diagram from Template…** pour ouvrir Diagram
Studio. Il propose une source et un aperçu en direct, des champs de modèle
modifiables, la modification directe facultative de la source et une étape
d’enregistrement dans l’espace de travail.

L’aperçu d’un fichier vide donne aussi un accès direct à Diagram Studio. Dans
ce parcours, la boîte de création reprend par défaut le nom et le dossier du
fichier vide tout en permettant de vérifier la destination avant remplacement.

Les huit modèles intégrés sont :

1. Process flow
2. Service sequence
3. Domain classes
4. Entity relationship
5. Delivery plan
6. Customer journey
7. Idea map
8. System landscape

![Diagram Studio avec huit modèles Mermaid personnalisables et l’aperçu en direct d’un modèle entité-association](../media/screenshots/gallery-templates.png)

Exécutez **Mermaid Preview: Browse Example Gallery…** pour effectuer une
recherche dans les 44 exemples intégrés, filtrer par catégorie, examiner leur
rendu et créer une copie modifiable dans l’espace de travail.

La version 1.0 propose également deux générateurs de projet locaux :

- **Mermaid Preview: Generate ERD from SQL Schema…** lit le sous-ensemble
  déclaratif courant de `CREATE TABLE` dans un fichier `.sql` UTF-8 local, y
  compris les colonnes et relations de clés primaires/étrangères, puis propose
  `<schema-name>-erd.mmd` ;
- **Mermaid Preview: Generate Dependency Graph from package.json…** lit les
  propriétés locales `dependencies`, `devDependencies`, `peerDependencies` et
  `optionalDependencies`, différencie leurs groupes dans un flowchart, puis
  propose `dependency-graph.mmd`.

Chaque entrée est limitée à 4 MB. Une fois le fichier de sortie choisi, le
diagramme généré s’ouvre dans l’aperçu hors ligne habituel. Le résultat est une
source Mermaid ordinaire : examinez-la, modifiez ses libellés ou ses liens, puis
utilisez les fonctions habituelles d’aperçu et d’export. Aucun service distant
d’analyse de schéma ou de paquet n’intervient.

## Comparaison visuelle Git

Pour un fichier `.mmd` ou `.mermaid`, exécutez
**Mermaid Preview: Compare Git Versions Visually…**. Sélectionnez une révision
avant et une révision après ; les choix comprennent les références locales,
`HEAD` et l’arbre de travail. L’extension lit les révisions par l’intermédiaire
de l’extension Git intégrée à VS Code.

La comparaison visuelle propose :

- des diagrammes rendus côte à côte ;
- une superposition colorée des ajouts, modifications et suppressions ;
- le nombre de lignes sources modifiées ;
- un zoom et une navigation synchronisés.

Si l’éditeur de comparaison texte de VS Code affiche déjà un fichier Mermaid,
sélectionnez **Mermaid Preview: Preview Diff Visually** dans le titre de
l’éditeur pour réutiliser ses entrées originale et modifiée. La comparaison Git
nécessite un dépôt local et l’extension Git intégrée activée ; un diff texte
ordinaire peut tout de même être prévisualisé sans sélectionner de révisions.

## Markdown, MDX et AsciiDoc

L’extension détecte les blocs Mermaid dans Markdown (`.md`, `.markdown`), MDX
(`.mdx`) et AsciiDoc (`.adoc`, `.asciidoc`, `.asc`).

![Les commandes de documentation pour prévisualiser un bloc, tous les blocs ou exporter les images](../media/screenshots/commands.png)

### Formes de blocs prises en charge

Markdown et MDX acceptent les fences à accents graves ou tildes, y compris la
syntaxe avec attribut, ainsi que les conteneurs `::: mermaid` :

````markdown
```mermaid
flowchart LR
  Docs --> Preview
```

~~~{.mermaid}
sequenceDiagram
  Editor->>Preview: Update
~~~

::: mermaid
mindmap
  root((Documentation))
    Preview
    Export
:::
````

Utilisez `mermaidPreviewOffline.documentation.languages` pour reconnaître des
identifiants exacts supplémentaires comme `mermaid-example` dans les fences et
les conteneurs.

AsciiDoc accepte les attributs Mermaid ou les attributs source suivis d’un
délimiteur de bloc correspondant d’au moins quatre caractères :

```asciidoc
[mermaid]
....
flowchart LR
  Docs --> Preview
....

[source,mermaid]
----
sequenceDiagram
  Editor->>Preview: Update
----
```

### Prévisualiser et naviguer

Placez le curseur dans un bloc et exécutez **Preview Block Under Cursor** pour
le cibler. Exécutez **Preview All Blocks in Document** pour ouvrir une vue en
direct du document. Elle se met à jour après les modifications de la source.
Sélectionnez **Go to source**, ou double-cliquez sur le canevas d’un diagramme,
pour afficher et sélectionner le bloc source correspondant. Chaque carte possède
son zoom centré sur le pointeur, son pincement trackpad et son état restauré. Si
le redimensionnement est actif, faites glisser la poignée inférieure
ou utilisez les flèches lorsqu’elle a le focus ; `documentation.maxHeight` peut
limiter sa hauteur.
Sélectionnez **Present** pour afficher un diagramme par diapositive plein écran ;
utilisez les flèches, Page précédente/suivante, Début/Fin ou Espace, puis Échap
pour revenir. **Pop out** déplace l’aperçu documentaire dans une fenêtre VS Code
distincte.

![La source Markdown à côté de l’aperçu en direct de plusieurs diagrammes Mermaid intégrés](../media/screenshots/preview-markdown.png)

### Exporter une copie de la documentation

Exécutez **Export Document with Diagram Images…**, puis choisissez SVG optimisé
ou PNG. L’extension crée une nouvelle copie du document et remplace chaque bloc
Mermaid par une référence relative vers une image locale. Les images sont
écrites dans un répertoire dédié `<document>.assets` à côté de la copie. Le PNG
utilise le thème, le DPI, l’échelle, la marge et l’arrière-plan d’export
configurés. Le document source n’est pas écrasé.

## Référence des commandes

![Toutes les commandes Mermaid Preview Offline dans la palette de commandes VS Code](../media/screenshots/commands-3.png)

| Intitulé dans la palette de commandes | Disponibilité et résultat |
|---|---|
| **Mermaid Preview: Open Offline Preview** | Ouvre un fichier Mermaid dans l’aperçu personnalisé. |
| **Mermaid Preview: Open Preview to the Side** | Ouvre un aperçu compagnon dans un autre groupe d’éditeurs. |
| **Mermaid Preview: Open Preview in New Window** | Copie l’aperçu dans une fenêtre VS Code distincte tout en conservant l’original visible. |
| **Mermaid Preview: Choose Editor Layout** | Permet de choisir l’une des quatre dispositions. |
| **Mermaid Preview: Preview Only** | Passe en mode Preview only. |
| **Mermaid Preview: Source Only** | Passe en mode Source only. |
| **Mermaid Preview: Source Beside Preview** | Passe en mode Beside. |
| **Mermaid Preview: Source Above Preview** | Passe en mode Above. |
| **Mermaid Preview: Configure Default Editor** | Modifie l’association de l’éditeur dans l’espace de travail. |
| **Mermaid: Format Document** | Éditeur Mermaid et menu contextuel de l’éditeur. |
| **Mermaid: Insert Node or Link** | Éditeur Mermaid et menu contextuel de l’éditeur. |
| **Mermaid: Generate Missing Identifiers** | Éditeur Mermaid et menu contextuel de l’éditeur. |
| **Mermaid: Rename Identifier** | Éditeur Mermaid et menu contextuel de l’éditeur. |
| **Mermaid Preview: Export Diagram…** | Barre d’outils de l’aperçu, titre de l’éditeur, Explorateur ou palette de commandes. |
| **Mermaid Preview: Export Folder…** | Menu contextuel d’un dossier dans l’Explorateur ou palette de commandes. |
| **Mermaid Preview: New Diagram from Template…** | Ouvre Diagram Studio pour les modèles et la génération personnalisée. |
| **Mermaid Preview: Browse Example Gallery…** | Ouvre Diagram Studio sur l’onglet de la galerie. |
| **Mermaid Preview: Generate ERD from SQL Schema…** | Génère une source Mermaid ER à partir d’un schéma SQL local. |
| **Mermaid Preview: Generate Dependency Graph from package.json…** | Génère une source de graphe Mermaid à partir d’un manifeste de paquet local. |
| **Mermaid Preview: Compare Git Versions Visually…** | Contextes Explorateur/titre Mermaid et palette de commandes. |
| **Mermaid Preview: Preview Diff Visually** | Titre de l’éditeur de diff texte Mermaid et palette de commandes. |
| **Mermaid Preview: Preview Block Under Cursor** | Éditeur Markdown, MDX ou AsciiDoc. |
| **Mermaid Preview: Preview All Blocks in Document** | Éditeur Markdown, MDX ou AsciiDoc. |
| **Mermaid Preview: Export Document with Diagram Images…** | Éditeur Markdown, MDX ou AsciiDoc. |

Les commandes n’apparaissent dans les menus que lorsque le contexte de la
ressource et de l’éditeur s’y prête, mais elles restent accessibles depuis la
palette de commandes après l’activation de l’extension.

## Référence des réglages

| Réglage | Valeur par défaut | Portée et effet |
|---|---:|---|
| `mermaidPreviewOffline.refreshMode` | `automatic` | Rendu automatique en direct ou actualisation manuelle. |
| `mermaidPreviewOffline.refreshDelay` | `140` | Délai par ressource en millisecondes, de 0 à 2000. Les fichiers volumineux utilisent au moins 400 ms. |
| `mermaidPreviewOffline.largeFileThresholdKb` | `512` | Seuil par ressource, de 64 à 10240 KB. |
| `mermaidPreviewOffline.minimap.enabled` | `true` | Disponibilité de la minimap par ressource. |
| `mermaidPreviewOffline.navigation.mouse` | `always` | Politique de déplacement direct : `always`, `alt` ou `never` ; `never` désactive le déplacement direct. |
| `mermaidPreviewOffline.navigation.controls` | `always` | Contrôles de navigation : `always`, `onHoverOrFocus` ou `never`. |
| `mermaidPreviewOffline.documentation.languages` | `["mermaid"]` | Identifiants Markdown/MDX exacts reconnus comme Mermaid. |
| `mermaidPreviewOffline.documentation.resizable` | `true` | Active le redimensionnement vertical des cartes documentaires. |
| `mermaidPreviewOffline.documentation.maxHeight` | vide | Maximum validé facultatif, par exemple `720px` ou `80vh`. |
| `mermaidPreviewOffline.diagramTheme` | `adaptive` | Thème d’aperçu de l’espace de travail ou de la fenêtre. |
| `mermaidPreviewOffline.diagramDensity` | `comfortable` | Espacement partagé `compact`, `comfortable` ou `spacious`. |
| `mermaidPreviewOffline.canvas.background` | `editor` | Fond éditeur, prédéfini ou personnalisé, indépendant du thème VS Code. |
| `mermaidPreviewOffline.canvas.customColor` | `#ffffff` | Couleur à six chiffres du fond personnalisé. |
| `mermaidPreviewOffline.canvas.pattern` | `dots` | `none`, `dots` ou `grid`. |
| `mermaidPreviewOffline.diagramFontFamily` | `vscode` | Typographie des diagrammes à l’échelle de la fenêtre : `vscode`, `noto-sans` ou `inter`. Noto Sans et Inter sont intégrées pour les sorties portables. |
| `mermaidPreviewOffline.export.format` | `png` | Valeur par défaut de la ressource : SVG, PNG, WebP ou PDF. |
| `mermaidPreviewOffline.export.theme` | `default` | Thème d’export par ressource, indépendant de l’aperçu. |
| `mermaidPreviewOffline.export.scale` | `1` | Échelle par ressource, de 0.25 à 8. |
| `mermaidPreviewOffline.export.dpi` | `144` | DPI matriciel/PDF par ressource, de 72 à 600. |
| `mermaidPreviewOffline.export.margin` | `24` | Marge en pixels CSS par ressource, de 0 à 512. |
| `mermaidPreviewOffline.export.background` | `transparent` | Valeur par ressource : `transparent`, `color` ou `preview`. |
| `mermaidPreviewOffline.export.backgroundColor` | `#ffffff` | Couleur à six chiffres par ressource utilisée par `color`. |
| `mermaidPreviewOffline.export.fileNameTemplate` | `{name}-{theme}@{scale}x.{format}` | Jetons de nommage par ressource. |
| `mermaidPreviewOffline.export.optimizeSvg` | `true` | Valeur d’optimisation SVG par ressource. |
| `mermaidPreviewOffline.export.includeMetadata` | `false` | Opt-in des métadonnées par ressource ; laisser désactivé pour un SVG optimisé reproductible. |

Exemple de réglages d’espace de travail :

```json
{
  "mermaidPreviewOffline.refreshMode": "automatic",
  "mermaidPreviewOffline.refreshDelay": 200,
  "mermaidPreviewOffline.diagramTheme": "adaptive",
  "mermaidPreviewOffline.diagramDensity": "comfortable",
  "mermaidPreviewOffline.canvas.background": "paper",
  "mermaidPreviewOffline.canvas.pattern": "dots",
  "mermaidPreviewOffline.diagramFontFamily": "noto-sans",
  "mermaidPreviewOffline.export.format": "svg",
  "mermaidPreviewOffline.export.theme": "neutral",
  "mermaidPreviewOffline.export.fileNameTemplate": "{name}-{date}.{format}"
}
```

## Vie privée, fonctionnement hors ligne et compatibilité

Le rendu des diagrammes, l’enregistrement des plug-ins, les icônes, l’intégration
des images locales, les exports, les modèles, les exemples, les services de
langage et les générateurs s’exécutent localement. L’extension ne possède ni
système de compte, ni télémétrie, ni analyse d’usage, ni police distante, ni
téléchargement de ressources pendant l’exécution. Ses webviews d’aperçu bloquent
les connexions réseau et Mermaid est configuré en mode strict.

Le CLI et le moteur de rendu des tâches VS Code nécessitent un navigateur local
basé sur Chromium, mais aucun service de rendu dans le cloud. Un exécutable de
navigateur peut être sélectionné explicitement lorsque la détection automatique
ne convient pas.

La version de VS Code prise en charge, la version de Node.js requise, la version
de Mermaid et celles des plug-ins intégrés sont déclarées dans `package.json`.
La syntaxe des familles Mermaid expérimentales peut changer entre les versions
de Mermaid ; utilisez la matrice de compatibilité et les exemples épinglés
lorsqu’un résultat reproductible est important.

### Invitation unique à laisser un avis sur la Marketplace

Après la cinquième session d’aperçu qui termine un rendu avec succès,
l’extension peut afficher une seule notification d’information VS Code :
**Enjoying Mermaid Preview Offline? A Marketplace review helps the project.**
Elle propose les choix explicites **Leave a review** et **No thanks**.

Seul **Leave a review** ouvre la page d’avis de la Marketplace. L’extension ne
l’ouvre jamais automatiquement, et les modifications de la source ou les rendus
répétés au sein d’un aperçu déjà comptabilisé ne déclenchent aucune invitation
supplémentaire. Une fois le message affiché, son état local dans VS Code empêche
sa réapparition lors de sessions ultérieures, que vous laissiez un avis,
refusiez ou fermiez le message. Ce compteur local d’éligibilité ne constitue pas
de la télémétrie et ne transmet aucune donnée sur les diagrammes ou leur usage.

## Dépannage

### Un fichier Mermaid s’ouvre comme du texte

Exécutez **Mermaid Preview: Open Offline Preview** ou **Reopen Editor With…** →
**Mermaid Preview (Offline)**. Utilisez **Configure Default Editor** pour
réparer l’association dans l’espace de travail. Les associations d’éditeur de
l’espace de travail peuvent remplacer la valeur globale par défaut.

### L’aperçu indique « Changes pending »

Le mode d’actualisation manuelle est actif. Sélectionnez **Refresh**, appuyez sur
`R` ou attribuez la valeur `automatic` à
`mermaidPreviewOffline.refreshMode`.

### Le rendu est retardé

Vérifiez `refreshDelay` et `largeFileThresholdKb`. Les fichiers au-dessus du
seuil utilisent un délai minimal de 400 ms. Le pied de page identifie les
fichiers volumineux et affiche la progression du rendu. Réduisez les
modifications inutiles de la source avant de diminuer le délai.

### Une source ou un ensemble d’images locales dépasse sa limite

Une source Mermaid de plus de 10 Mio reste modifiable, mais n’est pas rendue.
Scindez-la en plusieurs petits diagrammes avant l’aperçu, le CLI ou l’export de
dossier. Pour les images locales, conservez au maximum 64 références uniques,
avec une taille maximale de 8 Mio par fichier et de 24 Mio cumulés dans un même
diagramme. Optimisez ou répartissez les ressources nommées dans l’avertissement,
puis actualisez l’aperçu.

### Le diagramme ne tient pas dans la vue ou la minimap est absente

Appuyez sur `Ctrl/Cmd + 0` pour réactiver le mode d’ajustement. La minimap
apparaît uniquement lorsque le diagramme dépasse et que
`mermaidPreviewOffline.minimap.enabled` vaut true. Un zoom avant peut faire
dépasser un diagramme auparavant ajusté.

### Une image locale est absente

Utilisez un chemin relatif pris en charge depuis le fichier Mermaid, conservez
l’image dans le même dossier d’espace de travail et vérifiez que son extension
est SVG, PNG, JPEG, GIF, WebP, AVIF, BMP ou ICO. Les URL réseau, chemins absolus,
formats non pris en charge, fichiers illisibles et chemins hors de l’espace de
travail sont volontairement ignorés.

### Le résultat exporté diffère de l’aperçu

Le thème d’export est indépendant du thème d’aperçu. Vérifiez le thème,
l’arrière-plan, l’échelle, le DPI, la marge et si **Original SVG** est
sélectionné. Original SVG n’applique ni optimisation, ni métadonnées, ni
arrière-plan, ni réglage de marge.

Si une demande PNG, WebP ou PDF dépasse 32 000 000 pixels, réduisez l’échelle ou
le DPI d’export jusqu’à ce que l’aperçu en direct réussisse, ou choisissez SVG
lorsqu’une sortie vectorielle convient.

### L’export CLI ou par tâche ne trouve pas de navigateur

Installez Chrome, Chromium ou Edge, ou fournissez `--browser <path>` au CLI.
Pour une tâche `mermaid-export`, définissez sa propriété `browser`. Vérifiez que
le processus qui exécute VS Code ou le terminal peut lancer ce binaire.

### La comparaison visuelle Git ne propose aucune révision

Vérifiez que le fichier appartient à un dépôt Git, que l’extension Git intégrée
à VS Code est activée et que le fichier possède un historique enregistré. Pour
comparer un diff texte déjà ouvert, utilisez **Preview Diff Visually**.

### L’aperçu de documentation ne trouve aucun bloc

Placez le curseur entre les délimiteurs d’ouverture et de fermeture. Pour
Markdown/MDX, utilisez une fence configurée, l’attribut `{.mermaid}` ou un
conteneur `::: mermaid`. Pour
AsciiDoc, utilisez `[mermaid]` ou `[source,mermaid]` suivi des délimiteurs
correspondants `....` ou `----`.

### La disposition ou la position restaurée est obsolète

Sélectionnez de nouveau la disposition voulue, utilisez Fit si nécessaire, puis
fermez et rouvrez l’aperçu. L’état d’affichage est enregistré par fichier et par
espace de travail ; déplacer ou renommer un fichier crée une nouvelle identité
d’état.

### L’environnement est hors ligne

L’aperçu, l’assistance à l’édition, les exemples intégrés, ZenUML, tidy-tree, les trois packs
Iconify intégrés, les images locales, les exports, Studio, les générateurs et les
vues de documentation restent disponibles. L’installation depuis la Marketplace,
les mises à jour de l’extension et l’ouverture de liens GitHub externes
nécessitent naturellement une connexion.

## Références complémentaires

- [Catalogue d’exemples](../examples/README.md)
- [Matrice de compatibilité Mermaid](../examples/COMPATIBILITY.md)
- [Plan des captures d’écran pour le README et le guide utilisateur](SCREENSHOTS.md)
- [Guide de publication](PUBLISHING.md)
- [Roadmap du projet](../roadmap.md)
