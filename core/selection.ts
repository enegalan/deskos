/**
 * Selection management system for DeskOS
 * Provides handler registration for keyboard shortcuts and marquee helpers
 */

import { DRAG_START_THRESHOLD } from './constants';

// Global handler registration
let selectAllHandler: (() => void) | null = null;

/**
 * Register a handler for "Select All" keyboard shortcut
 * @param handler Function to call when Cmd+A/Ctrl+A is pressed
 * @returns Unregister function
 */
export function registerSelectAllHandler(handler: () => void): () => void {
  selectAllHandler = handler;
  return () => {
    if (selectAllHandler === handler) {
      selectAllHandler = null;
    }
  };
}

/**
 * Get the current "Select All" handler
 * @internal Used by keyboard shortcuts manager
 */
export function getSelectAllHandler(): (() => void) | null {
  return selectAllHandler;
}

/** Axis-aligned rectangle used for rubber-band selection */
export interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Normalize two points into a positive-size rectangle */
export function normalizeMarqueeRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number
): MarqueeRect {
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  return {
    left,
    top,
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

/** True when two rectangles overlap (inclusive edges) */
export function rectsIntersect(a: MarqueeRect, b: MarqueeRect): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

/**
 * Return ids of elements whose bounds intersect the marquee (client coordinates).
 */
export function collectIntersectingIds(
  elements: Iterable<Element>,
  marqueeClient: MarqueeRect,
  getId: (el: Element) => string | null
): string[] {
  const ids: string[] = [];
  for (const el of elements) {
    const id = getId(el);
    if (!id) continue;
    const r = el.getBoundingClientRect();
    if (
      rectsIntersect(marqueeClient, {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
      })
    ) {
      ids.push(id);
    }
  }
  return ids;
}

export interface MarqueeSessionOptions {
  /** Origin container for relative marquee coordinates */
  container: HTMLElement;
  /** Client X of mousedown */
  startClientX: number;
  /** Client Y of mousedown */
  startClientY: number;
  /** Keep previous selection and add hits (Ctrl/Cmd) */
  additive: boolean;
  /** Selection before marquee started */
  baseSelection: Set<string>;
  /** Query selectable elements inside the surface */
  getElements: () => Iterable<Element>;
  /** Resolve item id from an element */
  getId: (el: Element) => string | null;
  /** Called when the rubber-band rect updates (null when cleared) */
  onRect: (rect: MarqueeRect | null) => void;
  /** Called whenever the hit-tested selection changes */
  onSelection: (ids: Set<string>) => void;
  /** Called after a real drag (past threshold); use to suppress click-clear */
  onDragged?: () => void;
}

/**
 * Begin a drag-to-select session. Attaches document listeners until mouseup.
 */
export function startMarqueeSelection(options: MarqueeSessionOptions): void {
  const {
    container,
    startClientX,
    startClientY,
    additive,
    baseSelection,
    getElements,
    getId,
    onRect,
    onSelection,
    onDragged,
  } = options;

  const origin = container.getBoundingClientRect();
  const startLocalX = startClientX - origin.left + container.scrollLeft;
  const startLocalY = startClientY - origin.top + container.scrollTop;
  let dragged = false;
  const prevUserSelect = document.body.style.userSelect;
  document.body.style.userSelect = 'none';

  const applyHits = (clientRect: MarqueeRect) => {
    const hits = collectIntersectingIds(getElements(), clientRect, getId);
    if (additive) {
      const next = new Set(baseSelection);
      hits.forEach((id) => next.add(id));
      onSelection(next);
    } else {
      onSelection(new Set(hits));
    }
  };

  const onMove = (e: MouseEvent) => {
    const dx = Math.abs(e.clientX - startClientX);
    const dy = Math.abs(e.clientY - startClientY);
    if (!dragged && dx <= DRAG_START_THRESHOLD && dy <= DRAG_START_THRESHOLD) {
      return;
    }
    if (!dragged) {
      dragged = true;
      onDragged?.();
      if (!additive) {
        onSelection(new Set());
      }
    }

    const currentOrigin = container.getBoundingClientRect();
    const localX = e.clientX - currentOrigin.left + container.scrollLeft;
    const localY = e.clientY - currentOrigin.top + container.scrollTop;
    const localRect = normalizeMarqueeRect(startLocalX, startLocalY, localX, localY);
    onRect(localRect);

    const clientRect = normalizeMarqueeRect(
      startClientX,
      startClientY,
      e.clientX,
      e.clientY
    );
    applyHits(clientRect);
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.userSelect = prevUserSelect;
    onRect(null);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
