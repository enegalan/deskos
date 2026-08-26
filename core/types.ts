import type { ReactNode } from 'react';
import type { IconName } from './icons';

// Window state and management types
export interface WindowState {
  id: string;
  programId: string;
  title: string;
  icon: string | IconName; // Support both emoji strings and icon names
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
  // Store previous state for restore animation
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

// Storage API types
export interface StorageAPI {
  getItem<T = unknown>(key: string): T | null;
  setItem<T = unknown>(key: string, value: T): void;
  removeItem(key: string): void;
  clear(): void;
  keys(): string[];
}

// Event bus types
export type EventHandler<T = unknown> = (payload: T) => void;

export interface EventBusAPI {
  emit<T = unknown>(event: string, payload?: T): void;
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void;
  off<T = unknown>(event: string, handler: EventHandler<T>): void;
  once<T = unknown>(event: string, handler: EventHandler<T>): () => void;
}

// Window API for programs
export interface WindowAPI {
  create(options: WindowCreateOptions): string;
  close(windowId: string): void;
  focus(windowId: string): void;
  minimize(windowId: string): void;
  maximize(windowId: string): void;
  restore(windowId: string): void;
  setTitle(windowId: string, title: string): void;
  getWindows(): WindowState[];
}

// System API (read-only system information)
export interface SystemAPI {
  readonly version: string;
  readonly theme: 'light' | 'dark';
  readonly programId: string;
}

// Context Menu API for programs
import type { MenuItem } from '../context-menu/types';

export interface ContextMenuAPI {
  register(target: string, provider: {
    id: string;
    items?: MenuItem[];
    generator?: (context: unknown) => MenuItem[] | Promise<MenuItem[]>;
    priority?: number;
  }): () => void;
  unregister(target: string, providerId: string): void;
}

// The main context passed to programs
export interface ProgramContext {
  window: WindowAPI;
  storage: StorageAPI;
  events: EventBusAPI;
  system: SystemAPI;
  contextMenu: ContextMenuAPI;
}

// Program definition structure
export interface ProgramDefinition<T extends string = string> {
  id: T;
  name: string;
  icon: string | IconName; // Support both emoji strings and icon names
  launch: (ctx: ProgramContext) => void;
  allowMultipleWindows?: boolean;
}

// System settings
export interface SystemSettings {
  theme: 'light' | 'dark';
  wallpaper: string;
  accentColor: string;
  timeFormat: '12h' | '24h';
  timezone: string;
  showDate: boolean;
  iconSize: number;
  iconSpacing: number;
  gridSize: number;
  autoArrange: boolean;
  showIconLabels: boolean;
}

// Kernel state
export interface KernelState {
  windows: WindowState[];
  windowOrder: string[];
  activeWindowId: string | null;
  settings: SystemSettings;

  // Actions
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
