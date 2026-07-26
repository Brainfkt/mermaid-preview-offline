import { MARKDOWN_PREVIEW_CONFIGURATION_ID } from './markdownPreviewConfiguration';

const FIT_BUTTON_SELECTOR = '.mermaid-wrapper .zoom-reset-btn';
const RESIZE_HANDLE_SELECTOR = '.mermaid-wrapper .mermaid-resize-handle';
const RESIZE_MEMORY_STORAGE_KEY =
  'mermaidPreviewOffline.markdownResizeHeights.v1';
const MAX_RESIZE_MEMORY_ENTRIES = 256;
const MIN_REMEMBERED_HEIGHT = 100;
const MAX_REMEMBERED_HEIGHT = 50_000;
const FIT_PADDING = 16;
const MIN_NATIVE_SCALE = 0.5;
const MAX_NATIVE_SCALE = 10;
const NATIVE_ZOOM_FACTOR = 0.002;

interface ResizeMemoryEntry {
  height: number;
  updatedAt: number;
}

export type ResizeMemory = Record<string, ResizeMemoryEntry>;

export interface DiagramFit {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface DiagramTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export function calculateDiagramFit(
  containerWidth: number,
  containerHeight: number,
  diagramWidth: number,
  diagramHeight: number,
  padding = FIT_PADDING,
): DiagramFit {
  const availableWidth = Math.max(containerWidth - padding, 1);
  const availableHeight = Math.max(containerHeight - padding, 1);
  const safeDiagramWidth = Math.max(diagramWidth, 1);
  const safeDiagramHeight = Math.max(diagramHeight, 1);
  const scale = clamp(
    Math.min(availableWidth / safeDiagramWidth, availableHeight / safeDiagramHeight),
    MIN_NATIVE_SCALE,
    MAX_NATIVE_SCALE,
  );
  return {
    scale,
    translateX: (containerWidth - safeDiagramWidth * scale) / 2,
    translateY: (containerHeight - safeDiagramHeight * scale) / 2,
  };
}

export function parseDiagramTransform(value: string): DiagramTransform | undefined {
  const match = value.match(
    /translate\(\s*(-?\d+(?:\.\d+)?)px(?:,\s*|\s+)(-?\d+(?:\.\d+)?)px\s*\)\s*scale\(\s*(\d+(?:\.\d+)?)\s*\)/u,
  );
  if (!match) return undefined;
  const translateX = Number(match[1]);
  const translateY = Number(match[2]);
  const scale = Number(match[3]);
  if (![translateX, translateY, scale].every(Number.isFinite) || scale <= 0) return undefined;
  return { scale, translateX, translateY };
}

export function nativeWheelDelta(currentScale: number, targetScale: number): number {
  if (currentScale <= 0 || targetScale <= 0) return 0;
  return -(targetScale / currentScale - 1) / NATIVE_ZOOM_FACTOR;
}

export function markdownResizeMemoryKey(
  documentSource: string,
  diagramId: string,
): string {
  return `${documentSource}\n${diagramId}`;
}

export function normalizeResizeMemory(value: unknown): ResizeMemory {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value)
    .flatMap(([key, candidate]): Array<[string, ResizeMemoryEntry]> => {
      if (!isRecord(candidate)) return [];
      const height = candidate.height;
      const updatedAt = candidate.updatedAt;
      if (
        typeof height !== 'number' ||
        !Number.isFinite(height) ||
        height < MIN_REMEMBERED_HEIGHT ||
        height > MAX_REMEMBERED_HEIGHT ||
        typeof updatedAt !== 'number' ||
        !Number.isFinite(updatedAt) ||
        updatedAt < 0
      ) {
        return [];
      }
      return [[key, { height, updatedAt }]];
    })
    .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    .slice(0, MAX_RESIZE_MEMORY_ENTRIES);
  return Object.fromEntries(entries);
}

let activeResize:
  | { documentSource: string; wrapper: HTMLElement }
  | undefined;
