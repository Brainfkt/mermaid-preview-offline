# Matrice de compatibilité Mermaid

État actuel pour l'extension **Mermaid Preview — 100% Offline** avec le moteur
Mermaid `11.16.0` embarqué localement.

Légende :

- ✅ **Pris en charge** : analysé et rendu en SVG par l'extension.
- ❌ **Non pris en charge** : nécessite un module qui n'est pas embarqué.
- 🧪 **Expérimental** : pris en charge, mais la syntaxe Mermaid peut encore évoluer.

## Types pris en charge

| Type de diagramme | Mot-clé | Prise en charge | Stabilité | Exemple validé |
|---|---|:---:|:---:|---|
| Organigramme | `flowchart` / `graph` | ✅ | Stable | [`01-flowchart.mmd`](01-flowchart.mmd) |
| Organigramme avec ELK | `flowchart-elk` | ✅ | Stable | [`02-flowchart-elk.mmd`](02-flowchart-elk.mmd) |
| Séquence | `sequenceDiagram` | ✅ | Stable | [`03-sequence.mmd`](03-sequence.mmd) |
| Classes UML | `classDiagram` / `classDiagram-v2` | ✅ | Stable | [`04-class.mmd`](04-class.mmd) |
| États UML | `stateDiagram` / `stateDiagram-v2` | ✅ | Stable | [`05-state.mmd`](05-state.mmd) |
| Entités-associations | `erDiagram` | ✅ | Stable | [`06-entity-relationship.mmd`](06-entity-relationship.mmd) |
| Parcours utilisateur | `journey` | ✅ | Stable | [`07-user-journey.mmd`](07-user-journey.mmd) |
| Gantt | `gantt` | ✅ | Stable | [`08-gantt.mmd`](08-gantt.mmd) |
| Secteurs | `pie` | ✅ | Stable | [`09-pie.mmd`](09-pie.mmd) |
| Anneau | `pie` + `donutHole` | ✅ | Stable | [`10-donut.mmd`](10-donut.mmd) |
| Quadrants | `quadrantChart` | ✅ | Stable | [`11-quadrant.mmd`](11-quadrant.mmd) |
| Exigences | `requirementDiagram` | ✅ | Stable | [`12-requirement.mmd`](12-requirement.mmd) |
| Historique Git | `gitGraph` | ✅ | Stable | [`13-gitgraph.mmd`](13-gitgraph.mmd) |
| C4 — contexte | `C4Context` | ✅ | 🧪 | [`14-c4-context.mmd`](14-c4-context.mmd) |
| C4 — conteneurs | `C4Container` | ✅ | 🧪 | [`15-c4-container.mmd`](15-c4-container.mmd) |
| C4 — composants | `C4Component` | ✅ | 🧪 | [`16-c4-component.mmd`](16-c4-component.mmd) |
| C4 — dynamique | `C4Dynamic` | ✅ | 🧪 | [`17-c4-dynamic.mmd`](17-c4-dynamic.mmd) |
| C4 — déploiement | `C4Deployment` | ✅ | 🧪 | [`18-c4-deployment.mmd`](18-c4-deployment.mmd) |
| Carte mentale | `mindmap` | ✅ | Stable | [`19-mindmap.mmd`](19-mindmap.mmd) |
| Frise chronologique | `timeline` | ✅ | Stable | [`20-timeline.mmd`](20-timeline.mmd) |
| Sankey | `sankey` / `sankey-beta` | ✅ | 🧪 | [`21-sankey.mmd`](21-sankey.mmd) |
| Graphique XY | `xychart` / `xychart-beta` | ✅ | 🧪 | [`22-xy-chart.mmd`](22-xy-chart.mmd) |
| Diagramme de blocs | `block` / `block-beta` | ✅ | 🧪 | [`23-block.mmd`](23-block.mmd) |
| Paquet binaire | `packet` / `packet-beta` | ✅ | 🧪 | [`24-packet.mmd`](24-packet.mmd) |
| Kanban | `kanban` | ✅ | 🧪 | [`25-kanban.mmd`](25-kanban.mmd) |
| Architecture | `architecture-beta` | ✅ | 🧪 | [`26-architecture.mmd`](26-architecture.mmd) |
| Radar | `radar-beta` | ✅ | 🧪 | [`27-radar.mmd`](27-radar.mmd) |
| Treemap | `treemap` / `treemap-beta` | ✅ | 🧪 | [`28-treemap.mmd`](28-treemap.mmd) |
| Couloirs | `swimlane-beta` | ✅ | 🧪 | [`29-swimlanes.mmd`](29-swimlanes.mmd) |
| Event Modeling | `eventmodeling` | ✅ | 🧪 | [`30-event-modeling.mmd`](30-event-modeling.mmd) |
| Venn | `venn-beta` | ✅ | 🧪 | [`31-venn.mmd`](31-venn.mmd) |
| Ishikawa | `ishikawa` / `ishikawa-beta` | ✅ | 🧪 | [`32-ishikawa.mmd`](32-ishikawa.mmd) |
| Wardley Map | `wardley-beta` | ✅ | 🧪 | [`33-wardley.mmd`](33-wardley.mmd) |
| Cynefin | `cynefin-beta` | ✅ | 🧪 | [`34-cynefin.mmd`](34-cynefin.mmd) |
| Arborescence | `treeView-beta` | ✅ | 🧪 | [`35-tree-view.mmd`](35-tree-view.mmd) |
| Railroad natif | `railroad-beta` | ✅ | 🧪 | [`36-railroad.mmd`](36-railroad.mmd) |
| Railroad EBNF | `railroad-ebnf-beta` | ✅ | 🧪 | [`37-railroad-ebnf.mmd`](37-railroad-ebnf.mmd) |
| Railroad ABNF | `railroad-abnf-beta` | ✅ | 🧪 | [`38-railroad-abnf.mmd`](38-railroad-abnf.mmd) |
| Railroad PEG | `railroad-peg-beta` | ✅ | 🧪 | [`39-railroad-peg.mmd`](39-railroad-peg.mmd) |
| Informations moteur | `info` | ✅ | Diagnostic | [`40-info.mmd`](40-info.mmd) |
| ZenUML | `zenuml` | ✅ | 🧪 | [`41-zenuml.mmd`](41-zenuml.mmd) |

