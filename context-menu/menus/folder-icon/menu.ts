import type { ContextMenuManager, MenuContext, MenuItem } from '../../ContextMenuManager';
import { dialog } from '@core/dialog';

/** Register the folder icon context menu provider */
export function registerFolderIconMenu(manager: ContextMenuManager): void {
  manager.registerProvider({
    id: 'system-folder-icon-menu',
    target: '.folder-icon',
    programId: 'system',
    priority: 0,
    generator: async (context: MenuContext) => {
      const items: MenuItem[] = [];

      // Check for multiple selection
      const selection = context.selection as
        { type: string; ids: string[]; count: number } | undefined;
      const isMultipleSelection = selection?.type === 'desktop-icons' && selection.count > 1;

      // Get selected items info
      let selectedShortcuts: string[] = [];
      let selectedFolders: string[] = [];

      if (isMultipleSelection && selection) {
        // Multiple selection - get all selected items
        const { getDesktopShortcuts, getDesktopFolders } = await import('@core/desktop-shortcuts');
        const shortcuts = getDesktopShortcuts();
        const folders = getDesktopFolders();

        selection.ids.forEach((id) => {
          if (shortcuts.some((s) => s.id === id)) {
            selectedShortcuts.push(id);
          } else if (folders.some((f) => f.id === id)) {
            selectedFolders.push(id);
          }
        });
      } else {
        // Single selection - check what was clicked
        const shortcutId = context.target.getAttribute('data-shortcut-id');
        const folderId = context.target.getAttribute('data-folder-id');
        if (shortcutId) {
          selectedShortcuts = [shortcutId];
        } else if (folderId) {
          selectedFolders = [folderId];
        }
      }

      // Open action - only show if single selection and it's a folder
      if (!isMultipleSelection && selectedFolders.length === 1) {
        items.push({
          id: 'folder-icon-open',
          label: 'Open',
          icon: 'open',
          action: async (context: MenuContext) => {
            const folderId = context.target.getAttribute('data-folder-id');
            if (folderId) {
              window.dispatchEvent(new CustomEvent('open-folder', { detail: { folderId } }));
            }
          },
        });
      }

      if (items.length > 0) {
        items.push({
          id: 'folder-icon-separator-1',
          type: 'separator',
          label: '',
        });
      }

      // Copy and Cut actions - show if there's a selection
      const totalSelectedForCopyCutFolder = selectedShortcuts.length + selectedFolders.length;
      if (totalSelectedForCopyCutFolder > 0) {
        items.push({
          id: 'folder-icon-copy',
          label: 'Copy',
          icon: 'copy',
          shortcut: 'Cmd+C',
          action: async () => {
            try {
              const { copy } = await import('@core/clipboard');
              const clipboardItems: Array<{ id: string; type: 'shortcut' | 'folder' }> = [];
              selectedShortcuts.forEach((id) => {
                clipboardItems.push({ id, type: 'shortcut' });
              });
              selectedFolders.forEach((id) => {
                clipboardItems.push({ id, type: 'folder' });
              });
              if (clipboardItems.length > 0) {
                copy({
                  type: 'desktop-items',
                  items: clipboardItems,
                  operation: 'copy',
                });
              }
            } catch (error) {
              console.error('[FolderIcon] Error copying items:', error);
            }
          },
        });

        items.push({
          id: 'folder-icon-cut',
          label: 'Cut',
          icon: 'cut',
          shortcut: 'Cmd+X',
          action: async () => {
            try {
              const { cut } = await import('@core/clipboard');
              const clipboardItems: Array<{ id: string; type: 'shortcut' | 'folder' }> = [];
              selectedShortcuts.forEach((id) => {
                clipboardItems.push({ id, type: 'shortcut' });
              });
              selectedFolders.forEach((id) => {
                clipboardItems.push({ id, type: 'folder' });
              });
              if (clipboardItems.length > 0) {
                cut({
                  type: 'desktop-items',
                  items: clipboardItems,
                  operation: 'cut',
                });
              }
            } catch (error) {
              console.error('[FolderIcon] Error cutting items:', error);
            }
          },
        });

        items.push({
          id: 'folder-icon-separator-copy-cut',
          type: 'separator',
          label: '',
        });
      }

      // Rename action - only show if single folder selection
      if (!isMultipleSelection && selectedFolders.length === 1) {
        items.push({
          id: 'folder-icon-rename',
          label: 'Rename',
          icon: 'rename',
          action: async (context: MenuContext) => {
            const folderId = context.target.getAttribute('data-folder-id');
            if (folderId) {
              const newName = await dialog.prompt('Enter new folder name:');
              if (newName && newName.trim()) {
                try {
                  const { renameDesktopFolder } = await import('@core/desktop-shortcuts');
                  renameDesktopFolder(folderId, newName.trim());
                } catch (error) {
                  console.error('[FolderIcon] Error renaming folder:', error);
                }
              }
            }
          },
        });

        items.push({
          id: 'folder-icon-separator-2',
          type: 'separator',
          label: '',
        });
      }

      const totalSelectedForDelete = selectedShortcuts.length + selectedFolders.length;
      const { getDeleteItemsLabel, deleteDesktopItems } = await import('@core/delete-items');
      const deleteLabel = getDeleteItemsLabel(totalSelectedForDelete);

      items.push({
        id: 'folder-icon-delete',
        label: deleteLabel,
        icon: 'delete',
        shortcut: 'Delete',
        action: async () => {
          try {
            await deleteDesktopItems([...selectedShortcuts, ...selectedFolders]);
          } catch (error) {
            console.error('[FolderIcon] Error deleting items:', error);
          }
        },
      });

      return items;
    },
  });
}
