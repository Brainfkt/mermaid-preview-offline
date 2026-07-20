# Mermaid compatibility matrix

Current support in **Mermaid Preview — 100% Offline**, using the locally
bundled Mermaid `11.16.0` engine.

Legend:

- ✅ **Supported** — parsed and rendered to SVG by the extension.
- ❌ **Unsupported** — requires a module that is not bundled.
- 🧪 **Experimental** — supported, but the upstream Mermaid syntax may evolve.

## Supported diagram types

| Diagram type | Keyword | Support | Stability | Validated example |
|---|---|:---:|:---:|---|
| Flowchart | `flowchart` / `graph` | ✅ | Stable | [`01-flowchart.mmd`](01-flowchart.mmd) |
| ELK flowchart | `flowchart-elk` | ✅ | Stable | [`02-flowchart-elk.mmd`](02-flowchart-elk.mmd) |
| Sequence | `sequenceDiagram` | ✅ | Stable | [`03-sequence.mmd`](03-sequence.mmd) |
| UML class | `classDiagram` / `classDiagram-v2` | ✅ | Stable | [`04-class.mmd`](04-class.mmd) |
| UML state | `stateDiagram` / `stateDiagram-v2` | ✅ | Stable | [`05-state.mmd`](05-state.mmd) |
| Entity relationship | `erDiagram` | ✅ | Stable | [`06-entity-relationship.mmd`](06-entity-relationship.mmd) |
| User journey | `journey` | ✅ | Stable | [`07-user-journey.mmd`](07-user-journey.mmd) |
| Gantt | `gantt` | ✅ | Stable | [`08-gantt.mmd`](08-gantt.mmd) |
| Pie | `pie` | ✅ | Stable | [`09-pie.mmd`](09-pie.mmd) |
| Donut | `pie` + `donutHole` | ✅ | Stable | [`10-donut.mmd`](10-donut.mmd) |
| Quadrant | `quadrantChart` | ✅ | Stable | [`11-quadrant.mmd`](11-quadrant.mmd) |
| Requirements | `requirementDiagram` | ✅ | Stable | [`12-requirement.mmd`](12-requirement.mmd) |
| Git history | `gitGraph` | ✅ | Stable | [`13-gitgraph.mmd`](13-gitgraph.mmd) |
| C4 context | `C4Context` | ✅ | 🧪 | [`14-c4-context.mmd`](14-c4-context.mmd) |
| C4 container | `C4Container` | ✅ | 🧪 | [`15-c4-container.mmd`](15-c4-container.mmd) |
| C4 component | `C4Component` | ✅ | 🧪 | [`16-c4-component.mmd`](16-c4-component.mmd) |
| C4 dynamic | `C4Dynamic` | ✅ | 🧪 | [`17-c4-dynamic.mmd`](17-c4-dynamic.mmd) |
| C4 deployment | `C4Deployment` | ✅ | 🧪 | [`18-c4-deployment.mmd`](18-c4-deployment.mmd) |
| Mind map | `mindmap` | ✅ | Stable | [`19-mindmap.mmd`](19-mindmap.mmd) |
| Timeline | `timeline` | ✅ | Stable | [`20-timeline.mmd`](20-timeline.mmd) |
| Sankey | `sankey` / `sankey-beta` | ✅ | 🧪 | [`21-sankey.mmd`](21-sankey.mmd) |
| XY chart | `xychart` / `xychart-beta` | ✅ | 🧪 | [`22-xy-chart.mmd`](22-xy-chart.mmd) |
| Block diagram | `block` / `block-beta` | ✅ | 🧪 | [`23-block.mmd`](23-block.mmd) |
| Binary packet | `packet` / `packet-beta` | ✅ | 🧪 | [`24-packet.mmd`](24-packet.mmd) |
| Kanban | `kanban` | ✅ | 🧪 | [`25-kanban.mmd`](25-kanban.mmd) |
| Architecture | `architecture-beta` | ✅ | 🧪 | [`26-architecture.mmd`](26-architecture.mmd) |
| Radar | `radar-beta` | ✅ | 🧪 | [`27-radar.mmd`](27-radar.mmd) |
| Treemap | `treemap` / `treemap-beta` | ✅ | 🧪 | [`28-treemap.mmd`](28-treemap.mmd) |
| Swimlanes | `swimlane-beta` | ✅ | 🧪 | [`29-swimlanes.mmd`](29-swimlanes.mmd) |
| Event Modeling | `eventmodeling` | ✅ | 🧪 | [`30-event-modeling.mmd`](30-event-modeling.mmd) |
| Venn | `venn-beta` | ✅ | 🧪 | [`31-venn.mmd`](31-venn.mmd) |
| Ishikawa | `ishikawa` / `ishikawa-beta` | ✅ | 🧪 | [`32-ishikawa.mmd`](32-ishikawa.mmd) |
| Wardley map | `wardley-beta` | ✅ | 🧪 | [`33-wardley.mmd`](33-wardley.mmd) |
| Cynefin | `cynefin-beta` | ✅ | 🧪 | [`34-cynefin.mmd`](34-cynefin.mmd) |
| Tree view | `treeView-beta` | ✅ | 🧪 | [`35-tree-view.mmd`](35-tree-view.mmd) |
| Native railroad | `railroad-beta` | ✅ | 🧪 | [`36-railroad.mmd`](36-railroad.mmd) |
| EBNF railroad | `railroad-ebnf-beta` | ✅ | 🧪 | [`37-railroad-ebnf.mmd`](37-railroad-ebnf.mmd) |
| ABNF railroad | `railroad-abnf-beta` | ✅ | 🧪 | [`38-railroad-abnf.mmd`](38-railroad-abnf.mmd) |
| PEG railroad | `railroad-peg-beta` | ✅ | 🧪 | [`39-railroad-peg.mmd`](39-railroad-peg.mmd) |
| Engine information | `info` | ✅ | Diagnostic | [`40-info.mmd`](40-info.mmd) |
| ZenUML | `zenuml` | ✅ | 🧪 | [`41-zenuml.mmd`](41-zenuml.mmd) |