let currentDocumentSource = '';
let persistenceEnabled = true;
let restoreScheduled = false;
let suppressResizeMemoryEvents = false;
let volatileResizeMemory: ResizeMemory = {};
const restoredWrappers = new WeakMap<HTMLElement, string>();

function installMarkdownPreviewResizeFit(): void {
  document.addEventListener('click', handleFitClick, { capture: true });
  document.addEventListener('keydown', handleResizeKeydown, { capture: true });
  document.addEventListener('mousedown', handleResizeStart, { capture: true });
  document.addEventListener('mousemove', handleResizeMove, { capture: true });
  document.addEventListener('mouseup', handleResizeEnd, { capture: true });
  window.addEventListener('blur', handleResizeBlur);
  window.addEventListener('message', handlePreviewMessage, { capture: true });
  window.addEventListener('vscode.markdown.updateContent', handleMarkdownUpdate);
  currentDocumentSource = readInitialDocumentSource();
  persistenceEnabled = readPersistenceEnabled();
  if (!persistenceEnabled) clearResizeMemory();
  updateMarkdownPreviewEnhancements();
  const observer = new MutationObserver(updateMarkdownPreviewEnhancements);
  observer.observe(document.body, { childList: true, subtree: true });
}

function handleFitClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>(FIT_BUTTON_SELECTOR);
  if (!button) return;
  const wrapper = button.closest<HTMLElement>('.mermaid-wrapper');
  if (!wrapper) return;

  // VS Code's native reset also clears its private customHeight. Keep that state
  // intact and drive the native pan/zoom listeners to fit the current viewport.
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  fitNativeDiagram(wrapper);
}

function handleResizeStart(event: MouseEvent): void {
  if (suppressResizeMemoryEvents || !persistenceEnabled) return;
  const wrapper = resizeWrapperFromTarget(event.target);
  if (!wrapper || !currentDocumentSource) return;
  activeResize = { documentSource: currentDocumentSource, wrapper };
}

function handleResizeMove(event: MouseEvent): void {
  if (event.buttons !== 0 || !activeResize) return;
  rememberWrapperHeight(activeResize.wrapper, activeResize.documentSource);
  activeResize = undefined;
}

function handleResizeEnd(): void {
  if (!activeResize) return;
  rememberWrapperHeight(activeResize.wrapper, activeResize.documentSource);
  activeResize = undefined;
}

function handleResizeBlur(): void {
  handleResizeEnd();
}

function handleResizeKeydown(event: KeyboardEvent): void {
  if (
    suppressResizeMemoryEvents ||
    !persistenceEnabled ||
    (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
  ) {
    return;
  }
  const wrapper = resizeWrapperFromTarget(event.target);
  const documentSource = currentDocumentSource;
  if (!wrapper || !documentSource) return;
  requestAnimationFrame(() => {
    rememberWrapperHeight(wrapper, documentSource);
  });
}

function handlePreviewMessage(event: MessageEvent<unknown>): void {
  if (
    isRecord(event.data) &&
    event.data.type === 'updateContent' &&
    typeof event.data.source === 'string'
  ) {
    currentDocumentSource = event.data.source;
    scheduleRememberedHeightRestore();
  }
}

function handleMarkdownUpdate(): void {
  refreshPersistenceEnabled();
  scheduleRememberedHeightRestore();
}

function updateMarkdownPreviewEnhancements(): void {
  decorateFitButtons();
  refreshPersistenceEnabled();
  scheduleRememberedHeightRestore();
}

function scheduleRememberedHeightRestore(): void {
  if (restoreScheduled || !persistenceEnabled || !currentDocumentSource) return;
  restoreScheduled = true;
  requestAnimationFrame(() => {
    restoreScheduled = false;
    restoreRememberedHeights();
  });
}

function restoreRememberedHeights(): void {
  if (!persistenceEnabled || !currentDocumentSource) return;
  const memory = readResizeMemory();
  document.querySelectorAll<HTMLElement>('.mermaid-wrapper').forEach((wrapper) => {
    const diagramId = diagramIdForWrapper(wrapper);
    const resizeHandle = wrapper.querySelector<HTMLElement>('.mermaid-resize-handle');
    if (!diagramId || !resizeHandle) return;
    const key = markdownResizeMemoryKey(currentDocumentSource, diagramId);
    const entry = memory[key];
    if (!entry || restoredWrappers.get(wrapper) === key) return;
    restoredWrappers.set(wrapper, key);
    restoreNativeHeight(wrapper, resizeHandle, entry.height);
  });
}

function restoreNativeHeight(
  wrapper: HTMLElement,
  resizeHandle: HTMLElement,
  height: number,
): void {
  const bounds = wrapper.getBoundingClientRect();
  const startX = bounds.left + bounds.width / 2;
  const startY = bounds.bottom;
  const deltaY = height - bounds.height;
  suppressResizeMemoryEvents = true;
  try {
    resizeHandle.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      buttons: 1,
      cancelable: true,
      clientX: startX,
      clientY: startY,
    }));
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      buttons: 1,
      cancelable: true,
      clientX: startX,
      clientY: startY + deltaY,
    }));
    document.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      button: 0,
      buttons: 0,
      cancelable: true,
      clientX: startX,
      clientY: startY + deltaY,
    }));
  } finally {
    suppressResizeMemoryEvents = false;
  }
  requestAnimationFrame(() => fitNativeDiagram(wrapper));
}

