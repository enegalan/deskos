import { create } from 'zustand';
import type { ReactNode } from 'react';
import type { IconName } from './icons';
import { WindowNotFoundError, StorageError, handleError, safeSync } from './errors';
import {
  DEFAULT_GRID_SIZE,
  DEFAULT_ICON_SIZE,
  ICON_CELL_PADDING,
  ICON_LABEL_SPACE,
  MIN_GRID_SIZE,
  MIN_ICON_SIZE,
  TASKBAR_HEIGHT,
} from './constants';
import { getSavedWindowLayout, saveWindowLayout } from './window-layout';
import {
  type SessionSnapshot,
  type SessionWindowEntry,
  clampSessionWindowBounds,
  getAllWindowSessionState,
  initWindowSessionState,
  registerSessionPersistCallback,
  saveSession,
  scheduleSessionPersist,
  clearWindowSessionState,
} from './session';

/** Runtime state of a single program window. */
export interface WindowState {
  id: string;
  programId: string;
  title: string;
  icon: string | IconName;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  isMinimized: boolean;
  isMaximized: boolean;
  isFocused: boolean;
  component: ReactNode;
  previousState?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/** Options passed to {@link WindowAPI.create}. */
export interface WindowCreateOptions {
  title?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  component: ReactNode;
}

/** Restore payload when reopening a window from a saved session. */
export type WindowRestoreOptions = SessionWindowEntry;

/** Dock date display presets */
export type DateFormat = 'medium' | 'long' | 'iso' | 'dmy' | 'mdy';

/** Supported dock date format ids. */
const DATE_FORMATS: DateFormat[] = ['medium', 'long', 'iso', 'dmy', 'mdy'];

/**
 * Whether a value is a known dock date format.
 *
 * @param value - Candidate format id
 */
export function isDateFormat(value: unknown): value is DateFormat {
  return typeof value === 'string' && DATE_FORMATS.includes(value as DateFormat);
}

/** Folder window item layout mode. */
export type FolderViewMode = 'grid' | 'list';

/** Persisted user-facing system preferences. */
export interface SystemSettings {
  theme: 'light' | 'dark';
  wallpaper: string;
  accentColor: string;
  timeFormat: '12h' | '24h';
  timezone: string;
  showDate: boolean;
  /** Dock date layout when Show Date is on */
  dateFormat: DateFormat;
  /** Include seconds in the dock clock */
  showSeconds: boolean;
  iconSize: number;
  gridSize: number;
  autoArrange: boolean;
  showIconLabels: boolean;
  /** Directory window layout: icon grid or details list */
  folderViewMode: FolderViewMode;
}

/** Max glyph size that still fits glyph + label in one grid cell */
export function getMaxIconSize(gridSize: number, showIconLabels: boolean): number {
  const reserved = ICON_CELL_PADDING + (showIconLabels ? ICON_LABEL_SPACE : 0);
  return Math.max(MIN_ICON_SIZE, gridSize - reserved);
}

/** Zustand store shape for the DeskOS window manager kernel. */
export interface KernelState {
  windows: WindowState[];
  windowOrder: string[];
  activeWindowId: string | null;
  settings: SystemSettings;

