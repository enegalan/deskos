/**
 * Global keyboard shortcuts system for DeskOS
 */

import { useKernel } from './kernel';
import { launchOrFocusProgram } from './context';
import { getSelectAllHandler } from './selection';
import { getCopyHandler, getCutHandler, getPasteHandler } from './clipboard';

export type ShortcutKey = 'Q' | 'W' | 'M' | 'H' | 'N' | 'T' | 'COMMA' | string;

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

class KeyboardShortcutsManager {
  private shortcuts: Map<string, KeyboardShortcut> = new Map();
  private isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  constructor() {
    this.registerDefaultShortcuts();
    this.setupListeners();
  }

  private registerDefaultShortcuts(): void {
    // Cmd+Q or Ctrl+Q - Quit (reload page for now)
    this.register({
      key: 'Q',
      metaKey: true,
      action: () => {
        if (confirm('Are you sure you want to quit?')) {
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

    // Cmd+N or Ctrl+N - New window (launcher)
    this.register({
      key: 'N',
      metaKey: true,
      action: async () => {
        await launchOrFocusProgram('launcher');
      },
      description: 'New window',
      preventDefault: true,
    });

    // Cmd+T or Ctrl+T - New tab (if applicable)
    this.register({
      key: 'T',
      metaKey: true,
      action: async () => {
        await launchOrFocusProgram('launcher');
      },
      description: 'New tab',
      preventDefault: true,
    });

    // Cmd+, or Ctrl+, - Settings
    this.register({
      key: 'COMMA',
      metaKey: true,
      action: async () => {
        await launchOrFocusProgram('settings');
      },
      description: 'Settings',
      preventDefault: true,
    });

    // Cmd+A or Ctrl+A - Select All
    this.register({
      key: 'A',
      metaKey: true,
      action: () => {
        const handler = getSelectAllHandler();
        if (handler) {
          handler();
        }
      },
      description: 'Select All',
      preventDefault: true,
    });

    // Cmd+C or Ctrl+C - Copy
    this.register({
      key: 'C',
      metaKey: true,
      action: async () => {
        // Try handlers in priority order
        const { getAllCopyHandlers, HandlerSkippedError } = await import('@core/clipboard');
        const handlers = getAllCopyHandlers();
        for (const { handler } of handlers) {
          try {
            handler();
            // If handler executed without throwing HandlerSkippedError, we're done
            return;
          } catch (error) {
            // If handler throws HandlerSkippedError, try next handler
            if (error instanceof HandlerSkippedError) {
              console.log('[KeyboardShortcuts] Copy handler skipped, trying next');
              continue;
            }
            // For other errors, log and try next
            console.log('[KeyboardShortcuts] Copy handler error, trying next', error);
          }
        }
        console.log('[KeyboardShortcuts] No copy handler succeeded');
      },
      description: 'Copy',
      preventDefault: true,
    });

    // Cmd+X or Ctrl+X - Cut
    this.register({
      key: 'X',
      metaKey: true,
      action: async () => {
        // Try handlers in priority order
        const { getAllCutHandlers, HandlerSkippedError } = await import('@core/clipboard');
        const handlers = getAllCutHandlers();
        for (const { handler } of handlers) {
          try {
            handler();
            // If handler executed without throwing HandlerSkippedError, we're done
            return;
          } catch (error) {
            // If handler throws HandlerSkippedError, try next handler
            if (error instanceof HandlerSkippedError) {
              console.log('[KeyboardShortcuts] Cut handler skipped, trying next');
              continue;
            }
            // For other errors, log and try next
            console.log('[KeyboardShortcuts] Cut handler error, trying next', error);
          }
        }
        console.log('[KeyboardShortcuts] No cut handler succeeded');
      },
      description: 'Cut',
      preventDefault: true,
    });

    // Cmd+V or Ctrl+V - Paste
    this.register({
      key: 'V',
      metaKey: true,
      action: async () => {
        // Try handlers in priority order
        const { getAllPasteHandlers, HandlerSkippedError } = await import('@core/clipboard');
        const handlers = getAllPasteHandlers();
        for (const { handler } of handlers) {
          try {
            handler();
            // If handler executed without throwing HandlerSkippedError, we're done
            return;
          } catch (error) {
            // If handler throws HandlerSkippedError, try next handler
            if (error instanceof HandlerSkippedError) {
              console.log('[KeyboardShortcuts] Paste handler skipped, trying next');
              continue;
            }
            // For other errors, log and try next
            console.log('[KeyboardShortcuts] Paste handler error, trying next', error);
          }
        }
        console.log('[KeyboardShortcuts] No paste handler succeeded');
      },
      description: 'Paste',
      preventDefault: true,
    });
  }

  private setupListeners(): void {
    document.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });
  }

  private getShortcutKey(e: KeyboardEvent): string {
    const parts: string[] = [];
    
    if (this.isMac ? e.metaKey : e.ctrlKey) {
      parts.push('meta');
    }
    if (e.shiftKey) {
      parts.push('shift');
    }
    if (e.altKey) {
      parts.push('alt');
    }
    
    const key = e.key.toUpperCase();
    const keyName = key === ',' ? 'COMMA' : key;
    parts.push(keyName);
    
    return parts.join('+');
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Don't handle shortcuts when typing in inputs
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      // Allow some shortcuts even in inputs (like Cmd+A, Cmd+C, Cmd+X, Cmd+V for text operations)
      const allowedKeys = ['a', 'A', 'c', 'C', 'x', 'X', 'v', 'V'];
      if (!allowedKeys.includes(e.key)) {
        return;
      }
      // For these keys, check if there's a registered handler for system operations
      // If no handler is registered, allow default browser behavior
      const keyUpper = e.key.toUpperCase();
      if (keyUpper === 'A') {
        const handler = getSelectAllHandler();
        if (!handler) return; // Allow default text selection
      } else if (keyUpper === 'C') {
        const handler = getCopyHandler();
        if (!handler) return; // Allow default text copy
      } else if (keyUpper === 'X') {
        const handler = getCutHandler();
        if (!handler) return; // Allow default text cut
      } else if (keyUpper === 'V') {
        const handler = getPasteHandler();
        if (!handler) return; // Allow default text paste
      }
    }

    const shortcutKey = this.getShortcutKey(e);
    const shortcut = this.shortcuts.get(shortcutKey);

    if (shortcut) {
      if (shortcut.preventDefault !== false) {
        e.preventDefault();
        e.stopPropagation();
      }
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
    
    if (shortcut.metaKey) {
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

// Singleton instance
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
