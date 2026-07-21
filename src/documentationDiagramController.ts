import type { DiagramNavigationConfiguration } from './navigationSettings';

export interface DocumentationDiagramState {
  autoFit: boolean;
  customHeight?: number;
  panMode: boolean;
  scrollLeft: number;
  scrollTop: number;
  source: string;
  zoom: number;
}

export interface DocumentationDiagramControllerOptions {
  maxHeight: string;
  navigation: DiagramNavigationConfiguration;
  resizable: boolean;
  source: string;
}

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 4;
const MIN_HEIGHT = 160;

export class DocumentationDiagramController {
  private readonly abortController = new AbortController();
  private readonly controls: HTMLElement;
  private readonly panButton: HTMLButtonElement;
  private readonly resizeHandle?: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private autoFit = true;
  private customHeight: number | undefined;
  private naturalHeight = 1;
  private naturalWidth = 1;
  private panMode = false;
  private zoom = 1;

  public constructor(
    private readonly article: HTMLElement,
    private readonly canvas: HTMLElement,
    private readonly content: HTMLElement,
    private readonly options: DocumentationDiagramControllerOptions,
    state?: DocumentationDiagramState,
  ) {
    this.autoFit = state?.autoFit ?? true;
    this.customHeight = state?.source === options.source ? state.customHeight : undefined;
    this.panMode = state?.source === options.source ? state.panMode : false;
    this.zoom = state?.source === options.source ? clamp(state.zoom, MIN_ZOOM, MAX_ZOOM) : 1;
    this.controls = this.createControls();
    this.panButton = this.controls.querySelector<HTMLButtonElement>('[data-action="pan"]')!;
    this.article.append(this.controls);
    this.configureControlsVisibility();
    this.configureMaximumHeight();
    if (this.customHeight !== undefined) {
      this.canvas.style.height = `${this.customHeight}px`;
    }
    if (options.resizable) {
      this.resizeHandle = this.createResizeHandle();
      this.article.append(this.resizeHandle);
    }
    this.installNavigation();
    this.resizeObserver = new ResizeObserver(() => {
      if (this.autoFit) this.fit();
    });
    this.resizeObserver.observe(this.canvas);
    this.initialize(state?.source === options.source ? state : undefined);
  }

  public dispose(): DocumentationDiagramState {
    const state = this.snapshot();
    this.abortController.abort();
    this.resizeObserver.disconnect();
    this.controls.remove();
    this.resizeHandle?.remove();
    return state;
  }

  public snapshot(): DocumentationDiagramState {
    return {
      autoFit: this.autoFit,
      customHeight: this.customHeight,
      panMode: this.panMode,
      scrollLeft: this.canvas.scrollLeft,
      scrollTop: this.canvas.scrollTop,
      source: this.options.source,
      zoom: this.zoom,
    };
  }

  private initialize(state?: DocumentationDiagramState): void {
    const svg = this.content.querySelector<SVGSVGElement>('svg');
    if (!svg) return;
    const viewBox = svg.viewBox.baseVal;
    const bounds = svg.getBoundingClientRect();
    this.naturalWidth = viewBox.width > 0 ? viewBox.width : Math.max(bounds.width, 1);
    this.naturalHeight = viewBox.height > 0 ? viewBox.height : Math.max(bounds.height, 1);
    svg.style.maxWidth = 'none';
    window.requestAnimationFrame(() => {
      if (state && !state.autoFit) {
        this.applyZoom();
        window.requestAnimationFrame(() => {
          this.canvas.scrollTo({ left: state.scrollLeft, top: state.scrollTop });
        });
      } else {
        this.fit();
      }
      this.updatePanAffordance(false);
    });
  }

