/**
 * Desktop session snapshot — open windows, layout, focus, and per-window state.
 */

import { safeSync, handleError, StorageError } from './errors';
import { TASKBAR_HEIGHT } from './constants';

/** Local storage key for the desktop session. */
const SESSION_KEY = 'deskos:session';
/** Session version number. */
const SESSION_VERSION = 1;
/** Debounce time for session persistence. */
const PERSIST_DEBOUNCE_MS = 300;

/** Persisted per-window shell state and opaque program state. */
export interface SessionWindowEntry {
  id: string;
  programId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  isMinimized: boolean;
  isMaximized: boolean;
  previousState?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  state: Record<string, unknown>;
}

/** Full desktop session written to localStorage. */
export interface SessionSnapshot {
  version: typeof SESSION_VERSION;
  windows: SessionWindowEntry[];
  windowOrder: string[];
  activeWindowId: string | null;
}

/** In-memory per-window state blobs (keyed by session state key). */
const windowStateStore = new Map<string, Record<string, unknown>>();

/** Debounced persist timer handle. */
let persistTimer: ReturnType<typeof setTimeout> | null = null;
/** Kernel callback invoked to build and save session snapshots. */
let persistCallback: (() => void) | null = null;
/** True while session restore is in progress (suppresses writes). */
let sessionRestoreActive = false;

/** Register the kernel callback used to build and save snapshots. */
export function registerSessionPersistCallback(callback: () => void): void {
  persistCallback = callback;
}

/** True while the desktop session is being restored (suppresses writes). */
export function isSessionRestoreActive(): boolean {
  return sessionRestoreActive;
}

/** Suppress session persistence during bulk restore. */
export function beginSessionRestore(): void {
  sessionRestoreActive = true;
}

/** Re-enable session persistence after restore. */
export function endSessionRestore(): void {
  sessionRestoreActive = false;
}

/** Load a session snapshot from localStorage. */
export function loadSession(): SessionSnapshot | null {
  const [stored, error] = safeSync(() => localStorage.getItem(SESSION_KEY));
  if (error) {
    handleError(error, { operation: 'loadSession' });
    return null;
  }
  if (!stored) return null;

  const [parsed, parseError] = safeSync(() => JSON.parse(stored) as SessionSnapshot);
  if (parseError || !parsed || parsed.version !== SESSION_VERSION || !Array.isArray(parsed.windows)) {
    handleError(parseError ?? new StorageError('Failed to parse session'), { operation: 'parseSession' });
    return null;
  }

  return parsed;
}

/** Persist a session snapshot to localStorage. */
export function saveSession(snapshot: SessionSnapshot): void {
  if (sessionRestoreActive) return;

  const [, error] = safeSync(() => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
  });

  if (error) {
    handleError(new StorageError('Failed to save session'), { operation: 'saveSession' });
  }
}

/** Seed in-memory state for a restored window. */
export function initWindowSessionState(windowId: string, state: Record<string, unknown>): void {
  windowStateStore.set(windowId, { ...state });
}

/** Remove in-memory state when a window closes. */
export function clearWindowSessionState(windowId: string): void {
  windowStateStore.delete(windowId);
}

/** Read one persisted state key for a window. */
export function getWindowSessionState(windowId: string, key: string): unknown {
  return windowStateStore.get(windowId)?.[key];
}

/** Write one state key for a window and schedule a session save. */
export function setWindowSessionState(windowId: string, key: string, value: unknown): void {
  const current = windowStateStore.get(windowId) ?? {};
  windowStateStore.set(windowId, { ...current, [key]: value });
  scheduleSessionPersist();
}

/** Collect all in-memory state for a window. */
export function getAllWindowSessionState(windowId: string): Record<string, unknown> {
  return { ...(windowStateStore.get(windowId) ?? {}) };
}

/** Debounce session persistence. */
export function scheduleSessionPersist(): void {
  if (sessionRestoreActive || !persistCallback) return;

  if (persistTimer !== null) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistCallback?.();
  }, PERSIST_DEBOUNCE_MS);
}

/** Flush session immediately (e.g. beforeunload). */
export function flushSessionPersist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  persistCallback?.();
}

/** Clamp window bounds to the current viewport. */
export function clampSessionWindowBounds(entry: SessionWindowEntry): SessionWindowEntry {
  const maxW = window.innerWidth;
  const maxH = window.innerHeight - TASKBAR_HEIGHT;
  const width = Math.max(entry.minWidth, Math.min(entry.width, maxW));
  const height = Math.max(entry.minHeight, Math.min(entry.height, maxH));
  const x = Math.max(0, Math.min(entry.x, Math.max(0, maxW - width)));
  const y = Math.max(0, Math.min(entry.y, Math.max(0, maxH - height)));
  return { ...entry, x, y, width, height };
}

/** Build an empty session snapshot. */
export function createEmptySession(): SessionSnapshot {
  return {
    version: SESSION_VERSION,
    windows: [],
    windowOrder: [],
    activeWindowId: null,
  };
}
