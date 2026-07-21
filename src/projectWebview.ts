import mermaid from 'mermaid';

import type { DiagramFontFamily } from './diagramFont';
import { resolvedDiagramFontStack } from './diagramFontAssets';
import {
  defaultTemplateValues,
  renderDiagramTemplate,
  type DiagramExample,
  type DiagramTemplate,
  type DiagramTemplateField,
} from './diagramTemplates';
import { prepareMermaidExtensions, registerOfflineIconPacks } from './mermaidExtensions';
import {
  replaceSvgAttributeIdReferences,
  replaceSvgStyleIdReferences,
} from './svgIdReferences';
import type { LineDiffSummary } from './visualDiff';

interface VsCodeApi {
  getState(): unknown;
  postMessage(message: ProjectWebviewToExtensionMessage): void;
  setState(state: unknown): void;
}

interface GalleryDataMessage {
  examples: DiagramExample[];
  fontFamily: DiagramFontFamily;
  initialTab: GalleryTab;
  templates: DiagramTemplate[];
  type: 'galleryData';
}

interface VisualDiffDataMessage {
  after: { label: string; source: string };
  before: { label: string; source: string };
  fontFamily: DiagramFontFamily;
  summary: LineDiffSummary;
  title: string;
  type: 'visualDiffData';
}

type ExtensionToProjectWebviewMessage = GalleryDataMessage | VisualDiffDataMessage;
type ProjectWebviewToExtensionMessage =
  | { type: 'ready' }
  | { fileName: string; source: string; type: 'createDiagram' };
type GalleryTab = 'examples' | 'templates';
type GalleryItem =
  | { kind: 'example'; value: DiagramExample }
  | { kind: 'template'; value: DiagramTemplate };

declare function acquireVsCodeApi(): VsCodeApi;

registerOfflineIconPacks();
const vscode = acquireVsCodeApi();
let renderSequence = 0;
let renderQueue = Promise.resolve();
let activeFontFamily: DiagramFontFamily = 'vscode';

initializeMermaid(activeFontFamily);

if (document.querySelector('#project-gallery')) {
  initializeGallery();
} else if (document.querySelector('#visual-diff')) {
  initializeVisualDiff();
}

vscode.postMessage({ type: 'ready' });

