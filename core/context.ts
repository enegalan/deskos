import type { ProgramContext, WindowAPI, SystemAPI, WindowCreateOptions, WindowState, ContextMenuAPI } from './types';
import { useKernel } from './kernel';
import { createSecureScopedStorage } from './storage';
import { createScopedEventBus } from './event-bus';
import { ContextMenuManager } from '../context-menu/ContextMenuManager';
import type { ContextMenuProvider, MenuItem } from '../context-menu/types';

const VERSION = '0.1.0';

/**
 * Launches a program or focuses an existing window if one already exists.
 * If the program allows multiple windows, it will always launch a new window.
 * Otherwise, it will focus the existing window if one exists.
 */
export async function launchOrFocusProgram(
  programId: string,
  forceNewWindow: boolean = false
): Promise<void> {
  const kernel = useKernel.getState();
  
  // Check if there's an existing window for this program
  const existingWindows = kernel.windows.filter((w) => w.programId === programId);
  
  // Get program metadata to check if it allows multiple windows
  const { programs } = await import('virtual:programs');
  const program = programs[programId];
  
  if (!program) {
    console.error(`[launchOrFocusProgram] Program not found: ${programId}`);
    return;
  }
  
  const module = await program.load();
  
  // If forcing new window (e.g., "New window" menu option), always launch
  if (forceNewWindow) {
    const programCtx = createProgramContext(programId, program.metadata.icon);
    module.default.launch(programCtx);
    return;
  }
  
  // If there's an existing window, focus it instead of creating a new one
  // (This applies regardless of allowMultiple - default behavior is to focus existing)
  if (existingWindows.length > 0) {
    const windowToFocus = existingWindows[0];
    
    // Restore if minimized
    if (windowToFocus.isMinimized) {
      kernel.restoreWindow(windowToFocus.id);
    } else {
      kernel.focusWindow(windowToFocus.id);
    }
    return;
  }
  
  // No existing window, launch normally
  const programCtx = createProgramContext(programId, program.metadata.icon);
  module.default.launch(programCtx);
}

/**
 * Creates a WindowAPI for a specific program.
 * All window operations are scoped to windows owned by this program.
 */
function createWindowAPI(programId: string, icon: string): WindowAPI {
  return {
    create(options: WindowCreateOptions): string {
      const state = useKernel.getState();
      return state.createWindow(programId, icon, options);
    },

    close(windowId: string): void {
      // Verify the window belongs to this program
      const state = useKernel.getState();
      const win = state.windows.find((w) => w.id === windowId);
      if (win && win.programId === programId) {
        state.closeWindow(windowId);
      }
    },

    focus(windowId: string): void {
      const state = useKernel.getState();
      const win = state.windows.find((w) => w.id === windowId);
      if (win && win.programId === programId) {
        state.focusWindow(windowId);
      }
    },

    minimize(windowId: string): void {
      const state = useKernel.getState();
      const win = state.windows.find((w) => w.id === windowId);
      if (win && win.programId === programId) {
        state.minimizeWindow(windowId);
      }
    },

    maximize(windowId: string): void {
      const state = useKernel.getState();
      const win = state.windows.find((w) => w.id === windowId);
      if (win && win.programId === programId) {
        state.maximizeWindow(windowId);
      }
    },

    restore(windowId: string): void {
      const state = useKernel.getState();
      const win = state.windows.find((w) => w.id === windowId);
      if (win && win.programId === programId) {
        state.restoreWindow(windowId);
      }
    },

    setTitle(windowId: string, title: string): void {
      const state = useKernel.getState();
      const win = state.windows.find((w) => w.id === windowId);
      if (win && win.programId === programId) {
        state.setWindowTitle(windowId, title);
      }
    },

    getWindows(): WindowState[] {
      const state = useKernel.getState();
      // Only return windows belonging to this program
      return state.windows.filter((w) => w.programId === programId);
    },
  };
}

/**
 * Creates a read-only SystemAPI for a program.
 */
function createSystemAPI(programId: string): SystemAPI {
  const state = useKernel.getState();

  // Use a Proxy to ensure read-only access to current state
  return new Proxy(
    {
      version: VERSION,
      theme: state.settings.theme,
      programId,
    },
    {
      get(target, prop: keyof SystemAPI) {
        if (prop === 'theme') {
          // Always return current theme
          return useKernel.getState().settings.theme;
        }
        return target[prop];
      },
      set() {
        // Prevent any modifications
        return false;
      },
    }
  );
}

/**
 * Creates a ContextMenuAPI for a specific program.
 */
function createContextMenuAPI(programId: string): ContextMenuAPI {
  const manager = ContextMenuManager.getInstance();

  return {
    register(target: string, provider: {
      id: string;
      items?: MenuItem[];
      generator?: (context: unknown) => MenuItem[] | Promise<MenuItem[]>;
      priority?: number;
    }): () => void {
      const fullProvider: ContextMenuProvider = {
        ...provider,
        target,
        programId,
      };
      return manager.registerProvider(fullProvider);
    },

    unregister(_target: string, _providerId: string): void {
      // Unregister is handled by the return function from register
      // This is kept for API completeness
      console.warn('[ContextMenuAPI] Use the return function from register() to unregister');
    },
  };
}

/**
 * Creates a complete ProgramContext for a specific program.
 * This is the only interface through which programs interact with the system.
 */
export function createProgramContext(programId: string, icon: string = '📦'): ProgramContext {
  const windowApi = createWindowAPI(programId, icon);
  const storageApi = createSecureScopedStorage(programId);
  const eventsApi = createScopedEventBus(programId);
  const systemApi = createSystemAPI(programId);
  const contextMenuApi = createContextMenuAPI(programId);

  // Wrap the entire context in a Proxy for additional security
  const context: ProgramContext = {
    window: windowApi,
    storage: storageApi,
    events: eventsApi,
    system: systemApi,
    contextMenu: contextMenuApi,
  };

  return new Proxy(context, {
    get(target, prop: keyof ProgramContext) {
      return target[prop];
    },
    set() {
      // Prevent modifications to the context object
      console.warn('[ProgramContext] Cannot modify context properties');
      return false;
    },
    deleteProperty() {
      // Prevent deletion of context properties
      console.warn('[ProgramContext] Cannot delete context properties');
      return false;
    },
  });
}
