# Mermaid 11.16.0 example gallery

This folder is a practical showcase of every diagram family supported by
**Mermaid Preview — 100% Offline**. Each `.mmd` file uses English labels,
realistic data, and the native features that make its diagram type useful. Open
any file in VS Code to render it locally; the local-image example intentionally
references the bundled asset beside the gallery.

See the [compatibility matrix](COMPATIBILITY.md) for parser stability, bundled
extensions, and intentional offline limitations.

## Gallery

| # | Diagram | File | Mermaid keyword | What the example demonstrates |
|---:|---|---|---|---|
| 01 | Flowchart | [`01-flowchart.mmd`](01-flowchart.mmd) | `flowchart` | Nested stages, decision paths, labeled links, reusable styles |
| 02 | ELK flowchart | [`02-flowchart-elk.mmd`](02-flowchart-elk.mmd) | `flowchart-elk` | ELK layout, nested systems, parallel services, data and integration paths |
| 03 | Sequence | [`03-sequence.mmd`](03-sequence.mmd) | `sequenceDiagram` | Actors, activation, notes, alternatives, loops, parallel and critical work |
| 04 | UML class | [`04-class.mmd`](04-class.mmd) | `classDiagram` | Interfaces, inheritance, composition, aggregation, multiplicities, members |
| 05 | UML state | [`05-state.mmd`](05-state.mmd) | `stateDiagram-v2` | Composite states, concurrency, choices, forks, joins, terminal paths |
| 06 | Entity relationship | [`06-entity-relationship.mmd`](06-entity-relationship.mmd) | `erDiagram` | Keys, typed attributes, cardinalities, ownership and lifecycle relations |
| 07 | User journey | [`07-user-journey.mmd`](07-user-journey.mmd) | `journey` | Journey phases, multiple participants and experience scores |
| 08 | Gantt | [`08-gantt.mmd`](08-gantt.mmd) | `gantt` | Dependencies, milestones, critical work, completed and active tasks |
| 09 | Pie | [`09-pie.mmd`](09-pie.mmd) | `pie` | Labeled proportions and visible values |
| 10 | Donut | [`10-donut.mmd`](10-donut.mmd) | `pie` + `donutHole` | Compact part-to-whole reporting with a configured center |
| 11 | Quadrant | [`11-quadrant.mmd`](11-quadrant.mmd) | `quadrantChart` | Strategy axes, named quadrants and positioned initiatives |
| 12 | Requirements | [`12-requirement.mmd`](12-requirement.mmd) | `requirementDiagram` | Functional, performance and interface requirements with traceability links |
| 13 | Git history | [`13-gitgraph.mmd`](13-gitgraph.mmd) | `gitGraph` | Release branches, commits, tags, merges and a production hotfix |
| 14 | C4 context | [`14-c4-context.mmd`](14-c4-context.mmd) | `C4Context` | People, external systems, system boundary and contextual relationships |
| 15 | C4 container | [`15-c4-container.mmd`](15-c4-container.mmd) | `C4Container` | Deployable units, data stores, protocols and external dependencies |
| 16 | C4 component | [`16-c4-component.mmd`](16-c4-component.mmd) | `C4Component` | Internal service responsibilities and component-level collaboration |
| 17 | C4 dynamic | [`17-c4-dynamic.mmd`](17-c4-dynamic.mmd) | `C4Dynamic` | Numbered runtime interactions for a complete business request |
| 18 | C4 deployment | [`18-c4-deployment.mmd`](18-c4-deployment.mmd) | `C4Deployment` | Cloud nodes, replicas, managed infrastructure and deployed containers |
| 19 | Mind map | [`19-mindmap.mmd`](19-mindmap.mmd) | `mindmap` | A deep hierarchy that combines workstreams, decisions and outcomes |
| 20 | Timeline | [`20-timeline.mmd`](20-timeline.mmd) | `timeline` | Periods, sections and multiple events per milestone |
| 21 | Sankey | [`21-sankey.mmd`](21-sankey.mmd) | `sankey-beta` | Quantified flow through acquisition, conversion and retention stages |
| 22 | XY chart | [`22-xy-chart.mmd`](22-xy-chart.mmd) | `xychart-beta` | Categorical axes with a bar series and a comparison line |
| 23 | Block diagram | [`23-block.mmd`](23-block.mmd) | `block-beta` | Column control, nested layers, database shapes and explicit signal paths |
| 24 | Packet | [`24-packet.mmd`](24-packet.mmd) | `packet-beta` | Bit ranges and a complete binary protocol header |
| 25 | Kanban | [`25-kanban.mmd`](25-kanban.mmd) | `kanban` | Delivery stages, tickets, ownership and priority metadata |
| 26 | Architecture | [`26-architecture.mmd`](26-architecture.mmd) | `architecture-beta` | Service groups, junctions, data stores and directional connections |
| 27 | Radar | [`27-radar.mmd`](27-radar.mmd) | `radar-beta` | Several alternatives compared across shared capability axes |
| 28 | Treemap | [`28-treemap.mmd`](28-treemap.mmd) | `treemap-beta` | Weighted hierarchical allocation across portfolios and teams |
| 29 | Swimlanes | [`29-swimlanes.mmd`](29-swimlanes.mmd) | `swimlane-beta` | Cross-team ownership, handoffs and an end-to-end operating process |
| 30 | Event Modeling | [`30-event-modeling.mmd`](30-event-modeling.mmd) | `eventmodeling` | Commands, events, views, policies and temporal business slices |
| 31 | Venn | [`31-venn.mmd`](31-venn.mmd) | `venn-beta` | Overlapping capabilities and shared outcomes |
| 32 | Ishikawa | [`32-ishikawa.mmd`](32-ishikawa.mmd) | `ishikawa-beta` | Structured root-cause analysis across operational categories |
| 33 | Wardley map | [`33-wardley.mmd`](33-wardley.mmd) | `wardley-beta` | User needs, value-chain dependencies and evolution stages |
| 34 | Cynefin | [`34-cynefin.mmd`](34-cynefin.mmd) | `cynefin-beta` | Decisions classified across clear, complicated, complex and chaotic domains |
| 35 | Tree view | [`35-tree-view.mmd`](35-tree-view.mmd) | `treeView-beta` | A realistic repository hierarchy with nested files and folders |
| 36 | Native railroad | [`36-railroad.mmd`](36-railroad.mmd) | `railroad-beta` | Ordered tokens, alternatives, optional elements and repetition |
| 37 | EBNF railroad | [`37-railroad-ebnf.mmd`](37-railroad-ebnf.mmd) | `railroad-ebnf-beta` | A coherent language grammar expressed in EBNF |
| 38 | ABNF railroad | [`38-railroad-abnf.mmd`](38-railroad-abnf.mmd) | `railroad-abnf-beta` | A protocol grammar with ABNF terminals and repetition |
| 39 | PEG railroad | [`39-railroad-peg.mmd`](39-railroad-peg.mmd) | `railroad-peg-beta` | Ordered choices and reusable parsing rules in PEG notation |
| 40 | Engine information | [`40-info.mmd`](40-info.mmd) | `info` | The version reported by the bundled Mermaid engine |
| 41 | ZenUML | [`41-zenuml.mmd`](41-zenuml.mmd) | `zenuml` | Typed participants, nested calls, parallel work, branching and recovery |
| 42 | Offline icon packs | [`42-icon-packs.mmd`](42-icon-packs.mmd) | `icon: "logos:react"` | Bundled product and file-type icons with no network dependency |
| 43 | Embedded local image | [`43-local-image.mmd`](43-local-image.mmd) | `img: "..."` | A workspace-relative asset safely embedded in the rendered SVG |

## Coverage notes

- The aliases `graph`, `flowchart-v2`, `classDiagram-v2`, and legacy
  `stateDiagram` use the same renderer families as the examples above, so they
  are not duplicated.
- `info` is an engine diagnostic rather than a business chart, but it is
  included because Mermaid exposes a dedicated detector for it.
- ZenUML and the `logos` and `material-icon-theme` Iconify packs are bundled in
  the extension and work without a network connection.
- Workspace-relative images are read locally and converted to `data:` URLs in
  the SVG. Paths outside the workspace are rejected.
- Diagram keywords ending in `-beta` are experimental and may change in a
  future Mermaid release.
