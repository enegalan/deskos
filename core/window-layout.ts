/**
 * Persisted window geometry per program (localStorage).
 */

import { safeSync, handleError, StorageError } from './errors';
import { TASKBAR_HEIGHT } from './constants';

/** Saved window bounds and maximize flag for a program. */
export interface SavedWindowLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized?: boolean;
}

/** localStorage key for persisted window layouts. */
const WINDOW_LAYOUTS_KEY = 'deskos:window-layouts';

/** Load all saved window layouts from localStorage. */
function loadLayouts(): Record<string, SavedWindowLayout> {
  const [stored, error] = safeSync(() => localStorage.getItem(WINDOW_LAYOUTS_KEY));
  if (error) {
    handleError(error, { operation: 'loadWindowLayouts' });
    return {};
  }
  if (!stored) return {};

  const [parsed, parseError] = safeSync(
    () => JSON.parse(stored) as Record<string, SavedWindowLayout>
  );
  if (parseError || !parsed || typeof parsed !== 'object') {
    handleError(parseError ?? new StorageError('Failed to parse window layouts'), {
      operation: 'parseWindowLayouts',
    });
    return {};
  }
  return parsed;
}

/** Persist all window layouts to localStorage. */
function saveLayouts(layouts: Record<string, SavedWindowLayout>): void {
  const [, error] = safeSync(() => {
    localStorage.setItem(WINDOW_LAYOUTS_KEY, JSON.stringify(layouts));
  });
  if (error) {
    handleError(new StorageError('Failed to save window layouts'), {
      operation: 'saveWindowLayouts',
    });
  }
}

/** Clamp saved layout to the current viewport. */
function clampLayout(layout: SavedWindowLayout): SavedWindowLayout {
  const maxW = window.innerWidth;
  const maxH = window.innerHeight - TASKBAR_HEIGHT;
  const width = Math.max(200, Math.min(layout.width, maxW));
  const height = Math.max(150, Math.min(layout.height, maxH));
  const x = Math.max(0, Math.min(layout.x, Math.max(0, maxW - width)));
  const y = Math.max(0, Math.min(layout.y, Math.max(0, maxH - height)));
  return { ...layout, x, y, width, height };
}

/**
 * Get saved window layout for a program.
 * @param programId - Program id
 */
export function getSavedWindowLayout(programId: string): SavedWindowLayout | undefined {
  const layout = loadLayouts()[programId];
  if (!layout) return undefined;
  if (
    typeof layout.x !== 'number' ||
    typeof layout.y !== 'number' ||
    typeof layout.width !== 'number' ||
    typeof layout.height !== 'number'
  ) {
    return undefined;
  }
  return clampLayout(layout);
}

/**
 * Save window layout for a program.
 * @param programId - Program id
 * @param layout - Bounds to persist
 */
export function saveWindowLayout(programId: string, layout: SavedWindowLayout): void {
  const layouts = loadLayouts();
  layouts[programId] = clampLayout(layout);
  saveLayouts(layouts);
}
