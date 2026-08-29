/**
 * Global keyboard shortcuts system for DeskOS
 */

import { useKernel } from './kernel';
import { getAllSelectAllHandlers } from './selection';
import { dialog } from './dialog';

/** Key or key name accepted by the keyboard shortcuts manager. */
export type ShortcutKey =
  'Q' | 'W' | 'M' | 'H' | 'N' | 'T' | 'COMMA' | 'DELETE' | 'BACKSPACE' | string;

/** Registered global keyboard shortcut. */
export interface KeyboardShortcut {
  key: ShortcutKey;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  action: () => void | Promise<void>;
  description?: string;
  preventDefault?: boolean;
}

/** Run handlers in priority order until one succeeds (not skipped). */
async function runPriorityHandlers(
  getHandlers: () => Array<{ handler: () => void | Promise<void>; priority: number }>,
  label: string
): Promise<void> {
  const { HandlerSkippedError } = await import('@core/clipboard');
  const handlers = getHandlers();
  for (const { handler } of handlers) {
    try {
      await handler();
      return;
    } catch (error) {
      if (error instanceof HandlerSkippedError) {
        console.log(`[KeyboardShortcuts] ${label} handler skipped, trying next`);
        continue;
      }
      console.log(`[KeyboardShortcuts] ${label} handler error, trying next`, error);
    }
  }
  console.log(`[KeyboardShortcuts] No ${label} handler succeeded`);
}

/** Global keyboard shortcut registry and listener wiring. */
class KeyboardShortcutsManager {
  private shortcuts: Map<string, KeyboardShortcut> = new Map();

  constructor() {
    this.registerDefaultShortcuts();
    this.setupListeners();
  }

  private registerDefaultShortcuts(): void {
    // Cmd+Q or Ctrl+Q - Quit (reload page for now)
    this.register({
      key: 'Q',
      metaKey: true,
      action: async () => {
        if (await dialog.confirm('Are you sure you want to quit?', 'Quit', { danger: true })) {
          window.location.reload();
        }
      },
      description: 'Quit DeskOS',
      preventDefault: true,
    });

    // Cmd+W or Ctrl+W - Close active window
    this.register({
      key: 'W',
      metaKey: true,
      action: () => {
        const kernel = useKernel.getState();
        if (kernel.activeWindowId) {
          kernel.closeWindow(kernel.activeWindowId);
        }
      },
      description: 'Close window',
      preventDefault: true,
    });

    // Cmd+M or Ctrl+M - Minimize active window
    this.register({
      key: 'M',
      metaKey: true,
      action: () => {
        const kernel = useKernel.getState();
        if (kernel.activeWindowId) {
          kernel.minimizeWindow(kernel.activeWindowId);
        }
      },
      description: 'Minimize window',
      preventDefault: true,
    });

    // Cmd+H or Ctrl+H - Hide active window
    this.register({
      key: 'H',
      metaKey: true,
      action: () => {
        const kernel = useKernel.getState();
        if (kernel.activeWindowId) {
          kernel.minimizeWindow(kernel.activeWindowId);
        }
      },
      description: 'Hide window',
      preventDefault: true,
    });

    // Cmd+N / Cmd+T / Cmd+, — registered by programs via defineProgram({ shortcuts })

    // Cmd+A or Ctrl+A - Select All
    this.register({
      key: 'A',
      metaKey: true,
      action: async () => {
        await runPriorityHandlers(() => getAllSelectAllHandlers(), 'Select All');
      },
      description: 'Select All',
      preventDefault: true,
    });

    // Cmd+C or Ctrl+C - Copy
    this.register({
      key: 'C',
      metaKey: true,
      action: async () => {
        const { getAllCopyHandlers } = await import('@core/clipboard');
        await runPriorityHandlers(() => getAllCopyHandlers(), 'Copy');
      },
      description: 'Copy',
      preventDefault: true,
    });

    // Cmd+X or Ctrl+X - Cut
    this.register({
      key: 'X',
      metaKey: true,
      action: async () => {
        const { getAllCutHandlers } = await import('@core/clipboard');
        await runPriorityHandlers(() => getAllCutHandlers(), 'Cut');
      },
      description: 'Cut',
      preventDefault: true,
    });

    // Cmd+V or Ctrl+V - Paste
    this.register({
      key: 'V',
      metaKey: true,
      action: async () => {
        const { getAllPasteHandlers } = await import('@core/clipboard');
        await runPriorityHandlers(() => getAllPasteHandlers(), 'Paste');
      },
      description: 'Paste',
      preventDefault: true,
    });

    // Delete / Backspace - Delete selected items
    const deleteAction = async () => {
      const { getAllDeleteHandlers } = await import('@core/clipboard');
      await runPriorityHandlers(() => getAllDeleteHandlers(), 'Delete');
    };
    this.register({
      key: 'DELETE',
      action: deleteAction,
      description: 'Delete',
      preventDefault: true,
    });
    this.register({
      key: 'BACKSPACE',
      action: deleteAction,
      description: 'Delete',
      preventDefault: true,
    });
  }

