import type { IconName } from './icons';
import type { ProgramContext } from './context';
import type { MenuContext, MenuItem } from '../context-menu/ContextMenuManager';
import { registerProgramIconResolver } from './program-icons';

export interface ProgramDefinition<T extends string = string> {
  id: T;
  name: string;
  icon: string | IconName;
  /** Return the icon to show when it depends on runtime state (e.g. empty vs full). */
  resolveIcon?: () => string;
  launch: (ctx: ProgramContext) => void;
  allowMultipleWindows?: boolean;
  iconContextMenu?: (context: MenuContext) => MenuItem[] | Promise<MenuItem[]>;
}

/**
 * Type-safe helper function for defining programs.
 * This serves as both a type helper and a marker for build-time scanning.
 *
 * @example
 * export default defineProgram({
 *   id: 'my-program',
 *   name: 'My Program',
 *   icon: 'package',
 *   iconContextMenu: () => [{
 *     id: 'my-action',
 *     label: 'My Action',
 *     icon: 'package',
 *     action: () => myAction(),
 *   }],
 *   launch: (ctx) => {
 *     ctx.window.create({
 *       title: 'My Program',
 *       component: <MyProgramComponent ctx={ctx} />,
 *     });
 *   },
 * });
 */
export function defineProgram<T extends string>(config: {
  id: T;
  name: string;
  icon: string;
  resolveIcon?: () => string;
  launch: (ctx: ProgramContext) => void;
  allowMultipleWindows?: boolean;
  iconContextMenu?: (context: MenuContext) => MenuItem[] | Promise<MenuItem[]>;
}): ProgramDefinition<T> {
  if (config.resolveIcon) {
    registerProgramIconResolver(config.id, config.resolveIcon);
  }
  return config;
}
