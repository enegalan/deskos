/**
 * Clipboard system for DeskOS
 * Manages copy, cut, paste, and delete operations for desktop items and folder items
 */

export type ClipboardItemType = 'shortcut' | 'folder';

export interface ClipboardItem {
  id: string;
  type: ClipboardItemType;
}

export type ClipboardOperation = 'copy' | 'cut';

export interface ClipboardData {
  type: 'desktop-items' | 'folder-items';
  items: ClipboardItem[];
  operation: ClipboardOperation;
  sourcePath?: string; // For folder items, the path where they came from
}

// Global clipboard state
let clipboardData: ClipboardData | null = null;

// Global handler registration
// Support multiple handlers with priority (folder windows have higher priority)
let copyHandlers: Array<{ handler: () => void; priority: number }> = [];
let cutHandlers: Array<{ handler: () => void; priority: number }> = [];
let pasteHandlers: Array<{ handler: () => void; priority: number }> = [];
let deleteHandlers: Array<{ handler: () => void; priority: number }> = [];

// Priority constants
const PRIORITY_DESKTOP = 0;
const PRIORITY_FOLDER_WINDOW = 1;

function notifyClipboardUpdated(): void {
  window.dispatchEvent(new CustomEvent('deskos-clipboard-updated'));
}

/**
 * Register a handler for "Copy" keyboard shortcut
 */
export function registerCopyHandler(handler: () => void, priority: number = PRIORITY_DESKTOP): () => void {
  copyHandlers.push({ handler, priority });
  // Sort by priority (higher priority first)
  copyHandlers.sort((a, b) => b.priority - a.priority);
  
  return () => {
    copyHandlers = copyHandlers.filter(h => h.handler !== handler);
  };
}

/**
 * Register a handler for "Cut" keyboard shortcut
 */
export function registerCutHandler(handler: () => void, priority: number = PRIORITY_DESKTOP): () => void {
  cutHandlers.push({ handler, priority });
  // Sort by priority (higher priority first)
  cutHandlers.sort((a, b) => b.priority - a.priority);
  
  return () => {
    cutHandlers = cutHandlers.filter(h => h.handler !== handler);
  };
}

/**
 * Register a handler for "Paste" keyboard shortcut
 */
export function registerPasteHandler(handler: () => void, priority: number = PRIORITY_DESKTOP): () => void {
  pasteHandlers.push({ handler, priority });
  // Sort by priority (higher priority first)
  pasteHandlers.sort((a, b) => b.priority - a.priority);
  
  return () => {
    pasteHandlers = pasteHandlers.filter(h => h.handler !== handler);
  };
}

/**
 * Register a handler for Delete / Backspace
 */
export function registerDeleteHandler(handler: () => void, priority: number = PRIORITY_DESKTOP): () => void {
  deleteHandlers.push({ handler, priority });
  deleteHandlers.sort((a, b) => b.priority - a.priority);

  return () => {
    deleteHandlers = deleteHandlers.filter((h) => h.handler !== handler);
  };
}

/**
 * Get current copy handler (highest priority)
 * @internal Used by keyboard shortcuts manager
 */
export function getCopyHandler(): (() => void) | null {
  return copyHandlers.length > 0 ? copyHandlers[0].handler : null;
}

/**
 * Get current cut handler (highest priority)
 * @internal Used by keyboard shortcuts manager
 */
export function getCutHandler(): (() => void) | null {
  return cutHandlers.length > 0 ? cutHandlers[0].handler : null;
}

/**
 * Get all copy handlers in priority order
 * @internal Used by keyboard shortcuts manager
 */
export function getAllCopyHandlers(): Array<{ handler: () => void; priority: number }> {
  return [...copyHandlers];
}

/**
 * Get all cut handlers in priority order
 * @internal Used by keyboard shortcuts manager
 */
export function getAllCutHandlers(): Array<{ handler: () => void; priority: number }> {
  return [...cutHandlers];
}

/**
 * Get current paste handler (highest priority)
 * @internal Used by keyboard shortcuts manager
 */
export function getPasteHandler(): (() => void) | null {
  return pasteHandlers.length > 0 ? pasteHandlers[0].handler : null;
}

/**
 * Get all paste handlers in priority order
 * @internal Used by keyboard shortcuts manager
 */
export function getAllPasteHandlers(): Array<{ handler: () => void; priority: number }> {
  return [...pasteHandlers];
}

/**
 * Get all delete handlers in priority order
 * @internal Used by keyboard shortcuts manager
 */
export function getAllDeleteHandlers(): Array<{ handler: () => void; priority: number }> {
  return [...deleteHandlers];
}

/**
 * Copy items to clipboard
 */
export function copy(data: ClipboardData): void {
  console.log('[Clipboard] Copy: Saving to clipboard', data);
  clipboardData = {
    ...data,
    operation: 'copy',
  };
  notifyClipboardUpdated();
  console.log('[Clipboard] Copy: Clipboard saved', clipboardData);
}

/**
 * Cut items to clipboard
 */
export function cut(data: ClipboardData): void {
  clipboardData = {
    ...data,
    operation: 'cut',
  };
  notifyClipboardUpdated();
}

/**
 * Get current clipboard data
 */
export function getClipboard(): ClipboardData | null {
  console.log('[Clipboard] Get: Returning clipboard', clipboardData);
  return clipboardData;
}

// Export priority constants
export const CLIPBOARD_PRIORITY = {
  DESKTOP: PRIORITY_DESKTOP,
  FOLDER_WINDOW: PRIORITY_FOLDER_WINDOW,
};

// Special error to indicate handler should not process (try next handler)
export class HandlerSkippedError extends Error {
  constructor() {
    super('Handler skipped - try next handler');
    this.name = 'HandlerSkippedError';
  }
}

/**
 * Clear clipboard
 */
export function clearClipboard(): void {
  clipboardData = null;
  notifyClipboardUpdated();
}

/**
 * Check if clipboard has data
 */
export function hasClipboardData(): boolean {
  return clipboardData !== null && clipboardData.items.length > 0;
}

/** Ids currently marked as cut */
export function getCutItemIds(): Set<string> {
  if (!clipboardData || clipboardData.operation !== 'cut') {
    return new Set();
  }
  return new Set(clipboardData.items.map((item) => item.id));
}