  createWindow: (
    programId: string,
    icon: string,
    options: WindowCreateOptions,
    restore?: WindowRestoreOptions
  ) => string;
  closeWindow: (windowId: string) => void;
  focusWindow: (windowId: string) => void;
  minimizeWindow: (windowId: string) => void;
  maximizeWindow: (windowId: string) => void;
  restoreWindow: (windowId: string) => void;
  moveWindow: (windowId: string, x: number, y: number) => void;
  resizeWindow: (windowId: string, width: number, height: number) => void;
  persistWindowLayout: (windowId: string) => void;
  persistAllWindowLayouts: () => void;
  persistSession: () => void;
  applySessionOrder: (windowOrder: string[], activeWindowId: string | null) => void;
  setWindowTitle: (windowId: string, title: string) => void;
  updateSettings: (settings: Partial<SystemSettings>) => void;
}

/** Monotonic counter for generated window ids (synced on session restore). */
let windowIdCounter = 0;

/**
 * Generate a unique window id.
 *
 * @returns New window id string
 */
function generateWindowId(): string {
  return `window-${++windowIdCounter}-${Date.now()}`;
}

/** Keep generated ids ahead of restored session window ids. */
function syncWindowIdCounter(windowIds: string[]): void {
  let maxCounter = 0;
  for (const id of windowIds) {
    const match = id.match(/^window-(\d+)-/);
    if (match) {
      maxCounter = Math.max(maxCounter, Number.parseInt(match[1], 10));
    }
  }
  windowIdCounter = Math.max(windowIdCounter, maxCounter);
}

/** Build a session snapshot from current kernel and window state. */
function buildSessionSnapshot(state: KernelState): SessionSnapshot {
  return {
    version: 1,
    windows: state.windows.map((win) =>
      clampSessionWindowBounds({
        id: win.id,
        programId: win.programId,
        title: win.title,
        x: win.x,
        y: win.y,
        width: win.width,
        height: win.height,
        minWidth: win.minWidth,
        minHeight: win.minHeight,
        isMinimized: win.isMinimized,
        isMaximized: win.isMaximized,
        previousState: win.previousState,
        state: getAllWindowSessionState(win.id),
      })
    ),
    windowOrder: [...state.windowOrder],
    activeWindowId: state.activeWindowId,
  };
}

/** localStorage key for persisted {@link SystemSettings}. */
const SETTINGS_STORAGE_KEY = 'deskos:system:settings';

/** Default {@link SystemSettings} when nothing is stored yet. */
const defaultSettings: SystemSettings = {
  theme: 'dark',
  wallpaper: '',
  accentColor: '#5c9fff',
  timeFormat: '24h',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  showDate: false,
  dateFormat: 'medium',
  showSeconds: false,
  iconSize: DEFAULT_ICON_SIZE,
  gridSize: DEFAULT_GRID_SIZE,
  autoArrange: false,
  showIconLabels: true,
  folderViewMode: 'grid',
};

/**
 * Load system settings from localStorage (falls back to defaults).
 *
 * @returns Merged system settings
 */
function loadSettings(): SystemSettings {
  const [stored, error] = safeSync(() => localStorage.getItem(SETTINGS_STORAGE_KEY));
  
  if (error) {
    handleError(error, { operation: 'loadSettings' });
    return defaultSettings;
  }

  if (!stored) {
    return defaultSettings;
  }

  const [parsed, parseError] = safeSync(() => JSON.parse(stored) as Partial<SystemSettings>);
  
  if (parseError || !parsed) {
    handleError(parseError ?? new StorageError('Failed to parse settings'), { operation: 'parseSettings' });
    return defaultSettings;
  }

  const settings = { ...defaultSettings };
  (Object.keys(defaultSettings) as Array<keyof SystemSettings>).forEach((key) => {
    const value = parsed[key];
    if (value !== undefined) {
      (settings[key] as SystemSettings[typeof key]) = value as SystemSettings[typeof key];
    }
  });
  if (settings.gridSize < MIN_GRID_SIZE) {
    settings.gridSize = MIN_GRID_SIZE;
  }
  if (!isDateFormat(settings.dateFormat)) {
    settings.dateFormat = defaultSettings.dateFormat;
  }
  if (typeof settings.showSeconds !== 'boolean') {
    settings.showSeconds = defaultSettings.showSeconds;
  }
  if (settings.folderViewMode !== 'grid' && settings.folderViewMode !== 'list') {
    settings.folderViewMode = defaultSettings.folderViewMode;
  }
  const maxIconSize = getMaxIconSize(settings.gridSize, settings.showIconLabels);
  if (settings.iconSize > maxIconSize) {
    settings.iconSize = maxIconSize;
  }
  return settings;
}

/**
 * Persist system settings to localStorage.
 *
 * @param settings - Full settings object to store
 */
function saveSettings(settings: SystemSettings): void {
  const [, error] = safeSync(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  });
  
  if (error) {
    handleError(new StorageError('Failed to save settings', { settings }), {
      operation: 'saveSettings',
    });
  }
}

/** Persist one window's geometry to localStorage. */
function persistWindowGeometry(win: WindowState): void {
  if (win.isMaximized && win.previousState) {
    saveWindowLayout(win.programId, {
      ...win.previousState,
      isMaximized: true,
    });
    return;
  }

  saveWindowLayout(win.programId, {
    x: win.x,
    y: win.y,
    width: win.width,
    height: win.height,
    isMaximized: false,
  });
}

/** Sync the window id counter with ids from a restored session. */
export function prepareWindowIdsForSession(windowIds: string[]): void {
  syncWindowIdCounter(windowIds);
}

registerSessionPersistCallback(() => {
  saveSession(buildSessionSnapshot(useKernel.getState()));
});