function initializeGallery(): void {
  const templatesTab = element<HTMLButtonElement>('templates-tab');
  const examplesTab = element<HTMLButtonElement>('examples-tab');
  const search = element<HTMLInputElement>('catalog-search');
  const count = element<HTMLElement>('catalog-count');
  const categories = element<HTMLElement>('category-filter');
  const grid = element<HTMLElement>('catalog-grid');
  const empty = element<HTMLElement>('catalog-empty');
  const inspectorCategory = element<HTMLElement>('inspector-category');
  const inspectorTitle = element<HTMLElement>('inspector-title');
  const inspectorDescription = element<HTMLElement>('inspector-description');
  const previewPlaceholder = element<HTMLElement>('preview-placeholder');
  const preview = element<HTMLElement>('inspector-diagram');
  const previewError = element<HTMLElement>('inspector-error');
  const fields = element<HTMLElement>('template-fields');
  const source = element<HTMLTextAreaElement>('template-source');
  const fileName = element<HTMLInputElement>('template-file-name');
  const create = element<HTMLButtonElement>('create-diagram');
  const reset = element<HTMLButtonElement>('reset-template');
  const form = element<HTMLFormElement>('template-form');
  let templates: DiagramTemplate[] = [];
  let examples: DiagramExample[] = [];
  let activeTab: GalleryTab = 'templates';
  let activeCategory = 'All';
  let selected: GalleryItem | undefined;
  let previewTimer: number | undefined;
  let previewGeneration = 0;
  let catalogGeneration = 0;
  let cardObserver: IntersectionObserver | undefined;
  const cardSources = new Map<Element, string>();

  window.addEventListener('message', (event: MessageEvent<ExtensionToProjectWebviewMessage>) => {
    if (event.data.type !== 'galleryData') return;
    activeFontFamily = event.data.fontFamily;
    initializeMermaid(activeFontFamily);
    templates = event.data.templates;
    examples = event.data.examples;
    activeTab = event.data.initialTab;
    setTab(activeTab);
  });

  templatesTab.addEventListener('click', () => setTab('templates'));
  examplesTab.addEventListener('click', () => setTab('examples'));
  search.addEventListener('input', () => renderCatalog());
  reset.addEventListener('click', () => {
    if (selected?.kind === 'template') selectItem(selected);
  });
  source.addEventListener('input', () => schedulePreview(source.value));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!selected || !source.value.trim()) return;
    vscode.postMessage({
      fileName: fileName.value,
      source: source.value,
      type: 'createDiagram',
    });
  });

  function setTab(tab: GalleryTab): void {
    activeTab = tab;
    activeCategory = 'All';
    search.value = '';
    search.placeholder = tab === 'templates' ? 'Search templates' : 'Search examples';
    templatesTab.classList.toggle('is-active', tab === 'templates');
    examplesTab.classList.toggle('is-active', tab === 'examples');
    selected = undefined;
    renderCategories();
    renderCatalog();
    const first = filteredItems()[0];
    if (first) selectItem(first);
    vscode.setState({ activeTab });
  }

  function allItems(): GalleryItem[] {
    return activeTab === 'templates'
      ? templates.map((value) => ({ kind: 'template' as const, value }))
      : examples.map((value) => ({ kind: 'example' as const, value }));
  }

  function filteredItems(): GalleryItem[] {
    const query = search.value.trim().toLocaleLowerCase();
    return allItems().filter((item) => {
      const matchesCategory = activeCategory === 'All' || item.value.category === activeCategory;
      const description = item.kind === 'template' ? item.value.description : item.value.fileName;
      return matchesCategory && (!query || `${item.value.title} ${item.value.category} ${description}`.toLocaleLowerCase().includes(query));
    });
  }

  function renderCategories(): void {
    categories.replaceChildren();
    const names = ['All', ...new Set(allItems().map((item) => item.value.category))];
    for (const name of names) {
      const button = document.createElement('button');
      button.className = 'category-button';
      button.classList.toggle('is-active', name === activeCategory);
      button.type = 'button';
      button.textContent = name;
      button.addEventListener('click', () => {
        activeCategory = name;
        renderCategories();
        renderCatalog();
      });
      categories.append(button);
    }
  }

  function renderCatalog(): void {
    const generation = ++catalogGeneration;
    cardObserver?.disconnect();
    cardSources.clear();
    grid.replaceChildren();
    const items = filteredItems();
    count.textContent = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;
    empty.hidden = items.length !== 0;
    for (const item of items) {
      const card = document.createElement('button');
      card.className = 'catalog-card';
      card.classList.toggle('is-selected', itemId(item) === itemId(selected));
      card.type = 'button';
      card.dataset.itemId = itemId(item);
      const cardPreview = document.createElement('span');
      cardPreview.className = 'catalog-card__preview';
      const placeholder = document.createElement('span');
      placeholder.className = 'card-placeholder';
      placeholder.textContent = 'Rendering…';
      cardPreview.append(placeholder);
      const copy = document.createElement('span');
      copy.className = 'catalog-card__copy';
      const title = document.createElement('strong');
      title.textContent = item.value.title;
      const category = document.createElement('span');
      category.textContent = item.value.category;
      copy.append(title, category);
      card.append(cardPreview, copy);
      card.addEventListener('click', () => selectItem(item, true));
      grid.append(card);
      cardSources.set(cardPreview, sourceFor(item));
    }
    cardObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        cardObserver?.unobserve(entry.target);
        const itemSource = cardSources.get(entry.target);
        if (itemSource) {
          void renderMermaid(
            entry.target as HTMLElement,
            itemSource,
            undefined,
            true,
            () => generation === catalogGeneration,
          );
        }
      }
    }, { root: document.querySelector('.catalog'), rootMargin: '180px' });
    for (const target of cardSources.keys()) cardObserver.observe(target);
  }

  function selectItem(item: GalleryItem, revealInspector = false): void {
    selected = item;
    for (const card of Array.from(grid.querySelectorAll('.catalog-card'))) {
      card.classList.toggle('is-selected', (card as HTMLElement).dataset.itemId === itemId(item));
    }
    inspectorCategory.textContent = `${item.kind === 'template' ? 'Template' : 'Example'} · ${item.value.category}`;
    inspectorTitle.textContent = item.value.title;
    inspectorDescription.textContent = item.kind === 'template'
      ? item.value.description
      : `Bundled example · ${item.value.fileName}`;
    reset.hidden = item.kind !== 'template';
    source.disabled = false;
    fileName.disabled = false;
    create.disabled = false;
    fields.replaceChildren();
    if (item.kind === 'template') {
      const values = defaultTemplateValues(item.value);
      for (const field of item.value.fields) fields.append(createField(field, values));
      source.value = renderDiagramTemplate(item.value, values);
      fileName.value = item.value.fileName;
    } else {
      source.value = item.value.source;
      fileName.value = item.value.fileName.replace(/^\d+[-_]?/u, '');
    }
    schedulePreview(source.value, 0);
    if (revealInspector && window.matchMedia('(max-width: 820px)').matches) {
      const inspector = element<HTMLElement>('template-inspector');
      const scrollContainer = inspector.closest<HTMLElement>('.studio__main');
      const scrollTop = scrollContainer
        ? scrollContainer.scrollTop + inspector.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top
        : 0;
      scrollContainer?.scrollTo({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        top: scrollTop,
      });
    }
  }

  function createField(field: DiagramTemplateField, values: Record<string, string>): HTMLElement {
    const label = document.createElement('label');
    label.className = 'field';
    const caption = document.createElement('span');
    caption.textContent = field.label;
    let input: HTMLInputElement | HTMLSelectElement;
    if (field.kind === 'select') {
      input = document.createElement('select');
      for (const option of field.options ?? []) {
        const elementOption = document.createElement('option');
        elementOption.value = option.value;
        elementOption.textContent = option.label;
        input.append(elementOption);
      }
    } else {
      input = document.createElement('input');
      input.type = field.kind === 'number' ? 'number' : 'text';
      if (field.minimum !== undefined) input.min = String(field.minimum);
      if (field.maximum !== undefined) input.max = String(field.maximum);
      if (field.placeholder) input.placeholder = field.placeholder;
    }
    input.value = field.defaultValue;
    input.addEventListener('input', () => {
      values[field.id] = input.value;
      if (selected?.kind === 'template') {
        source.value = renderDiagramTemplate(selected.value, values);
        schedulePreview(source.value);
      }
    });
    label.append(caption, input);
    return label;
  }

  function schedulePreview(value: string, delay = 160): void {
    const generation = ++previewGeneration;
    if (previewTimer !== undefined) window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => {
      previewTimer = undefined;
      previewPlaceholder.hidden = true;
      preview.hidden = false;
      void renderMermaid(
        preview,
        value,
        previewError,
        false,
        () => generation === previewGeneration,
      );
    }, delay);
  }
}

