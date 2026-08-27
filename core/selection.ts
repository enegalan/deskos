/**
 * Selection management system for DeskOS
 * Provides handler registration for keyboard shortcuts, marquee helpers,
 * and a pluggable selection-source registry for context menus / clipboard.
 */

import { DRAG_START_THRESHOLD } from './constants';

/** Registered Select All handlers (higher priority first after sort) */
let selectAllHandlers: Array<{ handler: () => void; priority: number }> = [];

/** Priority for desktop icon selection / Select All */
const PRIORITY_DESKTOP = 0;
/** Priority for folder-window selection / Select All */
const PRIORITY_FOLDER_WINDOW = 1;
/** Default priority for program-published selection sources */
const PRIORITY_PROGRAM = 10;

/**
 * Priority levels for Select All handlers and selection sources.
 * Higher values win when resolving the active selection.
 */
export const SELECTION_PRIORITY = {
  DESKTOP: PRIORITY_DESKTOP,
  FOLDER_WINDOW: PRIORITY_FOLDER_WINDOW,
  PROGRAM: PRIORITY_PROGRAM,
};

/** Stable ids for shell selection sources (cross-feature reads) */
export const SELECTION_SOURCE_IDS = {
  DESKTOP: 'system:desktop-icons',
  FOLDER_WINDOW: 'system:folder-window',
} as const;

/**
 * Pluggable selection publisher for context menus and clipboard coordination.
 */
export interface SelectionSource {
  /** Stable id (e.g. `system:desktop-icons` or `trash:default`) */
  id: string;
  /** Higher wins when resolving the active selection */
  priority?: number;
  /** Return null/undefined when nothing is selected */
  getSelection: () => unknown | null | undefined;
}

/** Registered selection sources keyed by id */
const selectionSources = new Map<string, SelectionSource>();

/**
 * True if the selection is meaningful (not null/undefined and has ids)
 * @param selection - The selection to check
 * @returns True if the selection is meaningful (not null/undefined and has ids)
 */
function isMeaningfulSelection(selection: unknown): boolean {
  if (selection == null) return false;
  if (typeof selection !== 'object') return true;
  if (!('ids' in selection)) return true;
  const ids = (selection as { ids: unknown }).ids;
  if (Array.isArray(ids)) return ids.length > 0;
  if (ids instanceof Set) return ids.size > 0;
  return true;
}

/**
 * Publish a selection source (desktop, folder window, or any program).
 *
 * @param source - Selection publisher to register
 * @returns Unregister function
 */
export function registerSelectionSource(source: SelectionSource): () => void {
  selectionSources.set(source.id, source);
  return () => {
    if (selectionSources.get(source.id) === source) {
      selectionSources.delete(source.id);
    }
  };
}

/**
 * Highest-priority non-empty selection, or undefined.
 */
export function getActiveSelection(): unknown | undefined {
  const sorted = [...selectionSources.values()].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
  );
  for (const source of sorted) {
    try {
      const selection = source.getSelection();
      if (isMeaningfulSelection(selection)) {
        return selection;
      }
    } catch (error) {
      console.error(`[selection] getSelection failed for ${source.id}:`, error);
    }
  }
  return undefined;
}

/**
 * Read a specific source by id (may be empty / null).
 *
 * @param id - Source id (e.g. {@link SELECTION_SOURCE_IDS.DESKTOP})
 */
export function getSelectionById(id: string): unknown | undefined {
  const source = selectionSources.get(id);
  if (!source) return undefined;
  try {
    return source.getSelection() ?? undefined;
  } catch (error) {
    console.error(`[selection] getSelection failed for ${id}:`, error);
    return undefined;
  }
}

/**
 * Register a handler for "Select All" keyboard shortcut
 * @param handler Function to call when Cmd+A/Ctrl+A is pressed
 * @param priority Higher wins (folder window over desktop)
 * @returns Unregister function
 */
export function registerSelectAllHandler(
  handler: () => void,
  priority: number = PRIORITY_DESKTOP
): () => void {
  selectAllHandlers.push({ handler, priority });
  selectAllHandlers.sort((a, b) => b.priority - a.priority);
  return () => {
    selectAllHandlers = selectAllHandlers.filter((h) => h.handler !== handler);
  };
}

/**
 * Get the current "Select All" handler (highest priority)
 * @internal Used by keyboard shortcuts manager
 */
export function getSelectAllHandler(): (() => void) | null {
  return selectAllHandlers.length > 0 ? selectAllHandlers[0].handler : null;
}

/**
 * All Select All handlers in priority order
 * @internal Used by keyboard shortcuts manager
 */
export function getAllSelectAllHandlers(): Array<{ handler: () => void; priority: number }> {
  return [...selectAllHandlers];
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
