/**
 * Clipboard system for DeskOS
 * Manages copy, cut, paste, and delete operations for desktop items and folder items
 */

/** Kind of desktop item stored on the clipboard. */
export type ClipboardItemType = 'shortcut' | 'folder' | 'image' | 'video' | 'audio';

/** Single item reference in clipboard data. */
export interface ClipboardItem {
  id: string;
  type: ClipboardItemType;
}

/** Whether clipboard items were copied or cut. */
export type ClipboardOperation = 'copy' | 'cut';

/** Clipboard payload for desktop or folder item operations. */
export interface ClipboardData {
  type: 'desktop-items' | 'folder-items';
  items: ClipboardItem[];
  operation: ClipboardOperation;
  sourcePath?: string; // For folder items, the path where they came from
}

/** Current clipboard payload, or null when empty. */
let clipboardData: ClipboardData | null = null;

/** Registered copy handlers sorted by priority (folder windows override desktop). */
let copyHandlers: Array<{ handler: () => void; priority: number }> = [];
/** Registered cut handlers sorted by priority. */
let cutHandlers: Array<{ handler: () => void; priority: number }> = [];
/** Registered paste handlers sorted by priority. */
let pasteHandlers: Array<{ handler: () => void; priority: number }> = [];
/** Registered delete handlers sorted by priority. */
let deleteHandlers: Array<{ handler: () => void; priority: number }> = [];

/** Handler priority: desktop icon surface. */
const PRIORITY_DESKTOP = 0;
/** Handler priority: focused folder window. */
const PRIORITY_FOLDER_WINDOW = 1;

/** Dispatch event when clipboard contents change. */
function notifyClipboardUpdated(): void {
  window.dispatchEvent(new CustomEvent('deskos-clipboard-updated'));
}

/**
 * Register a handler for "Copy" keyboard shortcut
 */
export function registerCopyHandler(
  handler: () => void,
  priority: number = PRIORITY_DESKTOP
): () => void {
  copyHandlers.push({ handler, priority });
  // Sort by priority (higher priority first)
  copyHandlers.sort((a, b) => b.priority - a.priority);

  return () => {
    copyHandlers = copyHandlers.filter((h) => h.handler !== handler);
  };
}

/**
 * Register a handler for "Cut" keyboard shortcut
 */
export function registerCutHandler(
  handler: () => void,
  priority: number = PRIORITY_DESKTOP
): () => void {
  cutHandlers.push({ handler, priority });
  // Sort by priority (higher priority first)
  cutHandlers.sort((a, b) => b.priority - a.priority);

  return () => {
    cutHandlers = cutHandlers.filter((h) => h.handler !== handler);
  };
}

/**
 * Register a handler for "Paste" keyboard shortcut
 */
export function registerPasteHandler(
  handler: () => void,
  priority: number = PRIORITY_DESKTOP
): () => void {
  pasteHandlers.push({ handler, priority });
  // Sort by priority (higher priority first)
  pasteHandlers.sort((a, b) => b.priority - a.priority);

  return () => {
    pasteHandlers = pasteHandlers.filter((h) => h.handler !== handler);
  };
}

/**
 * Register a handler for Delete / Backspace
 */
export function registerDeleteHandler(
  handler: () => void,
  priority: number = PRIORITY_DESKTOP
): () => void {
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

/** Priority levels for clipboard keyboard handlers. */
export const CLIPBOARD_PRIORITY = {
  DESKTOP: PRIORITY_DESKTOP,
  FOLDER_WINDOW: PRIORITY_FOLDER_WINDOW,
};

/** Thrown by a handler to defer to the next handler in the priority chain. */
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
