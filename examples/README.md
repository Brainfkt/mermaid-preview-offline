# Exemples Mermaid 11.16.0

Ce dossier couvre les types de diagrammes intégrés au moteur Mermaid `11.16.0`
embarqué par l'extension. Chaque fichier `.mmd` est autonome : ouvrez-le dans
VS Code pour afficher son aperçu hors ligne.

Consultez également la [`matrice de compatibilité`](COMPATIBILITY.md) pour voir
ce qui est actuellement pris en charge ou non par l'extension.

## Catalogue

| # | Type | Fichier | Mot-clé Mermaid |
|---:|---|---|---|
| 01 | Organigramme (flowchart) | [`01-flowchart.mmd`](01-flowchart.mmd) | `flowchart` |
| 02 | Organigramme avec moteur ELK | [`02-flowchart-elk.mmd`](02-flowchart-elk.mmd) | `flowchart-elk` |
| 03 | Séquence | [`03-sequence.mmd`](03-sequence.mmd) | `sequenceDiagram` |
| 04 | Classes UML | [`04-class.mmd`](04-class.mmd) | `classDiagram` |
| 05 | États UML | [`05-state.mmd`](05-state.mmd) | `stateDiagram-v2` |
| 06 | Entités-associations | [`06-entity-relationship.mmd`](06-entity-relationship.mmd) | `erDiagram` |
| 07 | Parcours utilisateur | [`07-user-journey.mmd`](07-user-journey.mmd) | `journey` |
| 08 | Gantt | [`08-gantt.mmd`](08-gantt.mmd) | `gantt` |
| 09 | Secteurs | [`09-pie.mmd`](09-pie.mmd) | `pie` |
| 10 | Anneau | [`10-donut.mmd`](10-donut.mmd) | `pie` + `donutHole` |
| 11 | Quadrants | [`11-quadrant.mmd`](11-quadrant.mmd) | `quadrantChart` |
| 12 | Exigences | [`12-requirement.mmd`](12-requirement.mmd) | `requirementDiagram` |
| 13 | Historique Git | [`13-gitgraph.mmd`](13-gitgraph.mmd) | `gitGraph` |
| 14 | C4 — contexte | [`14-c4-context.mmd`](14-c4-context.mmd) | `C4Context` |
| 15 | C4 — conteneurs | [`15-c4-container.mmd`](15-c4-container.mmd) | `C4Container` |
| 16 | C4 — composants | [`16-c4-component.mmd`](16-c4-component.mmd) | `C4Component` |
| 17 | C4 — dynamique | [`17-c4-dynamic.mmd`](17-c4-dynamic.mmd) | `C4Dynamic` |
| 18 | C4 — déploiement | [`18-c4-deployment.mmd`](18-c4-deployment.mmd) | `C4Deployment` |
| 19 | Carte mentale | [`19-mindmap.mmd`](19-mindmap.mmd) | `mindmap` |
| 20 | Frise chronologique | [`20-timeline.mmd`](20-timeline.mmd) | `timeline` |
| 21 | Sankey | [`21-sankey.mmd`](21-sankey.mmd) | `sankey-beta` |
| 22 | Graphique XY | [`22-xy-chart.mmd`](22-xy-chart.mmd) | `xychart-beta` |
| 23 | Diagramme de blocs | [`23-block.mmd`](23-block.mmd) | `block-beta` |
| 24 | Paquet binaire | [`24-packet.mmd`](24-packet.mmd) | `packet-beta` |
| 25 | Kanban | [`25-kanban.mmd`](25-kanban.mmd) | `kanban` |
| 26 | Architecture | [`26-architecture.mmd`](26-architecture.mmd) | `architecture-beta` |
| 27 | Radar | [`27-radar.mmd`](27-radar.mmd) | `radar-beta` |
| 28 | Treemap | [`28-treemap.mmd`](28-treemap.mmd) | `treemap-beta` |
| 29 | Couloirs (swimlanes) | [`29-swimlanes.mmd`](29-swimlanes.mmd) | `swimlane-beta` |
| 30 | Event Modeling | [`30-event-modeling.mmd`](30-event-modeling.mmd) | `eventmodeling` |
| 31 | Venn | [`31-venn.mmd`](31-venn.mmd) | `venn-beta` |
| 32 | Ishikawa | [`32-ishikawa.mmd`](32-ishikawa.mmd) | `ishikawa-beta` |
| 33 | Wardley Map | [`33-wardley.mmd`](33-wardley.mmd) | `wardley-beta` |
| 34 | Cynefin | [`34-cynefin.mmd`](34-cynefin.mmd) | `cynefin-beta` |
| 35 | Arborescence | [`35-tree-view.mmd`](35-tree-view.mmd) | `treeView-beta` |
| 36 | Railroad natif | [`36-railroad.mmd`](36-railroad.mmd) | `railroad-beta` |
| 37 | Railroad EBNF | [`37-railroad-ebnf.mmd`](37-railroad-ebnf.mmd) | `railroad-ebnf-beta` |
| 38 | Railroad ABNF | [`38-railroad-abnf.mmd`](38-railroad-abnf.mmd) | `railroad-abnf-beta` |
| 39 | Railroad PEG | [`39-railroad-peg.mmd`](39-railroad-peg.mmd) | `railroad-peg-beta` |
| 40 | Informations moteur | [`40-info.mmd`](40-info.mmd) | `info` |
| 41 | ZenUML | [`41-zenuml.mmd`](41-zenuml.mmd) | `zenuml` |
| 42 | Packs d'icônes hors ligne | [`42-icon-packs.mmd`](42-icon-packs.mmd) | `icon: "logos:react"` |
| 43 | Image locale incorporée | [`43-local-image.mmd`](43-local-image.mmd) | `img: "..."` |

## Périmètre

- Les variantes `graph`, `flowchart-v2`, `classDiagram-v2` et l'ancien
  `stateDiagram` utilisent les mêmes familles de diagrammes que leurs exemples
  ci-dessus ; elles ne sont donc pas dupliquées.
- `info` est un diagnostic du moteur, pas un graphique métier, mais il est inclus
  car il possède son propre détecteur Mermaid.
- ZenUML et les packs d'icônes `logos` et `material-icon-theme` sont embarqués
  dans le bundle et ne nécessitent aucune connexion.
- Les images relatives sont lues dans l'espace de travail puis incorporées en
  `data:` dans le SVG. Les chemins sortant de l'espace de travail sont refusés.
- Les syntaxes suffixées par `-beta` sont expérimentales et peuvent évoluer lors
  d'une future mise à jour de Mermaid.
