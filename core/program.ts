import type { IconName } from './icons';
import type { ProgramContext } from './context';

export interface ProgramDefinition<T extends string = string> {
  id: T;
  name: string;
  icon: string | IconName;
  launch: (ctx: ProgramContext) => void;
  allowMultipleWindows?: boolean;
}

/**
 * Type-safe helper function for defining programs.
 * This serves as both a type helper and a marker for build-time scanning.
 *
 * @example
 * export default defineProgram({
 *   id: 'my-program',
 *   name: 'My Program',
 *   icon: '🚀',
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
  launch: (ctx: ProgramContext) => void;
  allowMultipleWindows?: boolean;
}): ProgramDefinition<T> {
  return config;
}
