import type { ContextMenuManager, MenuContext, MenuItem } from '../../ContextMenuManager';

/** Register the folder window item context menu provider */
export function registerFolderWindowItemMenu(manager: ContextMenuManager): void {
  manager.registerProvider({
    id: 'system-folder-window-item-menu',
    target: '[data-folder-path] .folder-window-item',
    programId: 'system',
    priority: 0,
    generator: async (context: MenuContext) => {
      const items: MenuItem[] = [];
      const itemEl = context.target.closest('.folder-window-item') as HTMLElement | null;
      if (!itemEl) {
        return items;
      }

      const itemId = itemEl.dataset.itemId;
      const itemType = itemEl.dataset.itemType as
        'folder' | 'shortcut' | 'image' | 'video' | undefined;
      if (!itemId || !itemType) {
        return items;
      }

      const containerPath = (itemEl.closest('[data-folder-path]') as HTMLElement | null)?.dataset
        .folderPath;
      const selection = context.selection as
        { type: string; ids: string[]; path?: string } | undefined;
      const selectedIds =
        selection?.type === 'folder-items' &&
        selection.ids.length > 0 &&
        selection.path === containerPath
          ? selection.ids
          : [itemId];
      const isMultiple = selectedIds.length > 1;

      // Image / video files: Preview or Play, then the same file ops as other items.
      if (itemType === 'image') {
        const picked = (isMultiple ? selectedIds : [itemId])
          .map((id) => document.querySelector(`[data-item-id="${id}"]`) as HTMLElement | null)
          .filter((el): el is HTMLElement => !!el && el.dataset.itemType === 'image')
          .map((el) => ({
            src: el.dataset.itemUrl as string,
            name: el.dataset.itemName as string,
          }));

        if (picked.length > 0) {
          const startIndex = Math.max(
            0,
            picked.findIndex(
              (img) => img.src === itemEl.dataset.itemUrl && img.name === itemEl.dataset.itemName
            )
          );
          items.push({
            id: 'folder-window-item-preview',
            label: picked.length > 1 ? `Preview ${picked.length} images` : 'Preview',
            icon: 'view',
            action: async () => {
              window.dispatchEvent(
                new CustomEvent('open-image', { detail: { images: picked, startIndex } })
              );
            },
          });
          items.push({
            id: 'folder-window-item-separator-media',
            type: 'separator',
            label: '',
          });
        }
      } else if (itemType === 'video') {
        const picked = (isMultiple ? selectedIds : [itemId])
          .map((id) => document.querySelector(`[data-item-id="${id}"]`) as HTMLElement | null)
          .filter((el): el is HTMLElement => !!el && el.dataset.itemType === 'video')
          .map((el) => ({
            src: el.dataset.itemUrl as string,
            name: el.dataset.itemName as string,
          }));

        if (picked.length > 0) {
          const startIndex = Math.max(
            0,
            picked.findIndex(
              (vid) => vid.src === itemEl.dataset.itemUrl && vid.name === itemEl.dataset.itemName
            )
          );
          items.push({
            id: 'folder-window-item-play',
            label: picked.length > 1 ? `Play ${picked.length} videos` : 'Play',
            icon: 'play',
            action: async () => {
              window.dispatchEvent(
                new CustomEvent('open-video', { detail: { videos: picked, startIndex } })
              );
            },
          });
          items.push({
            id: 'folder-window-item-separator-media',
            type: 'separator',
            label: '',
          });
        }
      }

      if (!isMultiple && itemType !== 'image' && itemType !== 'video') {
        items.push({
          id: 'folder-window-item-open',
          label: 'Open',
          icon: 'open',
          action: async () => {
            if (itemType === 'folder') {
              const parentPath = (itemEl.closest('[data-folder-path]') as HTMLElement | null)
                ?.dataset.folderPath;
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
                window.dispatchEvent(
                  new CustomEvent('open-folder', { detail: { folderId: itemId } })
                );
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
            items: selectedIds.map((id) => {
              const el = document.querySelector(`[data-item-id="${id}"]`) as HTMLElement | null;
              const type = (el?.dataset.itemType || (id === itemId ? itemType : 'shortcut')) as
                'folder' | 'shortcut' | 'image' | 'video';
              return { id, type };
            }),
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
            items: selectedIds.map((id) => {
              const el = document.querySelector(`[data-item-id="${id}"]`) as HTMLElement | null;
              const type = (el?.dataset.itemType || (id === itemId ? itemType : 'shortcut')) as
                'folder' | 'shortcut' | 'image' | 'video';
              return { id, type };
            }),
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

      const { getDeleteItemsLabel, deleteDesktopItems } = await import('@core/delete-items');

      items.push({
        id: 'folder-window-item-delete',
        label: getDeleteItemsLabel(selectedIds.length),
        icon: 'delete',
        shortcut: 'Delete',
        action: async () => {
          try {
            await deleteDesktopItems(selectedIds);
          } catch (error) {
            console.error('[FolderWindowItem] Error deleting:', error);
          }
        },
      });

      return items;
    },
  });
}
