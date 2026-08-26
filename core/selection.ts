/**
 * Selection management system for DeskOS
 * Provides reusable selection logic and handler registration for keyboard shortcuts
 */

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
 * Unregister the current "Select All" handler
 */
export function unregisterSelectAllHandler(): void {
  selectAllHandler = null;
}

/**
 * Get the current "Select All" handler
 * @internal Used by keyboard shortcuts manager
 */
export function getSelectAllHandler(): (() => void) | null {
  return selectAllHandler;
}

/**
 * React hook for managing selection state
 */
export function useSelection(initialItems: string[] = []) {
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    new Set(initialItems)
  );

  const selectAll = React.useCallback((items: string[]) => {
    setSelectedIds(new Set(items));
  }, []);

  const selectNone = React.useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectItem = React.useCallback((id: string) => {
    setSelectedIds(new Set([id]));
  }, []);

  const toggleItem = React.useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectRange = React.useCallback((startId: string, endId: string, allItems: string[]) => {
    const startIndex = allItems.indexOf(startId);
    const endIndex = allItems.indexOf(endId);
    
    if (startIndex === -1 || endIndex === -1) return;
    
    const min = Math.min(startIndex, endIndex);
    const max = Math.max(startIndex, endIndex);
    const range = allItems.slice(min, max + 1);
    
    setSelectedIds((prev) => {
      const next = new Set(prev);
      range.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  return {
    selectedIds,
    selectAll,
    selectNone,
    selectItem,
    toggleItem,
    selectRange,
    setSelectedIds,
  };
}

// Import React for hooks
import React from 'react';
