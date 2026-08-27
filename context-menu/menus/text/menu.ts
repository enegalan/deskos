import type { ContextMenuManager, MenuContext, MenuItem } from '../../ContextMenuManager';

/** Register the text selection / editable field context menu provider */
export function registerTextMenu(manager: ContextMenuManager): void {
  manager.registerProvider({
    id: 'system-text-menu',
    target: '*',
    programId: 'system',
    priority: 10,
    generator: async (context: MenuContext) => {
      const items: MenuItem[] = [];
      
      // Check if there's text selection
      const selection = context.selection as { type: string; text: string } | undefined;
      if (selection?.type === 'text' && selection.text && selection.text.trim()) {
        items.push({
          id: 'text-copy',
          label: 'Copy',
          icon: 'copy',
          action: async () => {
            try {
              await navigator.clipboard.writeText(selection.text);
            } catch (error) {
              console.error('[TextMenu] Error copying text:', error);
            }
          },
        });
        
        items.push({
          id: 'text-cut',
          label: 'Cut',
          icon: 'cut',
          action: async () => {
            try {
              await navigator.clipboard.writeText(selection.text);
              // TODO: Remove selected text from source
            } catch (error) {
              console.error('[TextMenu] Error cutting text:', error);
            }
          },
        });
        
        items.push({
          id: 'text-separator-1',
          type: 'separator',
          label: '',
        });
        
        items.push({
          id: 'text-search',
          label: 'Search',
          icon: 'search',
          action: async () => {
            // TODO: Open search with selected text
            console.log('[TextMenu] Search for:', selection.text);
          },
        });
      }
      
      return items;
    },
  });
}
