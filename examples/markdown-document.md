# Mermaid documentation example

This Markdown document contains several Mermaid diagrams for testing Mermaid
Preview Offline 1.1.0.

Place the cursor anywhere between the opening and closing fences, then run
**Mermaid Preview: Preview Block Under Cursor**. You can also run **Mermaid
Preview: Preview All Blocks in Document** or **Mermaid Preview: Export Document
with Diagram Images…**.

```mermaid
%%{init: {"flowchart": {"curve": "basis"}}}%%
flowchart LR
  subgraph Authoring[Authoring in Markdown]
    Document[Documentation source] --> Scope{Preview scope}
    Scope -->|Cursor| Block[Current Mermaid block]
    Scope -->|Whole file| AllBlocks[Every Mermaid block]
  end

  subgraph OfflineEngine[Offline rendering pipeline]
    Block --> Parser[Extract and parse source]
    AllBlocks --> Parser
    Parser --> Valid{Syntax valid?}
    Valid -->|No| Diagnostic[Inline diagnostic with line context]
    Valid -->|Yes| SVG[Render accessible SVG]
    SVG --> Preview[Interactive pan, zoom, and minimap]
  end

  subgraph Delivery[Documentation delivery]
    Preview --> Navigate[Jump back to source]
    Preview --> Format{Export target}
    Format --> Optimized[Optimized SVG]
    Format --> Raster[PNG or WebP at selected DPI]
    Format --> PDF[Print-ready PDF]
  end

  Diagnostic -. Fix and refresh .-> Document

  classDef source fill:#ede9fe,stroke:#7c3aed,color:#2e1065
  classDef success fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef warning fill:#fef3c7,stroke:#d97706,color:#78350f
  class Document,Block,AllBlocks source
  class SVG,Preview,Optimized,Raster,PDF success
  class Diagnostic warning
```

## Release gate example

The second block demonstrates that one document can combine different Mermaid
diagram families while keeping navigation and export tied to each source block.

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Review : submit documentation

  state Review {
    [*] --> ValidateSyntax
    ValidateSyntax --> ValidateLinks : diagrams render
    ValidateLinks --> Accessibility : references resolve
    Accessibility --> [*] : structure and labels pass
  }

  state decision <<choice>>
  Review --> decision
  decision --> Draft : changes requested
  decision --> Approved : all checks pass
  Approved --> Published : release pipeline succeeds
  Published --> [*]

  note right of Review : Every Mermaid block is rendered offline before publication.
```

Everything is rendered locally: the document and diagram source never leave
the workspace.

## Azure DevOps-style container

The third block exercises the `::: mermaid` form introduced in version 1.1.

::: mermaid
flowchart LR
  Wiki[Documentation container] --> Preview[Independent preview]
  Preview --> Resize[Resize and navigate]
:::
