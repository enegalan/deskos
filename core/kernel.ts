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

export interface SystemSettings {
  theme: 'light' | 'dark';
  wallpaper: string;
  accentColor: string;
  timeFormat: '12h' | '24h';
  timezone: string;
  showDate: boolean;
  iconSize: number;
  gridSize: number;
  autoArrange: boolean;
  showIconLabels: boolean;
}

/** Max glyph size that still fits glyph + label in one grid cell */
export function getMaxIconSize(gridSize: number, showIconLabels: boolean): number {
  const reserved = ICON_CELL_PADDING + (showIconLabels ? ICON_LABEL_SPACE : 0);
  return Math.max(MIN_ICON_SIZE, gridSize - reserved);
}

export interface KernelState {
  windows: WindowState[];
  windowOrder: string[];
  activeWindowId: string | null;
  settings: SystemSettings;

  createWindow: (programId: string, icon: string, options: WindowCreateOptions) => string;
  closeWindow: (windowId: string) => void;
  focusWindow: (windowId: string) => void;
  minimizeWindow: (windowId: string) => void;
  maximizeWindow: (windowId: string) => void;
  restoreWindow: (windowId: string) => void;
  moveWindow: (windowId: string, x: number, y: number) => void;
  resizeWindow: (windowId: string, width: number, height: number) => void;
  setWindowTitle: (windowId: string, title: string) => void;
  updateSettings: (settings: Partial<SystemSettings>) => void;
}

let windowIdCounter = 0;

function generateWindowId(): string {
  return `window-${++windowIdCounter}-${Date.now()}`;
}

const SETTINGS_STORAGE_KEY = 'deskos:system:settings';

const defaultSettings: SystemSettings = {
  theme: 'dark',
  wallpaper: '',
  accentColor: '#5c9fff',
  timeFormat: '24h',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  showDate: false,
  iconSize: DEFAULT_ICON_SIZE,
  gridSize: DEFAULT_GRID_SIZE,
  autoArrange: false,
  showIconLabels: true,
};

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
  const maxIconSize = getMaxIconSize(settings.gridSize, settings.showIconLabels);
  if (settings.iconSize > maxIconSize) {
    settings.iconSize = maxIconSize;
  }
  return settings;
}

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

export const useKernel = create<KernelState>((set, get) => ({
  windows: [],
  windowOrder: [],
  activeWindowId: null,
  settings: loadSettings(),

  createWindow: (programId: string, icon: string, options: WindowCreateOptions): string => {
    const windowId = generateWindowId();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight - TASKBAR_HEIGHT;

    const width = options.width ?? 600;
    const height = options.height ?? 400;
    const x = options.x ?? Math.max(50, (viewportWidth - width) / 2 + Math.random() * 50);
    const y = options.y ?? Math.max(50, (viewportHeight - height) / 2 + Math.random() * 50);

    const newWindow: WindowState = {
      id: windowId,
      programId,
      title: options.title ?? 'Untitled',
      icon,
      x,
      y,
      width,
      height,
      minWidth: options.minWidth ?? 200,
      minHeight: options.minHeight ?? 150,
      isMinimized: false,
      isMaximized: false,
      isFocused: true,
      component: options.component,
    };

    set((state) => ({
      windows: state.windows.map((w) => ({ ...w, isFocused: false })).concat(newWindow),
      windowOrder: [...state.windowOrder, windowId],
      activeWindowId: windowId,
    }));

    return windowId;
  },

  closeWindow: (windowId: string): void => {
    set((state) => {
      const newWindows = state.windows.filter((w) => w.id !== windowId);
      const newOrder = state.windowOrder.filter((id) => id !== windowId);
      const newActiveId = newOrder.length > 0 ? newOrder[newOrder.length - 1] : null;

      return {
        windows: newWindows.map((w) => ({
          ...w,
          isFocused: w.id === newActiveId,
        })),
        windowOrder: newOrder,
        activeWindowId: newActiveId,
      };
    });
  },

  focusWindow: (windowId: string): void => {
    set((state) => {
      const windowExists = state.windows.some((w) => w.id === windowId);
      if (!windowExists) {
        handleError(new WindowNotFoundError(windowId), { operation: 'focusWindow' });
        return state;
      }

      const newOrder = state.windowOrder.filter((id) => id !== windowId).concat(windowId);

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
  },

  restoreWindow: (windowId: string): void => {
    set((state) => ({
      windows: state.windows.map((w) => {
        if (w.id === windowId) {
          // Restore from previous state if available
          const restoreState = w.previousState || {
            x: Math.max(50, (window.innerWidth - 600) / 2),
            y: Math.max(50, (window.innerHeight - 448) / 2),
            width: 600,
            height: 400,
          };
          return {
            ...w,
            isMinimized: false,
            isMaximized: false,
            x: restoreState.x,
            y: restoreState.y,
            width: restoreState.width,
            height: restoreState.height,
            previousState: undefined,
          };
        }
        return w;
      }),
    }));
    get().focusWindow(windowId);
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

  setWindowTitle: (windowId: string, title: string): void => {
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === windowId ? { ...w, title } : w
      ),
    }));
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