## Capacités hors ligne supplémentaires

| Élément | Prise en charge | Mise en œuvre | Exemple validé |
|---|:---:|---|---|
| Plug-in officiel ZenUML | ✅ | `@mermaid-js/mermaid-zenuml` est inclus et chargé à la demande | [`41-zenuml.mmd`](41-zenuml.mmd) |
| Pack Iconify `logos` | ✅ | 2 091 icônes sont incluses dans le bundle | [`42-icon-packs.mmd`](42-icon-packs.mmd) |
| Pack Iconify `material-icon-theme` | ✅ | 1 174 icônes et les associations TreeView sont incluses | [`42-icon-packs.mmd`](42-icon-packs.mmd) |
| Images locales relatives | ✅ | Le fichier est lu dans l'espace de travail et incorporé en `data:` | [`43-local-image.mmd`](43-local-image.mmd) |
| Images déjà incorporées | ✅ | Les URI `data:` restent inchangées | Syntaxe Mermaid standard |

## Limitations intentionnelles

| Élément | Prise en charge | Motif |
|---|:---:|---|
| Ressources `http://` ou `https://` | ❌ | Le réseau reste bloqué pour garantir confidentialité et reproductibilité |
| Chemins locaux absolus ou hors espace de travail | ❌ | Ils sont refusés pour éviter la lecture de fichiers arbitraires |
| Autres plug-ins tiers non identifiés | ❌ | Il n'existe pas de liste finie à embarquer ; chaque module doit être audité et nommé explicitement |
| Autres packs parmi les milliers de packs Iconify | ❌ | Ils augmenteraient fortement la taille ; `logos` et `material-icon-theme` couvrent les usages documentés ici |

## Remarques

- Les 43 exemples indiqués comme pris en charge ont été analysés et rendus en
  SVG avec le bundle réellement utilisé par l'extension.
- Le symbole 🧪 ne signifie pas que le rendu est incomplet : il indique que
  Mermaid considère encore la syntaxe comme expérimentale.
- Les alias historiques utilisent le même moteur que leur syntaxe actuelle et
  ne nécessitent pas de fichiers d'exemple supplémentaires.
