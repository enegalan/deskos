import { ContextMenuManager } from './ContextMenuManager';
import type { ContextMenuHooks, MenuContext, MenuItem } from './types';

/**
 * Register lifecycle hooks with the context menu system
 */
export function registerContextMenuHooks(hooks: ContextMenuHooks): () => void {
  const manager = ContextMenuManager.getInstance();
  return manager.registerHooks(hooks);
}

/**
 * Create a hook that logs menu interactions (for debugging)
 */
export function createDebugHooks(): ContextMenuHooks {
  return {
    onBeforeOpen: (context: MenuContext, items: MenuItem[]) => {
      console.log('[ContextMenu] Opening menu', { context, itemCount: items.length });
    },
    onAfterOpen: (context: MenuContext) => {
      console.log('[ContextMenu] Menu opened', { context });
    },
    onMenuItemSelect: (item: MenuItem, context: MenuContext) => {
      console.log('[ContextMenu] Item selected', { item: item.id, context });
    },
    onBeforeClose: (context: MenuContext) => {
      console.log('[ContextMenu] Closing menu', { context });
    },
    onAfterClose: (context: MenuContext) => {
      console.log('[ContextMenu] Menu closed', { context });
    },
  };
}

/**
 * Create a hook that tracks menu usage analytics
 */
export function createAnalyticsHooks(
  track: (event: string, data: Record<string, unknown>) => void
): ContextMenuHooks {
  return {
    onAfterOpen: (context: MenuContext) => {
      track('context_menu_opened', {
        target: context.target.tagName,
        programId: context.programId,
      });
    },
    onMenuItemSelect: (item: MenuItem, context: MenuContext) => {
      track('context_menu_item_selected', {
        itemId: item.id,
        itemLabel: item.label,
        programId: context.programId,
      });
    },
  };
}
