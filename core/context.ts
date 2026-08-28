import type { WindowCreateOptions, WindowState } from './kernel';
import { useKernel } from './kernel';
import { createSecureScopedStorage, type StorageAPI } from './storage';
import { createScopedEventBus, type EventBusAPI } from './event-bus';
import { ContextMenuManager, type ContextMenuProvider, type MenuContext, type MenuItem } from '../context-menu/ContextMenuManager';
import {
  registerSelectionSource,
  SELECTION_PRIORITY,
} from './selection';
import { registerProgramIconResolver } from './program-icons';
import packageJson from '../package.json';

/** Window lifecycle API exposed to programs via {@link ProgramContext}. */
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

/** Read-only system metadata for the running program. */
export interface SystemAPI {
  readonly version: string;
  readonly theme: 'light' | 'dark';
  readonly programId: string;
}

/**
 * Register context-menu providers for elements inside this program's windows.
 * CSS targets are scoped to `[data-program-id="…"]` so they never leak to other apps.
 *
 * @example
 * useEffect(() => {
 *   return ctx.contextMenu.register('img', {
 *     id: 'preview-image',
 *     generator: (context) => [{
 *       id: 'preview',
 *       label: 'Preview',
 *       icon: 'open',
 *       action: () => previewImage(context.target as HTMLImageElement),
 *     }],
 *   });
 * }, [ctx]);
 */
export interface ContextMenuAPI {
  register(target: string, provider: {
    id: string;
    items?: MenuItem[];
    generator?: (context: MenuContext) => MenuItem[] | Promise<MenuItem[]>;
    priority?: number;
  }): () => void;
}

/**
 * Publish program selection for context menus and other system features.
 * Return null/undefined from the getter when nothing is selected.
 *
 * @example
 * useEffect(() => {
 *   return ctx.selection.register(() => {
 *     const ids = Array.from(selectedIdsRef.current);
 *     return ids.length ? { type: 'my-items', ids } : null;
 *   });
 * }, [ctx]);
 */
export interface SelectionAPI {
  /**
   * Register a selection getter for this program.
   *
   * @param getSelection - Return null/undefined when nothing is selected
   * @param options.id - Source id suffix (`{programId}:{id}`, default `default`)
   * @param options.priority - Override {@link SELECTION_PRIORITY.PROGRAM}
   * @param options.isActive - Return true if the selection is active
   * @returns Unregister function
   */
  register(
    getSelection: () => unknown | null | undefined,
    options?: { id?: string; priority?: number; isActive?: () => boolean }
  ): () => void;
}

/**
 * Register a dynamic icon resolver for this program (overrides {@link defineProgram.resolveIcon}).
 *
 * @example
 * useEffect(() => {
 *   return ctx.icon.register(() => (hasUnread ? 'mail-unread' : 'mail'));
 * }, [ctx, hasUnread]);
 */
export interface IconAPI {
  register(resolver: () => string): () => void;
}

/** Semantic context-menu targets that are not scoped to a program window. */
const SEMANTIC_MENU_TARGETS = new Set(['desktop', 'window', 'file', 'folder-window']);

/** Scope a CSS selector to this program's windows; leave semantic targets unchanged. */
function scopeContextMenuTarget(target: string, programId: string): string {
  if (SEMANTIC_MENU_TARGETS.has(target) || target === '*') {
    return target;
  }
  const scope = `[data-program-id="${programId}"]`;
  if (target.includes(scope)) {
    return target;
  }
  return `${scope} ${target}`;
}

/** Full program-facing API surface (window, storage, events, menus, selection). */
export interface ProgramContext {
  window: WindowAPI;
  storage: StorageAPI;
  events: EventBusAPI;
  system: SystemAPI;
  contextMenu: ContextMenuAPI;
  selection: SelectionAPI;
  icon: IconAPI;
}

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
    module.default.launch(createProgramContext(programId, program.metadata.icon));
    return;
  }
  
  // If there's an existing window and the program is single-window, focus it
  const allowMultiple = module.default.allowMultipleWindows === true;
  if (existingWindows.length > 0 && !forceNewWindow && !allowMultiple) {
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
  module.default.launch(createProgramContext(programId, program.metadata.icon));
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
      version: packageJson.version,
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
      generator?: (context: MenuContext) => MenuItem[] | Promise<MenuItem[]>;
      priority?: number;
    }): () => void {
      const fullProvider: ContextMenuProvider = {
        ...provider,
        id: `${programId}:${provider.id}`,
        target: scopeContextMenuTarget(target, programId),
        programId,
      };
      return manager.registerProvider(fullProvider);
    },
  };
}

/**
 * Creates a SelectionAPI for a specific program.
 */
function createSelectionAPI(programId: string): SelectionAPI {
  return {
    register(
      getSelection: () => unknown | null | undefined,
      options?: { id?: string; priority?: number; isActive?: () => boolean }
    ): () => void {
      return registerSelectionSource({
        id: `${programId}:${options?.id ?? 'default'}`,
        priority: options?.priority ?? SELECTION_PRIORITY.PROGRAM,
        isActive: options?.isActive,
        getSelection,
      });
    },
  };
}

/**
 * Creates an IconAPI for a specific program.
 */
function createIconAPI(programId: string): IconAPI {
  return {
    register(resolver: () => string): () => void {
      return registerProgramIconResolver(programId, resolver);
    },
  };
}

/**
 * Creates a complete ProgramContext for a specific program.
 * This is the only interface through which programs interact with the system.
 */
function createProgramContext(programId: string, icon: string = 'package'): ProgramContext {
  // Wrap the entire context in a Proxy for additional security
  const context: ProgramContext = {
    window: createWindowAPI(programId, icon),
    storage: createSecureScopedStorage(programId),
    events: createScopedEventBus(programId),
    system: createSystemAPI(programId),
    contextMenu: createContextMenuAPI(programId),
    selection: createSelectionAPI(programId),
    icon: createIconAPI(programId),
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