  private createControls(): HTMLElement {
    const controls = document.createElement('div');
    controls.className = 'documentation-navigation-controls';
    controls.setAttribute('aria-label', 'Diagram navigation controls');
    controls.innerHTML = [
      '<button type="button" data-action="pan" title="Toggle pan mode" aria-label="Toggle pan mode" aria-pressed="false">↔</button>',
      '<button type="button" data-action="zoom-out" title="Zoom out" aria-label="Zoom out">−</button>',
      '<button type="button" data-action="fit" title="Fit diagram">Fit</button>',
      '<button type="button" data-action="zoom-in" title="Zoom in" aria-label="Zoom in">+</button>',
    ].join('');
    const signal = this.abortController.signal;
    controls.querySelector('[data-action="pan"]')?.addEventListener(
      'click',
      () => this.togglePanMode(),
      { signal },
    );
    controls.querySelector('[data-action="zoom-out"]')?.addEventListener(
      'click',
      () => this.setZoom(this.zoom - 0.15),
      { signal },
    );
    controls.querySelector('[data-action="fit"]')?.addEventListener(
      'click',
      () => this.fit(),
      { signal },
    );
    controls.querySelector('[data-action="zoom-in"]')?.addEventListener(
      'click',
      () => this.setZoom(this.zoom + 0.15),
      { signal },
    );
    return controls;
  }

  private configureControlsVisibility(): void {
    const visibility = this.options.navigation.controlsVisibility;
    this.controls.hidden = visibility === 'never';
    this.controls.classList.toggle(
      'documentation-navigation-controls--conditional',
      visibility === 'onHoverOrFocus',
    );
  }

  private configureMaximumHeight(): void {
    if (this.options.maxHeight) this.canvas.style.maxHeight = this.options.maxHeight;
  }

