/**
 * Selection management system for DeskOS
 * Provides handler registration for keyboard shortcuts
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
 * Get the current "Select All" handler
 * @internal Used by keyboard shortcuts manager
 */
export function getSelectAllHandler(): (() => void) | null {
  return selectAllHandler;
}