function initializeVisualDiff(): void {
  const title = element<HTMLElement>('diff-title');
  const subtitle = element<HTMLElement>('diff-subtitle');
  const beforeLabel = element<HTMLElement>('before-label');
  const afterLabel = element<HTMLElement>('after-label');
  const beforeDiagram = element<HTMLElement>('before-diagram');
  const afterDiagram = element<HTMLElement>('after-diagram');
  const beforeError = element<HTMLElement>('before-error');
  const afterError = element<HTMLElement>('after-error');
  const overlayBefore = element<HTMLElement>('overlay-before');
  const overlayAfter = element<HTMLElement>('overlay-after');
  const grid = element<HTMLElement>('diff-grid');
  const overlay = element<HTMLElement>('overlay-view');
  const sideBySideButton = element<HTMLButtonElement>('side-by-side-mode');
  const overlayButton = element<HTMLButtonElement>('overlay-mode');
  const zoom = element<HTMLInputElement>('diff-zoom');
  const zoomValue = element<HTMLElement>('diff-zoom-value');
  const opacity = element<HTMLInputElement>('overlay-opacity');
  const opacityValue = element<HTMLElement>('overlay-opacity-value');
  let diffGeneration = 0;

  window.addEventListener('message', (event: MessageEvent<ExtensionToProjectWebviewMessage>) => {
    if (event.data.type !== 'visualDiffData') return;
    const data = event.data;
    activeFontFamily = data.fontFamily;
    initializeMermaid(activeFontFamily);
    const generation = ++diffGeneration;
    title.textContent = data.title;
    subtitle.textContent = `${data.before.label} → ${data.after.label}`;
    beforeLabel.textContent = data.before.label;
    afterLabel.textContent = data.after.label;
    element<HTMLElement>('diff-added').textContent = String(data.summary.added);
    element<HTMLElement>('diff-changed').textContent = String(data.summary.changed);
    element<HTMLElement>('diff-removed').textContent = String(data.summary.removed);
    void Promise.all([
      renderMermaid(
        beforeDiagram,
        data.before.source,
        beforeError,
        false,
        () => generation === diffGeneration,
      ),
      renderMermaid(
        afterDiagram,
        data.after.source,
        afterError,
        false,
        () => generation === diffGeneration,
      ),
    ]).then(() => {
      if (generation !== diffGeneration) return;
      copyRenderedDiagram(beforeDiagram, overlayBefore, `before-${generation}`);
      copyRenderedDiagram(afterDiagram, overlayAfter, `after-${generation}`);
    });
  });

  sideBySideButton.addEventListener('click', () => setMode('side'));
  overlayButton.addEventListener('click', () => setMode('overlay'));
  zoom.addEventListener('input', () => {
    const value = Number(zoom.value) / 100;
    zoomValue.textContent = `${zoom.value}%`;
    for (const diagram of [beforeDiagram, afterDiagram, overlayBefore, overlayAfter]) {
      diagram.style.transform = `scale(${value})`;
    }
  });
  opacity.addEventListener('input', () => {
    overlayAfter.style.opacity = String(Number(opacity.value) / 100);
    opacityValue.textContent = `${opacity.value}%`;
  });

  function setMode(mode: 'overlay' | 'side'): void {
    grid.hidden = mode !== 'side';
    overlay.hidden = mode !== 'overlay';
    sideBySideButton.classList.toggle('is-active', mode === 'side');
    overlayButton.classList.toggle('is-active', mode === 'overlay');
  }
}