/**
 * Zustand hook for kernel state (windows, focus, settings).
 * Used by the shell and {@link createProgramContext}.
 */
export const useKernel = create<KernelState>((set, get) => ({
  windows: [],
  windowOrder: [],
  activeWindowId: null,
  settings: loadSettings(),

  createWindow: (
    programId: string,
    icon: string,
    options: WindowCreateOptions,
    restore?: WindowRestoreOptions
  ): string => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight - TASKBAR_HEIGHT;
    const saved = restore ? undefined : getSavedWindowLayout(programId);

    const width = restore?.width ?? saved?.width ?? options.width ?? 600;
    const height = restore?.height ?? saved?.height ?? options.height ?? 400;
    const x =
      restore?.x ??
      saved?.x ??
      options.x ??
      Math.max(50, (viewportWidth - width) / 2 + Math.random() * 50);
    const y =
      restore?.y ??
      saved?.y ??
      options.y ??
      Math.max(50, (viewportHeight - height) / 2 + Math.random() * 50);

    const windowId = restore?.id ?? generateWindowId();
    if (get().windows.some((w) => w.id === windowId)) {
      return windowId;
    }

    if (restore) {
      syncWindowIdCounter([restore.id]);
      initWindowSessionState(restore.id, restore.state);
    }

    const newWindow: WindowState = {
      id: windowId,
      programId,
      title: restore?.title ?? options.title ?? 'Untitled',
      icon,
      x,
      y,
      width,
      height,
      minWidth: restore?.minWidth ?? options.minWidth ?? 200,
      minHeight: restore?.minHeight ?? options.minHeight ?? 150,
      isMinimized: restore?.isMinimized ?? false,
      isMaximized: restore?.isMaximized ?? false,
      isFocused: !restore?.isMinimized,
      component: options.component,
      previousState: restore?.previousState,
    };

    if (!restore && saved?.isMaximized) {
      newWindow.previousState = { x, y, width, height };
      newWindow.isMaximized = true;
      newWindow.x = 0;
      newWindow.y = 0;
      newWindow.width = viewportWidth;
      newWindow.height = viewportHeight;
    }

    if (restore?.isMaximized) {
      newWindow.isMaximized = true;
      newWindow.x = 0;
      newWindow.y = 0;
      newWindow.width = viewportWidth;
      newWindow.height = viewportHeight;
    }

    set((state) => ({
      windows: state.windows.map((w) => ({ ...w, isFocused: false })).concat(newWindow),
      windowOrder: [...state.windowOrder, windowId],
      activeWindowId: restore?.isMinimized ? state.activeWindowId : windowId,
    }));

    scheduleSessionPersist();
    return windowId;
  },

  closeWindow: (windowId: string): void => {
    set((state) => {
      const closing = state.windows.find((w) => w.id === windowId);
      if (closing) {
        persistWindowGeometry(closing);
      }

      const newWindows = state.windows.filter((w) => w.id !== windowId);
      const newOrder = state.windowOrder.filter((id) => id !== windowId);
      const newActiveId = newOrder.length > 0 ? newOrder[newOrder.length - 1] : null;

      scheduleSessionPersist();
      return {
        windows: newWindows.map((w) => ({
          ...w,
          isFocused: w.id === newActiveId,
        })),
        windowOrder: newOrder,
        activeWindowId: newActiveId,
      };
    });
    clearWindowSessionState(windowId);
  },

  focusWindow: (windowId: string): void => {
    set((state) => {
      const windowExists = state.windows.some((w) => w.id === windowId);
      if (!windowExists) {
        handleError(new WindowNotFoundError(windowId), { operation: 'focusWindow' });
        return state;
      }

      const newOrder = state.windowOrder.filter((id) => id !== windowId).concat(windowId);

      scheduleSessionPersist();
      return {
        windows: state.windows.map((w) => ({
          ...w,
          isFocused: w.id === windowId,
        })),
        windowOrder: newOrder,
        activeWindowId: windowId,
      };
    });
  },

  minimizeWindow: (windowId: string): void => {
    set((state) => {
      const newWindows = state.windows.map((w) =>
        w.id === windowId ? { ...w, isMinimized: true, isFocused: false } : w
      );

      // Find next window to focus
      const visibleWindows = newWindows.filter((w) => !w.isMinimized);
      const newActiveId =
        visibleWindows.length > 0
          ? state.windowOrder.filter((id) => visibleWindows.some((w) => w.id === id)).pop() ?? null
          : null;

      scheduleSessionPersist();
      return {
        windows: newWindows.map((w) => ({
          ...w,
          isFocused: w.id === newActiveId,
        })),
        activeWindowId: newActiveId,
      };
    });
  },

  maximizeWindow: (windowId: string): void => {
    set((state) => ({
      windows: state.windows.map((w) => {
        if (w.id === windowId && !w.isMaximized) {
          // Save previous state before maximizing
          return {
            ...w,
            previousState: {
              x: w.x,
              y: w.y,
              width: w.width,
              height: w.height,
            },
            isMaximized: true,
            x: 0,
            y: 0,
            width: window.innerWidth,
            height: window.innerHeight - TASKBAR_HEIGHT,
          };
        }
        return w;
      }),
    }));
    const win = get().windows.find((w) => w.id === windowId);
    if (win) persistWindowGeometry(win);
    scheduleSessionPersist();
  },

  restoreWindow: (windowId: string): void => {
    set((state) => ({
      windows: state.windows.map((w) => {
        if (w.id === windowId) {
          const bounds =
            w.isMaximized && w.previousState
              ? w.previousState
              : { x: w.x, y: w.y, width: w.width, height: w.height };
          return {
            ...w,
            isMinimized: false,
            isMaximized: false,
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            previousState: undefined,
          };
        }
        return w;
      }),
    }));
    get().focusWindow(windowId);
    const win = get().windows.find((w) => w.id === windowId);
    if (win) persistWindowGeometry(win);
    scheduleSessionPersist();
  },

  moveWindow: (windowId: string, x: number, y: number): void => {
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === windowId ? { ...w, x, y } : w
      ),
    }));
  },

  resizeWindow: (windowId: string, width: number, height: number): void => {
    set((state) => {
      const win = state.windows.find((w) => w.id === windowId);
      if (!win) {
        handleError(new WindowNotFoundError(windowId), { operation: 'resizeWindow' });
        return state;
      }

      // Validate dimensions
      const validWidth = Math.max(win.minWidth, Math.min(width, window.innerWidth));
      const validHeight = Math.max(win.minHeight, Math.min(height, window.innerHeight - TASKBAR_HEIGHT));

      return {
        windows: state.windows.map((w) =>
          w.id === windowId
            ? {
                ...w,
                width: validWidth,
                height: validHeight,
              }
            : w
        ),
      };
    });
  },

  persistWindowLayout: (windowId: string): void => {
    const win = get().windows.find((w) => w.id === windowId);
    if (win) persistWindowGeometry(win);
    scheduleSessionPersist();
  },

  persistAllWindowLayouts: (): void => {
    get().windows.forEach(persistWindowGeometry);
  },

  persistSession: (): void => {
    saveSession(buildSessionSnapshot(get()));
  },

  applySessionOrder: (windowOrder: string[], activeWindowId: string | null): void => {
    set((state) => {
      const knownIds = new Set(state.windows.map((w) => w.id));
      const orderedIds = windowOrder.filter((id) => knownIds.has(id));
      const missingIds = state.windows
        .map((w) => w.id)
        .filter((id) => !orderedIds.includes(id));
      const nextOrder = [...orderedIds, ...missingIds];
      const resolvedActiveId =
        activeWindowId && knownIds.has(activeWindowId) ? activeWindowId : nextOrder.at(-1) ?? null;

      return {
        windowOrder: nextOrder,
        activeWindowId: resolvedActiveId,
        windows: state.windows.map((w) => ({
          ...w,
          isFocused: w.id === resolvedActiveId && !w.isMinimized,
        })),
      };
    });
    scheduleSessionPersist();
  },

  setWindowTitle: (windowId: string, title: string): void => {
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === windowId ? { ...w, title } : w
      ),
    }));
    scheduleSessionPersist();
  },

  updateSettings: (newSettings: Partial<SystemSettings>): void => {
    set((state) => {
      const updatedSettings = { ...state.settings, ...newSettings };
      if (updatedSettings.gridSize < MIN_GRID_SIZE) {
        updatedSettings.gridSize = MIN_GRID_SIZE;
      }
      const maxIconSize = getMaxIconSize(updatedSettings.gridSize, updatedSettings.showIconLabels);
      if (updatedSettings.iconSize > maxIconSize) {
        updatedSettings.iconSize = maxIconSize;
      }
      saveSettings(updatedSettings);
      return {
        settings: updatedSettings,
      };
    });
  },
}));