  private installNavigation(): void {
    const signal = this.abortController.signal;
    let pointerId: number | undefined;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;
    let moved = false;
    let suppressNextClick = false;

    this.canvas.addEventListener('wheel', (event) => {
      if (!event.ctrlKey && !event.metaKey && !event.altKey) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.012 : 0.002));
      this.setZoomAtPoint(this.zoom * factor, event.clientX, event.clientY);
    }, { passive: false, signal });
    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !this.canPan(event.altKey)) return;
      event.preventDefault();
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startScrollLeft = this.canvas.scrollLeft;
      startScrollTop = this.canvas.scrollTop;
      moved = false;
      this.canvas.setPointerCapture(pointerId);
      this.canvas.classList.add('documentation-canvas--dragging');
    }, { signal });
    this.canvas.addEventListener('pointermove', (event) => {
      if (event.pointerId !== pointerId) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) moved = true;
      this.canvas.scrollLeft = startScrollLeft - deltaX;
      this.canvas.scrollTop = startScrollTop - deltaY;
    }, { signal });
    const stopPanning = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      pointerId = undefined;
      suppressNextClick = moved;
      this.canvas.classList.remove('documentation-canvas--dragging');
      this.updatePanAffordance(event.altKey);
    };
    this.canvas.addEventListener('pointerup', stopPanning, { signal });
    this.canvas.addEventListener('pointercancel', stopPanning, { signal });
    this.canvas.addEventListener('click', (event) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      this.setZoomAtPoint(
        this.zoom * (event.shiftKey ? 0.8 : 1.25),
        event.clientX,
        event.clientY,
      );
    }, { signal });
    this.canvas.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault();
        this.fit();
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        this.setZoom(this.zoom + 0.15);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        this.setZoom(this.zoom - 0.15);
      }
    }, { signal });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Alt') this.updatePanAffordance(true);
    }, { signal });
    window.addEventListener('keyup', (event) => {
      if (event.key === 'Alt') this.updatePanAffordance(false);
    }, { signal });
    window.addEventListener('blur', () => this.updatePanAffordance(false), { signal });
  }

  private createResizeHandle(): HTMLElement {
    const handle = document.createElement('div');
    handle.className = 'documentation-resize-handle';
    handle.setAttribute('role', 'separator');
    handle.tabIndex = 0;
    handle.setAttribute('aria-label', 'Resize diagram vertically');
    handle.setAttribute('aria-orientation', 'horizontal');
    const signal = this.abortController.signal;
    let pointerId: number | undefined;
    let startY = 0;
    let startHeight = 0;
    let centerX = 0;
    let centerY = 0;
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      pointerId = event.pointerId;
      startY = event.clientY;
      startHeight = this.canvas.getBoundingClientRect().height;
      centerX = (this.canvas.scrollLeft + this.canvas.clientWidth / 2) /
        Math.max(this.canvas.scrollWidth, 1);
      centerY = (this.canvas.scrollTop + this.canvas.clientHeight / 2) /
        Math.max(this.canvas.scrollHeight, 1);
      handle.setPointerCapture(pointerId);
      handle.classList.add('documentation-resize-handle--dragging');
    }, { signal });
    handle.addEventListener('pointermove', (event) => {
      if (event.pointerId !== pointerId) return;
      this.applyHeight(startHeight + event.clientY - startY, centerX, centerY);
    }, { signal });
    const stopResizing = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      pointerId = undefined;
      handle.classList.remove('documentation-resize-handle--dragging');
    };
    handle.addEventListener('pointerup', stopResizing, { signal });
    handle.addEventListener('pointercancel', stopResizing, { signal });
    handle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const amount = event.shiftKey ? 50 : 10;
      this.applyHeight(
        this.canvas.getBoundingClientRect().height + (event.key === 'ArrowDown' ? amount : -amount),
        (this.canvas.scrollLeft + this.canvas.clientWidth / 2) / Math.max(this.canvas.scrollWidth, 1),
        (this.canvas.scrollTop + this.canvas.clientHeight / 2) / Math.max(this.canvas.scrollHeight, 1),
      );
    }, { signal });
    return handle;
  }

  private applyHeight(value: number, centerX: number, centerY: number): void {
    const computedMaximum = Number.parseFloat(getComputedStyle(this.canvas).maxHeight);
    const maximum = Number.isFinite(computedMaximum) ? computedMaximum : Number.POSITIVE_INFINITY;
    this.customHeight = Math.min(Math.max(value, MIN_HEIGHT), maximum);
    this.autoFit = false;
    this.canvas.style.height = `${this.customHeight}px`;
    window.requestAnimationFrame(() => {
      this.canvas.scrollTo({
        left: centerX * this.canvas.scrollWidth - this.canvas.clientWidth / 2,
        top: centerY * this.canvas.scrollHeight - this.canvas.clientHeight / 2,
      });
    });
  }

  private fit(): void {
    const horizontalRoom = Math.max(this.canvas.clientWidth - 72, 120);
    const verticalRoom = Math.max(this.canvas.clientHeight - 72, 120);
    this.zoom = clamp(
      Math.min(horizontalRoom / this.naturalWidth, verticalRoom / this.naturalHeight, 1.5),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    this.autoFit = true;
    this.applyZoom();
    this.canvas.scrollTo({ left: 0, top: 0 });
  }

  private setZoom(value: number): void {
    this.zoom = clamp(value, MIN_ZOOM, MAX_ZOOM);
    this.autoFit = false;
    this.applyZoom();
  }

  private setZoomAtPoint(value: number, clientX: number, clientY: number): void {
    const svg = this.content.querySelector<SVGSVGElement>('svg');
    if (!svg) return;
    const oldBounds = svg.getBoundingClientRect();
    const diagramX = (clientX - oldBounds.left) / this.zoom;
    const diagramY = (clientY - oldBounds.top) / this.zoom;
    this.zoom = clamp(value, MIN_ZOOM, MAX_ZOOM);
    this.autoFit = false;
    this.applyZoom();
    const newBounds = svg.getBoundingClientRect();
    this.canvas.scrollBy({
      left: newBounds.left + diagramX * this.zoom - clientX,
      top: newBounds.top + diagramY * this.zoom - clientY,
    });
  }

  private applyZoom(): void {
    const svg = this.content.querySelector<SVGSVGElement>('svg');
    if (!svg) return;
    svg.style.width = `${Math.round(this.naturalWidth * this.zoom)}px`;
    svg.style.height = `${Math.round(this.naturalHeight * this.zoom)}px`;
  }

  private togglePanMode(): void {
    this.panMode = !this.panMode;
    this.panButton.setAttribute('aria-pressed', String(this.panMode));
    this.panButton.title = this.panMode ? 'Disable pan mode' : 'Enable pan mode';
    this.updatePanAffordance(false);
  }

  private canPan(altKey: boolean): boolean {
    return this.panMode ||
      this.options.navigation.mouseNavigation === 'always' ||
      (this.options.navigation.mouseNavigation === 'alt' && altKey);
  }

  private updatePanAffordance(altKey: boolean): void {
    this.panButton.setAttribute('aria-pressed', String(this.panMode));
    this.canvas.classList.toggle('documentation-canvas--pan-ready', this.canPan(altKey));
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
