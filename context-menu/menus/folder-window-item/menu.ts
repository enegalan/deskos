import type { ContextMenuManager, MenuContext, MenuItem } from '../../ContextMenuManager';

/** Register the folder window item context menu provider */
export function registerFolderWindowItemMenu(manager: ContextMenuManager): void {
  manager.registerProvider({
    id: 'system-folder-window-item-menu',
    target: '.folder-window-item',
    programId: 'system',
    priority: 0,
    generator: async (context: MenuContext) => {
      const items: MenuItem[] = [];
      const itemEl = context.target.closest('.folder-window-item') as HTMLElement | null;
      if (!itemEl) {
        return items;
      }

      const itemId = itemEl.dataset.itemId;
      const itemType = itemEl.dataset.itemType as 'folder' | 'shortcut' | undefined;
      if (!itemId || !itemType) {
        return items;
      }

      const selection = context.selection as { type: string; ids: string[]; path?: string } | undefined;
      const selectedIds =
        selection?.type === 'folder-items' && selection.ids.length > 0
          ? selection.ids
          : [itemId];
      const isMultiple = selectedIds.length > 1;

      if (!isMultiple) {
        items.push({
          id: 'folder-window-item-open',
          label: 'Open',
          icon: 'open',
          action: async () => {
            if (itemType === 'folder') {
              const parentPath =
                (itemEl.closest('[data-folder-path]') as HTMLElement | null)?.dataset.folderPath;
              const { getDesktopFolders } = await import('@core/desktop-shortcuts');
              const folder = getDesktopFolders().find((f) => f.id === itemId);
              if (parentPath && folder) {
                window.dispatchEvent(
                  new CustomEvent('folder-navigate', {
                    detail: {
                      windowId: context.windowId,
                      path: `${parentPath}/${folder.name}`,
                    },
                  })
                );
              } else {
                window.dispatchEvent(new CustomEvent('open-folder', { detail: { folderId: itemId } }));
              }
            } else {
              const programId = itemEl.dataset.programId;
              if (programId) {
                const { launchOrFocusProgram } = await import('@core/context');
                await launchOrFocusProgram(programId);
              }
            }
          },
        });

        items.push({
          id: 'folder-window-item-separator-1',
          type: 'separator',
          label: '',
        });
      }

      items.push({
        id: 'folder-window-item-copy',
        label: 'Copy',
        icon: 'copy',
        shortcut: 'Cmd+C',
        action: async () => {
          const { copy } = await import('@core/clipboard');
          const path =
            (itemEl.closest('[data-folder-path]') as HTMLElement | null)?.dataset.folderPath ||
            '/Desktop';
          copy({
            type: 'folder-items',
            items: selectedIds.map((id) => ({
              id,
              type: id === itemId ? itemType : ((document.querySelector(`[data-item-id="${id}"]`) as HTMLElement | null)?.dataset.itemType as 'folder' | 'shortcut') || 'shortcut',
            })),
            operation: 'copy',
            sourcePath: path,
          });
        },
      });

      items.push({
        id: 'folder-window-item-cut',
        label: 'Cut',
        icon: 'cut',
        shortcut: 'Cmd+X',
        action: async () => {
          const { cut } = await import('@core/clipboard');
          const path =
            (itemEl.closest('[data-folder-path]') as HTMLElement | null)?.dataset.folderPath ||
            '/Desktop';
          cut({
            type: 'folder-items',
            items: selectedIds.map((id) => ({
              id,
              type: id === itemId ? itemType : ((document.querySelector(`[data-item-id="${id}"]`) as HTMLElement | null)?.dataset.itemType as 'folder' | 'shortcut') || 'shortcut',
            })),
            operation: 'cut',
            sourcePath: path,
          });
        },
      });

      if (!isMultiple && itemType === 'folder') {
        items.push({
          id: 'folder-window-item-separator-rename',
          type: 'separator',
          label: '',
        });
        items.push({
          id: 'folder-window-item-rename',
          label: 'Rename',
          icon: 'rename',
          action: async () => {
            const newName = prompt('Enter new folder name:');
            if (newName && newName.trim()) {
              const { renameDesktopFolder } = await import('@core/desktop-shortcuts');
              renameDesktopFolder(itemId, newName.trim());
            }
          },
        });
      }

      items.push({
        id: 'folder-window-item-separator-delete',
        type: 'separator',
        label: '',
      });

      items.push({
        id: 'folder-window-item-delete',
        label: isMultiple ? `Delete (${selectedIds.length} items)` : 'Delete',
        icon: 'delete',
        shortcut: 'Delete',
        action: async () => {
          try {
            const { removeDesktopShortcut, deleteDesktopFolder, getDesktopFolders } = await import('@core/desktop-shortcuts');
            const folders = getDesktopFolders();
            const hasFolders = selectedIds.some((id) => folders.some((f) => f.id === id));
            if (hasFolders) {
              const ok = confirm(
                selectedIds.length === 1
                  ? 'Are you sure you want to delete this folder and all its contents?'
                  : `Are you sure you want to delete ${selectedIds.length} items?`
              );
              if (!ok) return;
            }

            for (const id of selectedIds) {
              if (folders.some((f) => f.id === id)) {
                deleteDesktopFolder(id);
              } else {
                removeDesktopShortcut(id);
              }
            }
            window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
          } catch (error) {
            console.error('[FolderWindowItem] Error deleting:', error);
          }
        },
      });

      return items;
    },
  });
}
