/**
 * Runtime registry for program manifest flags set via defineProgram.
 */

import type { MenuItem } from '../context-menu/ContextMenuManager';

/** Dock pin settings declared in {@link defineProgram}. */
export interface ProgramDockConfig {
  pin?: boolean;
  order?: number;
  role?: 'launcher' | 'default';
}

/** Built-in keyboard shortcut action for program launchers. */
export type ProgramShortcutAction = 'launch' | 'launch-new';

/** Keyboard shortcut entry declared in {@link defineProgram}. */
export interface ProgramShortcutConfig {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  description?: string;
  action?: ProgramShortcutAction;
}

/** Item contributed to the desktop background context menu. */
export interface ProgramDesktopMenuItem {
  id: string;
  label: string;
  icon?: string;
  action: () => void | Promise<void>;
}

/** Internal manifest flags stored per program id. */
interface ProgramFlags {
  protectedShortcut?: boolean;
  hideFromLauncher?: boolean;
  hideFromApplications?: boolean;
  dock?: ProgramDockConfig;
}

/** @internal Registry of program flags set via defineProgram */
const programFlags = new Map<string, ProgramFlags>();

/** @internal Registry of desktop menu providers set via defineProgram */
const desktopMenuProviders: Array<
  () => ProgramDesktopMenuItem[] | Promise<ProgramDesktopMenuItem[]>
> = [];

/** @internal Called by defineProgram */
export function registerProgramFlags(
  programId: string,
  flags: Omit<ProgramFlags, never> & {
    desktopMenuItems?: () => ProgramDesktopMenuItem[] | Promise<ProgramDesktopMenuItem[]>;
  }
): void {
  const { desktopMenuItems, ...rest } = flags;
  programFlags.set(programId, rest);
  if (desktopMenuItems) {
    desktopMenuProviders.push(desktopMenuItems);
  }
}

/**
 * Check if a program is protected by a shortcut.
 * @param programId - The id of the program to check.
 * @returns True if the program is protected by a shortcut.
 */
export function isProtectedShortcutProgram(programId: string): boolean {
  return programFlags.get(programId)?.protectedShortcut === true;
}

/**
 * Check if a program is hidden from the launcher.
 * @param programId - The id of the program to check.
 * @returns True if the program is hidden from the launcher.
 */
export function isHiddenFromLauncher(programId: string): boolean {
  return programFlags.get(programId)?.hideFromLauncher === true;
}

/**
 * Check if a program is hidden from the applications menu.
 * @param programId - The id of the program to check.
 * @returns True if the program is hidden from the applications menu.
 */
export function isHiddenFromApplications(programId: string): boolean {
  return programFlags.get(programId)?.hideFromApplications === true;
}

/** Resolved dock pin with sort order and role. */
export interface DockPinEntry {
  programId: string;
  order: number;
  role: 'launcher' | 'default';
}

/** Pinned dock programs sorted by order (launcher role first among ties). */
export function getDockPins(): DockPinEntry[] {
  const pins: DockPinEntry[] = [];
  for (const [programId, flags] of programFlags.entries()) {
    if (!flags.dock?.pin) continue;
    pins.push({
      programId,
      order: flags.dock.order ?? 100,
      role: flags.dock.role ?? 'default',
    });
  }
  pins.sort((a, b) => {
    if (a.role === 'launcher' && b.role !== 'launcher') return -1;
    if (b.role === 'launcher' && a.role !== 'launcher') return 1;
    return a.order - b.order;
  });
  return pins;
}

/**
 * Get the role of a program in the dock.
 * @param programId - The id of the program to check.
 * @returns The role of the program in the dock.
 */
export function getDockRole(programId: string): 'launcher' | 'default' | undefined {
  const dock = programFlags.get(programId)?.dock;
  if (!dock?.pin) return undefined;
  return dock.role ?? 'default';
}

/**
 * Get the extension items for the desktop menu.
 * @returns The extension items for the desktop menu.
 */
export async function getDesktopMenuExtensionItems(): Promise<MenuItem[]> {
  const items: MenuItem[] = [];
  for (const provider of desktopMenuProviders) {
    try {
      const extensionItems = await provider();
      for (const item of extensionItems) {
        items.push({
          id: item.id,
          label: item.label,
          icon: item.icon,
          action: item.action,
        });
      }
    } catch (error) {
      console.error('[program-registry] desktopMenuItems provider failed:', error);
    }
  }
  return items;
}
