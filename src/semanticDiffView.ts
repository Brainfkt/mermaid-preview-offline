import { compareFlowcharts, type SemanticEdge, type SemanticNode } from './semanticDiff';

type ChangeKind = 'added' | 'removed' | 'modified';
interface Change {
  kind: ChangeKind;
  entity: 'node' | 'edge';
  before?: SemanticNode | SemanticEdge;
  after?: SemanticNode | SemanticEdge;
  description: string;
}

/** A bounded, keyboard-accessible review list layered on the existing visual diff. */
export function createSemanticDiffView(
  root: HTMLElement,
  beforeSurfaces: HTMLElement[],
  afterSurfaces: HTMLElement[],
): { setSources(before: string, after: string): void; refreshHighlights(): void } {
  const panel = document.createElement('details');
  panel.id = 'semantic-diff';
  panel.className = 'semantic-review';
  panel.open = true;
  const summary = document.createElement('summary');
  summary.textContent = 'Diagram changes';
  const note = document.createElement('p');
  note.className = 'semantic-review__note';
  const list = document.createElement('div');
  list.className = 'semantic-review__list';
  list.setAttribute('aria-label', 'Changed nodes and links');
  panel.append(summary, note, list);
  root.querySelector('.diff-summary')?.after(panel);
  let changes: Change[] = [];
  let selected: Change | undefined;
  const indexes = new Map<HTMLElement, { nodes: Map<string, Element[]>; edges: Map<string, Element[]> }>();

  function clearHighlights(): void {
    for (const surface of [...beforeSurfaces, ...afterSurfaces]) {
      for (const element of Array.from(surface.querySelectorAll('[data-semantic-change]'))) {
        element.removeAttribute('data-semantic-change');
        element.classList.remove('semantic-selected');
      }
    }
  }

  function targets(surface: HTMLElement, change: Change, entity: SemanticNode | SemanticEdge): Element[] {
    const index = indexes.get(surface);
    return change.entity === 'node'
      ? index?.nodes.get((entity as SemanticNode).id) ?? []
      : index?.edges.get((entity as SemanticEdge).renderId) ?? [];
  }

  function refreshHighlights(): void {
    clearHighlights();
    indexes.clear();
    for (const surface of [...beforeSurfaces, ...afterSurfaces]) {
      const nodes = new Map<string, Element[]>();
      const edges = new Map<string, Element[]>();
      for (const element of Array.from(surface.querySelectorAll('.node, .cluster'))) {
        const rawId = localSvgId(element);
        const id = element.getAttribute('data-id') ??
          (element.classList.contains('cluster') ? rawId : /^flowchart-(.+)-\d+$/u.exec(rawId)?.[1] ?? rawId);
        nodes.set(id, [...nodes.get(id) ?? [], element]);
      }
      for (const element of Array.from(surface.querySelectorAll('.flowchart-link, .edgeLabel [data-id]'))) {
        const id = element.getAttribute('data-id') ?? localSvgId(element);
        edges.set(id, [...edges.get(id) ?? [], element]);
      }
      indexes.set(surface, { nodes, edges });
    }
    for (const change of changes) {
      for (const [surfaces, entity] of [
        [beforeSurfaces, change.before], [afterSurfaces, change.after],
      ] as const) {
        if (!entity) continue;
        for (const surface of surfaces) {
          for (const element of targets(surface, change, entity)) {
            element.setAttribute('data-semantic-change', change.kind);
            element.classList.toggle('semantic-selected', selected === change);
          }
        }
      }
    }
  }

  function select(change: Change, button: HTMLButtonElement): void {
    selected = change;
    for (const entry of Array.from(list.querySelectorAll('button'))) {
      entry.setAttribute('aria-pressed', String(entry === button));
    }
    refreshHighlights();
    for (const [surfaces, entity] of [
      [beforeSurfaces, change.before], [afterSurfaces, change.after],
    ] as const) {
      if (!entity) continue;
      for (const surface of surfaces) {
        const target = targets(surface, change, entity)[0];
        const viewport = surface.closest<HTMLElement>('.diff-canvas, .overlay-canvas');
        if (!target || !viewport || viewport.getClientRects().length === 0) continue;
        const bounds = target.getBoundingClientRect();
        const frame = viewport.getBoundingClientRect();
        viewport.scrollBy({
          left: bounds.left + bounds.width / 2 - frame.left - frame.width / 2,
          top: bounds.top + bounds.height / 2 - frame.top - frame.height / 2,
          behavior: 'smooth',
        });
      }
    }
  }

  function setSources(before: string, after: string): void {
    clearHighlights();
    changes = [];
    selected = undefined;
    list.replaceChildren();
    const result = compareFlowcharts(before, after);
    panel.dataset.status = result.status;
    if (result.status === 'unsupported') {
      summary.textContent = 'Diagram changes unavailable';
      note.textContent = `${result.side === 'before' ? 'Before' : 'After'}: ${result.reason}${result.line ? ` (line ${result.line})` : ''} Use the visual comparison and source-line counts above.`;
      return;
    }
    for (const [entity, diff] of [['node', result.nodes], ['edge', result.edges]] as const) {
      for (const value of diff.added) {
        changes.push({ entity, kind: 'added', after: value, description: describe(entity, value) });
      }
      for (const value of diff.removed) {
        changes.push({ entity, kind: 'removed', before: value, description: describe(entity, value) });
      }
      for (const value of diff.modified) {
        changes.push({
          entity, kind: 'modified', before: value.before, after: value.after,
          description: `${describe(entity, value.before)} → ${describe(entity, value.after)} (${value.fields.join(', ')})`,
        });
      }
    }
    summary.textContent = `Diagram changes · ${result.summary.added} added · ${result.summary.modified} modified · ${result.summary.removed} removed`;
    note.textContent = changes.length
      ? 'Select a change to locate it in both diagrams. Green: added · amber: modified · red: removed.'
      : 'No structural changes to nodes or links.';
    note.textContent += ' Styling and layout changes are excluded.';
    note.title = result.limitations.join(' ');
    for (const change of changes.slice(0, 200)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'semantic-review__change';
      button.dataset.changeKind = change.kind;
      button.dataset.entity = change.entity;
      button.textContent = `${change.kind === 'added' ? '+' : change.kind === 'removed' ? '−' : '~'} ${change.description}`;
      button.title = `${change.kind}: ${change.description}`;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => select(change, button));
      list.append(button);
    }
    if (changes.length > 200) note.textContent += ` Showing the first 200 of ${changes.length} changes.`;
    refreshHighlights();
  }

  return { setSources, refreshHighlights };
}

function describe(kind: 'node' | 'edge', value: SemanticNode | SemanticEdge): string {
  if (kind === 'node') {
    const node = value as SemanticNode;
    return `${node.kind === 'subgraph' ? 'Group' : 'Node'} ${node.id}${node.label !== node.id ? `: ${node.label}` : ''}`;
  }
  const edge = value as SemanticEdge;
  return `Link ${edge.from} → ${edge.to}${edge.label ? `: ${edge.label}` : ''}`;
}

function localSvgId(element: Element): string {
  const cloneSuffix = /-(?:before|after)-\d+$/u;
  const svgId = element.closest('svg')?.id.replace(cloneSuffix, '');
  const id = element.id.replace(cloneSuffix, '');
  return svgId && id.startsWith(`${svgId}-`) ? id.slice(svgId.length + 1) : id;
}
