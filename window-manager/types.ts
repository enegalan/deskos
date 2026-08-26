// Re-export window types from core
export type { WindowState, WindowCreateOptions } from '@core/types';

// Resize handle directions
export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

// Drag state for window movement
export interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
}

// Resize state for window resizing
export interface ResizeState {
  isResizing: boolean;
  direction: ResizeDirection | null;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  startPosX: number;
  startPosY: number;
}

// Z-index constants for window stacking
export const Z_INDEX = {
  DESKTOP: 0,
  WINDOW_BASE: 1000,
  WINDOW_ACTIVE: 4000,
  OVERLAY: 5000,
  TASKBAR: 6000,
} as const;

/**
 * Calculates z-index for a window based on its position in the stacking order.
 * Windows closer to the end of the array are on top.
 */
export function calculateZIndex(windowId: string, windowOrder: string[], isFocused: boolean): number {
  if (isFocused) {
    return Z_INDEX.WINDOW_ACTIVE;
  }

  const position = windowOrder.indexOf(windowId);
  if (position === -1) {
    return Z_INDEX.WINDOW_BASE;
  }

  // Each position adds 1 to the z-index
  return Z_INDEX.WINDOW_BASE + position;
}