  private setupListeners(): void {
    document.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });
    document.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('input, textarea, [contenteditable="true"]')
      ) {
        return;
      }
      this.clearBrowserTextSelection();
    });
  }

  private getShortcutKey(e: KeyboardEvent): string {
    const parts: string[] = [];

    // Accept Cmd (Mac) or Ctrl (Windows/Linux, and Ctrl on Mac) as the primary modifier
    if (e.metaKey || e.ctrlKey) {
      parts.push('meta');
    }
    if (e.shiftKey) {
      parts.push('shift');
    }
    if (e.altKey) {
      parts.push('alt');
    }

    const key = e.key.toUpperCase();
    const keyName =
      key === ',' ? 'COMMA' : key === 'BACKSPACE' ? 'BACKSPACE' : key === 'DELETE' ? 'DELETE' : key;
    parts.push(keyName);

    return parts.join('+');
  }

  private clearBrowserTextSelection(): void {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      selection.removeAllRanges();
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Never steal text editing shortcuts from inputs / contenteditable
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    const shortcutKey = this.getShortcutKey(e);
    const shortcut = this.shortcuts.get(shortcutKey);

    if (shortcut) {
      if (shortcut.preventDefault !== false) {
        e.preventDefault();
        e.stopPropagation();
      }
      this.clearBrowserTextSelection();
      shortcut.action();
    }
  }

  register(shortcut: KeyboardShortcut): () => void {
    const key = this.buildShortcutKey(shortcut);
    this.shortcuts.set(key, shortcut);

    return () => {
      this.shortcuts.delete(key);
    };
  }

  unregister(key: string): void {
    this.shortcuts.delete(key);
  }

  private buildShortcutKey(shortcut: KeyboardShortcut): string {
    const parts: string[] = [];

    if (shortcut.metaKey || shortcut.ctrlKey) {
      parts.push('meta');
    }
    if (shortcut.shiftKey) {
      parts.push('shift');
    }
    if (shortcut.altKey) {
      parts.push('alt');
    }

    parts.push(shortcut.key);

    return parts.join('+');
  }

  getAllShortcuts(): KeyboardShortcut[] {
    return Array.from(this.shortcuts.values());
  }
}

/** Singleton keyboard shortcuts manager instance. */
let managerInstance: KeyboardShortcutsManager | null = null;

/**
 * Singleton keyboard shortcuts manager (creates on first call).
 *
 * @returns Shared `KeyboardShortcutsManager` instance
 */
export function getKeyboardShortcutsManager(): KeyboardShortcutsManager {
  if (!managerInstance) {
    managerInstance = new KeyboardShortcutsManager();
  }
  return managerInstance;
}

// Initialize on import
if (typeof window !== 'undefined') {
  getKeyboardShortcutsManager();
}