function rememberWrapperHeight(
  wrapper: HTMLElement,
  documentSource: string,
): void {
  if (
    suppressResizeMemoryEvents ||
    !persistenceEnabled ||
    !wrapper.isConnected
  ) {
    return;
  }
  const diagramId = diagramIdForWrapper(wrapper);
  if (!diagramId) return;
  const height = wrapper.getBoundingClientRect().height;
  if (
    !Number.isFinite(height) ||
    height < MIN_REMEMBERED_HEIGHT ||
    height > MAX_REMEMBERED_HEIGHT
  ) {
    return;
  }
  const memory = readResizeMemory();
  memory[markdownResizeMemoryKey(documentSource, diagramId)] = {
    height,
    updatedAt: Date.now(),
  };
  writeResizeMemory(normalizeResizeMemory(memory));
}

function refreshPersistenceEnabled(): void {
  const enabled = readPersistenceEnabled();
  if (persistenceEnabled && !enabled) {
    activeResize = undefined;
    clearResizeMemory();
  }
  persistenceEnabled = enabled;
}

function readPersistenceEnabled(): boolean {
  const configuration = document.getElementById(
    MARKDOWN_PREVIEW_CONFIGURATION_ID,
  )?.dataset.configuration;
  if (!configuration) return true;
  try {
    const parsed: unknown = JSON.parse(configuration);
    return !isRecord(parsed) || parsed.rememberResizedHeight !== false;
  } catch {
    return true;
  }
}

function readInitialDocumentSource(): string {
  const settings = document.getElementById(
    'vscode-markdown-preview-data',
  )?.dataset.settings;
  if (!settings) return '';
  try {
    const parsed: unknown = JSON.parse(settings);
    return isRecord(parsed) && typeof parsed.source === 'string'
      ? parsed.source
      : '';
  } catch {
    return '';
  }
}

function readResizeMemory(): ResizeMemory {
  try {
    const stored = localStorage.getItem(RESIZE_MEMORY_STORAGE_KEY);
    if (stored) {
      volatileResizeMemory = normalizeResizeMemory(JSON.parse(stored) as unknown);
    }
  } catch {
    // The Markdown webview can disable persistent storage in restricted hosts.
  }
  return { ...volatileResizeMemory };
}