## Additional offline capabilities

| Capability | Support | Implementation | Validated example |
|---|:---:|---|---|
| Official ZenUML plug-in | ✅ | `@mermaid-js/mermaid-zenuml` is bundled and loaded on demand | [`41-zenuml.mmd`](41-zenuml.mmd) |
| Iconify `logos` pack | ✅ | 2,091 icons are included in the bundle | [`42-icon-packs.mmd`](42-icon-packs.mmd) |
| Iconify `material-icon-theme` pack | ✅ | 1,174 icons and TreeView associations are included | [`42-icon-packs.mmd`](42-icon-packs.mmd) |
| Relative local images | ✅ | The workspace file is read locally and embedded as a `data:` URL | [`43-local-image.mmd`](43-local-image.mmd) |
| Pre-embedded images | ✅ | Existing `data:` URLs are left unchanged | Standard Mermaid syntax |

## Intentional limitations

| Capability | Support | Reason |
|---|:---:|---|
| `http://` or `https://` resources | ❌ | Network access stays blocked for privacy and reproducibility |
| Absolute paths or paths outside the workspace | ❌ | Rejected to prevent arbitrary local file access |
| Unidentified third-party plug-ins | ❌ | Every additional module must be named, reviewed, and bundled explicitly |
| Other Iconify packs | ❌ | Bundling thousands of packs would add excessive weight; `logos` and `material-icon-theme` cover the documented use cases |

## Validation notes

- All 43 supported examples are parsed and rendered to SVG with the same bundle
  used by the extension.
- The 🧪 symbol does not mean rendering is incomplete; it means Mermaid still
  considers that grammar experimental.
- Historical aliases share the same renderer as their current syntax and do not
  need duplicate example files.