function copyRenderedDiagram(
  source: HTMLElement,
  target: HTMLElement,
  idSuffix: string,
): void {
  target.replaceChildren(
    ...Array.from(source.childNodes, (node: ChildNode) => node.cloneNode(true)),
  );
  const idMap = new Map<string, string>();
  for (const node of Array.from(target.querySelectorAll<HTMLElement>('[id]'))) {
    const previous = node.id;
    const next = `${previous}-${idSuffix}`;
    idMap.set(previous, next);
    node.id = next;
  }
  for (const node of Array.from(target.querySelectorAll('*'))) {
    for (const attribute of Array.from(node.attributes)) {
      const value = replaceSvgAttributeIdReferences(attribute.name, attribute.value, idMap);
      if (value !== attribute.value) attribute.value = value;
    }
  }
  target.querySelectorAll('style').forEach((style) => {
    if (style.textContent) {
      style.textContent = replaceSvgStyleIdReferences(style.textContent, idMap);
    }
  });
  target.hidden = source.hidden;
}

async function renderMermaid(
  target: HTMLElement,
  source: string,
  errorTarget?: HTMLElement,
  compact = false,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const render = async (): Promise<void> => {
    if (!target.isConnected || !isCurrent()) return;
    try {
      await prepareMermaidExtensions(source, activeFontFamily);
      if (!target.isConnected || !isCurrent()) return;
      const result = await mermaid.render(`mermaid-project-${++renderSequence}`, source);
      if (!target.isConnected || !isCurrent()) {
        removeTemporaryProjectRenderNodes();
        return;
      }
      target.innerHTML = result.svg;
      target.dataset.renderSource = source;
      errorTarget?.setAttribute('hidden', '');
      target.removeAttribute('hidden');
    } catch (error: unknown) {
      target.replaceChildren();
      target.dataset.renderSource = source;
      if (errorTarget) {
        errorTarget.textContent = error instanceof Error ? error.message : String(error);
        errorTarget.removeAttribute('hidden');
      } else if (compact) {
        const message = document.createElement('span');
        message.className = 'card-placeholder';
        message.textContent = 'Preview unavailable';
        target.append(message);
      }
      removeTemporaryProjectRenderNodes();
    }
  };
  const queued = renderQueue.then(render, render);
  renderQueue = queued.then(() => undefined, () => undefined);
  await queued;
}

function removeTemporaryProjectRenderNodes(): void {
  document.querySelectorAll('body > [id^="dmermaid-project-"]').forEach((node) => node.remove());
}

function initializeMermaid(fontFamily: DiagramFontFamily): void {
  const isDark = document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast');
  mermaid.initialize({
    deterministicIds: true,
    deterministicIDSeed: 'mermaid-preview-offline-project',
    flowchart: { htmlLabels: true, useMaxWidth: false },
    fontFamily: resolvedDiagramFontStack(fontFamily),
    gantt: { useMaxWidth: false },
    securityLevel: 'strict',
    sequence: { useMaxWidth: false },
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
  });
}

function sourceFor(item: GalleryItem): string {
  return item.kind === 'template' ? renderDiagramTemplate(item.value) : item.value.source;
}

function itemId(item: GalleryItem | undefined): string {
  return item ? `${item.kind}:${item.value.id}` : '';
}

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing #${id}.`);
  return value as T;
}
