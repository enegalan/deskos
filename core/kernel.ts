import { create } from 'zustand';
import type { KernelState, WindowState, WindowCreateOptions, SystemSettings } from './types';
import { WindowNotFoundError, StorageError, handleError, safeSync } from './errors';

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
  iconSize: 64,
  iconSpacing: 80,
  gridSize: 100,
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
  
  if (parseError) {
    handleError(parseError, { operation: 'parseSettings' });
    return defaultSettings;
  }

  const settings = { ...defaultSettings, ...parsed };
  // Ensure gridSize is at least 100
  if (settings.gridSize < 100) {
    settings.gridSize = 100;
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
    const viewportHeight = window.innerHeight - 48; // Account for taskbar

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
            height: window.innerHeight - 48,
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
      const validHeight = Math.max(win.minHeight, Math.min(height, window.innerHeight - 48));

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
      saveSettings(updatedSettings);
      return {
        settings: updatedSettings,
      };
    });
  },
}));
