import type { ProgramContext } from './context';
import type { IconName } from './icons';
import type { MenuContext, MenuItem } from '../context-menu/ContextMenuManager';
import { registerProgramIconResolver } from './program-icons';
import { registerDeleteItemsHandler, type DeleteLabelFn, type DeleteItemsHandler } from './delete-items';
import {
  registerProgramFlags,
  type ProgramDockConfig,
  type ProgramDesktopMenuItem,
  type ProgramShortcutConfig,
} from './program-registry';
import { registerProgramKeyboardShortcuts } from './program-shortcuts';

/** Re-export program manifest types for consumers. */
export type { ProgramDockConfig, ProgramDesktopMenuItem, ProgramShortcutConfig };

/** Full program manifest returned by {@link defineProgram}. */
export interface ProgramDefinition<T extends string = string> {
  id: T;
  name: string;
  icon: string | IconName;
  resolveIcon?: () => string;
  launch: (ctx: ProgramContext) => void;
  allowMultipleWindows?: boolean;
  iconContextMenu?: (context: MenuContext) => MenuItem[] | Promise<MenuItem[]>;
  protectedShortcut?: boolean;
  hideFromLauncher?: boolean;
  hideFromApplications?: boolean;
  dock?: ProgramDockConfig;
  shortcuts?: ProgramShortcutConfig[];
  desktopMenuItems?: () => ProgramDesktopMenuItem[] | Promise<ProgramDesktopMenuItem[]>;
  deleteItems?: DeleteItemsHandler;
  getDeleteLabel?: DeleteLabelFn;
  deletePriority?: number;
}

/**
 * Type-safe helper for defining programs and registering manifest side effects.
 *
 * @example
 * export default defineProgram({
 *   id: 'my-program',
 *   name: 'My Program',
 *   icon: 'package',
 *   launch: (ctx) => {
 *     ctx.window.create({ title: 'My Program', component: <App ctx={ctx} /> });
 *   },
 * });
 *
 * Persist per-window UI state with {@link useWindowSessionState} from `@core/window-session`
 * (drop-in replacement for useState inside program windows).
 */
export function defineProgram<T extends string>(config: {
  id: T;
  name: string;
  icon: string;
  resolveIcon?: () => string;
  launch: (ctx: ProgramContext) => void;
  allowMultipleWindows?: boolean;
  iconContextMenu?: (context: MenuContext) => MenuItem[] | Promise<MenuItem[]>;
  protectedShortcut?: boolean;
  hideFromLauncher?: boolean;
  hideFromApplications?: boolean;
  dock?: ProgramDockConfig;
  shortcuts?: ProgramShortcutConfig[];
  desktopMenuItems?: () => ProgramDesktopMenuItem[] | Promise<ProgramDesktopMenuItem[]>;
  deleteItems?: DeleteItemsHandler;
  getDeleteLabel?: DeleteLabelFn;
  deletePriority?: number;
}): ProgramDefinition<T> {
  if (config.resolveIcon) {
    registerProgramIconResolver(config.id, config.resolveIcon);
  }

  registerProgramFlags(config.id, {
    protectedShortcut: config.protectedShortcut,
    hideFromLauncher: config.hideFromLauncher,
    hideFromApplications: config.hideFromApplications,
    dock: config.dock,
    desktopMenuItems: config.desktopMenuItems,
  });

  if (config.shortcuts?.length) {
    registerProgramKeyboardShortcuts(config.id, config.shortcuts);
  }

  if (config.deleteItems) {
    registerDeleteItemsHandler(config.deleteItems, {
      getLabel: config.getDeleteLabel,
      priority: config.deletePriority,
    });
  }

  return config;
}
