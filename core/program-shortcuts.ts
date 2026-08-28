/**
 * Keyboard shortcuts declared by programs via defineProgram.
 */

import { launchOrFocusProgram } from './context';
import { getKeyboardShortcutsManager } from './keyboard-shortcuts';
import type { ProgramShortcutAction, ProgramShortcutConfig } from './program-registry';

/**
 * Wire program keyboard shortcuts into the global shortcuts manager.
 *
 * @param programId - Program to launch
 * @param shortcuts - Shortcut definitions from {@link defineProgram}
 */
export function registerProgramKeyboardShortcuts(
  programId: string,
  shortcuts: ProgramShortcutConfig[]
): void {
  const manager = getKeyboardShortcutsManager();
  for (const shortcut of shortcuts) {
    const action: ProgramShortcutAction = shortcut.action ?? 'launch';
    manager.register({
      key: shortcut.key,
      metaKey: shortcut.metaKey ?? true,
      ctrlKey: shortcut.ctrlKey,
      shiftKey: shortcut.shiftKey,
      altKey: shortcut.altKey,
      description: shortcut.description,
      preventDefault: true,
      action: () => launchOrFocusProgram(programId, action === 'launch-new'),
    });
  }
}
