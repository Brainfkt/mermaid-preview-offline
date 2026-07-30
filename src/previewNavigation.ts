import type { PersistedPreviewState } from './protocol';

export const MIN_PREVIEW_ZOOM = 0.15;
export const MAX_PREVIEW_ZOOM = 4;
const MAX_FITTED_ZOOM = 1.5;

export interface PreviewDimensions {
  height: number;
  width: number;
}

export interface ZoomScrollDelta {
  left: number;
  top: number;
}

export class PreviewNavigationState {
  private autoFitValue: boolean;
  private naturalHeightValue = 600;
  private naturalWidthValue = 800;
  private savedScrollLeftValue: number;
  private savedScrollTopValue: number;
  private zoomValue: number;

  public constructor(state: PersistedPreviewState) {
    this.autoFitValue = state.autoFit;
    this.savedScrollLeftValue = state.scrollLeft;
    this.savedScrollTopValue = state.scrollTop;
    this.zoomValue = clampZoom(state.zoom);
  }

  public get autoFit(): boolean {
    return this.autoFitValue;
  }

  public get naturalHeight(): number {
    return this.naturalHeightValue;
  }

  public get naturalWidth(): number {
    return this.naturalWidthValue;
  }

  public get savedScrollLeft(): number {
    return this.savedScrollLeftValue;
  }

  public get savedScrollTop(): number {
    return this.savedScrollTopValue;
  }

  public get zoom(): number {
    return this.zoomValue;
  }

  public fit(viewportWidth: number, viewportHeight: number): number {
    this.zoomValue = calculateFittedZoom(
      viewportWidth,
      viewportHeight,
      this.naturalWidthValue,
      this.naturalHeightValue,
    );
    this.autoFitValue = true;
    this.resetScroll();
    return this.zoomValue;
  }

  public recordScroll(left: number, top: number): void {
    this.savedScrollLeftValue = Math.max(0, finiteOr(left, 0));
    this.savedScrollTopValue = Math.max(0, finiteOr(top, 0));
  }

  public resetScroll(): void {
    this.savedScrollLeftValue = 0;
    this.savedScrollTopValue = 0;
  }

  public restore(state: PersistedPreviewState): void {
    this.autoFitValue = state.autoFit;
    this.savedScrollLeftValue = state.scrollLeft;
    this.savedScrollTopValue = state.scrollTop;
    this.zoomValue = clampZoom(state.zoom);
  }

  public setNaturalSize(width: number, height: number): PreviewDimensions {
    this.naturalWidthValue = positiveDimension(width);
    this.naturalHeightValue = positiveDimension(height);
    return {
      height: this.naturalHeightValue,
      width: this.naturalWidthValue,
    };
  }

  public setZoom(value: number, autoFit = false): number {
    this.zoomValue = clampZoom(value);
    this.autoFitValue = autoFit;
    return this.zoomValue;
  }

  public snapshot(splitRatio: number): PersistedPreviewState {
    return {
      autoFit: this.autoFitValue,
      scrollLeft: this.savedScrollLeftValue,
      scrollTop: this.savedScrollTopValue,
      splitRatio,
      zoom: this.zoomValue,
    };
  }
}

export function calculateFittedZoom(
  viewportWidth: number,
  viewportHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): number {
  const horizontalRoom = Math.max(viewportWidth - 72, 120);
  const verticalRoom = Math.max(viewportHeight - 88, 120);
  return clampZoom(
    Math.min(
      horizontalRoom / positiveDimension(naturalWidth),
      verticalRoom / positiveDimension(naturalHeight),
      MAX_FITTED_ZOOM,
    ),
  );
}

export function calculateZoomScrollDelta(
  newZoom: number,
  diagramX: number,
  diagramY: number,
  newLeft: number,
  newTop: number,
  clientX: number,
  clientY: number,
): ZoomScrollDelta {
  return {
    left: newLeft + diagramX * clampZoom(newZoom) - clientX,
    top: newTop + diagramY * clampZoom(newZoom) - clientY,
  };
}

export function canPanWithPointer(
  mode: 'always' | 'alt' | 'never',
  altKey: boolean,
): boolean {
  return mode === 'always' || (mode === 'alt' && altKey);
}

function clampZoom(value: number): number {
  return Math.min(Math.max(finiteOr(value, 1), MIN_PREVIEW_ZOOM), MAX_PREVIEW_ZOOM);
}

function positiveDimension(value: number): number {
  return Math.max(finiteOr(value, 1), 1);
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