function writeResizeMemory(memory: ResizeMemory): void {
  volatileResizeMemory = memory;
  try {
    localStorage.setItem(RESIZE_MEMORY_STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Keep the same-preview in-memory fallback when persistent storage is unavailable.
  }
}

function clearResizeMemory(): void {
  volatileResizeMemory = {};
  try {
    localStorage.removeItem(RESIZE_MEMORY_STORAGE_KEY);
  } catch {
    // The in-memory copy has still been cleared.
  }
}

function resizeWrapperFromTarget(target: EventTarget | null): HTMLElement | undefined {
  if (!(target instanceof Element)) return undefined;
  return target.closest(RESIZE_HANDLE_SELECTOR)?.closest<HTMLElement>(
    '.mermaid-wrapper',
  ) ?? undefined;
}

function diagramIdForWrapper(wrapper: HTMLElement): string | undefined {
  const id = wrapper.querySelector<HTMLElement>('.mermaid[id]')?.id;
  return id || undefined;
}

function fitNativeDiagram(wrapper: HTMLElement): void {
  const content = wrapper.querySelector<HTMLElement>('.mermaid-content');
  const svg = content?.querySelector<SVGSVGElement>('svg');
  if (!content || !svg) return;

  const current = readDiagramTransform(content);
  const intrinsic = intrinsicSvgSize(content, svg);
  const fit = calculateDiagramFit(
    wrapper.clientWidth,
    wrapper.clientHeight,
    intrinsic.width,
    intrinsic.height,
  );
  const ratio = fit.scale / current.scale;
  if (Math.abs(ratio - 1) > 0.0001) {
    const zoomPointX = (fit.translateX - current.translateX * ratio) / (1 - ratio);
    const zoomPointY = (fit.translateY - current.translateY * ratio) / (1 - ratio);
    const bounds = wrapper.getBoundingClientRect();
    wrapper.dispatchEvent(new WheelEvent('wheel', {
      altKey: true,
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + zoomPointX,
      clientY: bounds.top + zoomPointY,
      deltaY: nativeWheelDelta(current.scale, fit.scale),
    }));
  }

  const applied = readDiagramTransform(content);
  panNativeDiagram(
    wrapper,
    fit.translateX - applied.translateX,
    fit.translateY - applied.translateY,
  );
}

function intrinsicSvgSize(
  content: HTMLElement,
  svg: SVGSVGElement,
): { height: number; width: number } {
  const transform = content.style.transform;
  content.style.transform = 'none';
  const bounds = svg.getBoundingClientRect();
  content.style.transform = transform;
  const viewBox = svg.viewBox.baseVal;
  return {
    height: bounds.height > 0 ? bounds.height : Math.max(viewBox.height, 1),
    width: bounds.width > 0 ? bounds.width : Math.max(viewBox.width, 1),
  };
}

function readDiagramTransform(content: HTMLElement): DiagramTransform {
  const inline = parseDiagramTransform(content.style.transform);
  if (inline) return inline;
  const matrix = new DOMMatrixReadOnly(getComputedStyle(content).transform);
  const scale = Math.hypot(matrix.a, matrix.b);
  return {
    scale: scale > 0 ? scale : 1,
    translateX: matrix.e,
    translateY: matrix.f,
  };
}

function panNativeDiagram(wrapper: HTMLElement, deltaX: number, deltaY: number): void {
  if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;
  const bounds = wrapper.getBoundingClientRect();
  const startX = bounds.left + bounds.width / 2;
  const startY = bounds.top + bounds.height / 2;
  wrapper.dispatchEvent(new MouseEvent('mousedown', {
    altKey: true,
    bubbles: true,
    button: 0,
    buttons: 1,
    cancelable: true,
    clientX: startX,
    clientY: startY,
  }));
  document.dispatchEvent(new MouseEvent('mousemove', {
    altKey: true,
    bubbles: true,
    buttons: 1,
    cancelable: true,
    clientX: startX + deltaX,
    clientY: startY + deltaY,
  }));
  document.dispatchEvent(new MouseEvent('mouseup', {
    altKey: true,
    bubbles: true,
    button: 0,
    buttons: 0,
    cancelable: true,
    clientX: startX + deltaX,
    clientY: startY + deltaY,
  }));
}

function decorateFitButtons(): void {
  document.querySelectorAll<HTMLButtonElement>(FIT_BUTTON_SELECTOR).forEach((button) => {
    button.title = 'Fit Diagram';
    button.setAttribute('aria-label', 'Fit Diagram');
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installMarkdownPreviewResizeFit, { once: true });
  } else {
    installMarkdownPreviewResizeFit();
  }
}
