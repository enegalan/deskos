import type { ContextMenuManager, MenuContext, MenuItem } from '../../ContextMenuManager';
import { dialog } from '@core/dialog';

/** Register the desktop icon context menu provider */
export function registerDesktopIconMenu(manager: ContextMenuManager): void {
  manager.registerProvider({
    id: 'system-desktop-icon-menu',
    target: '.desktop-icon:not(.folder-icon)',
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
      let selectedFiles: string[] = [];
      let selectedMedia: string[] = [];

      if (isMultipleSelection && selection) {
        // Multiple selection - get all selected items
        const { getDesktopShortcuts, getDesktopFolders, getFileById, getMediaById } =
          await import('@core/desktop-shortcuts');
        const shortcuts = getDesktopShortcuts();
        const folders = getDesktopFolders();

        selection.ids.forEach((id) => {
          if (shortcuts.some((s) => s.id === id)) {
            selectedShortcuts.push(id);
          } else if (folders.some((f) => f.id === id)) {
            selectedFolders.push(id);
          } else if (getFileById(id)) {
            selectedFiles.push(id);
          } else if (getMediaById(id)) {
            selectedMedia.push(id);
          }
        });
      } else {
        // Single selection - check what was clicked
        const shortcutId = context.target.getAttribute('data-shortcut-id');
        const folderId = context.target.getAttribute('data-folder-id');
        const fileId = context.target.getAttribute('data-file-id');
        const mediaId = context.target.getAttribute('data-media-id');
        if (shortcutId) {
          selectedShortcuts = [shortcutId];
        } else if (folderId) {
          selectedFolders = [folderId];
        } else if (fileId) {
          selectedFiles = [fileId];
        } else if (mediaId) {
          selectedMedia = [mediaId];
        }
      }

      // Open action - only show if single selection and it's a shortcut
      if (!isMultipleSelection && selectedShortcuts.length === 1) {
        const programId = context.target.getAttribute('data-program-id');
        let programName = '';
        let allowMultiple = false;
        let iconContextMenuItems: MenuItem[] = [];

        if (programId) {
          try {
            const { programs } = await import('virtual:programs');
            const program = programs[programId];
            if (program) {
              const module = await program.load();
              programName = module.default.name;
              allowMultiple = module.default.allowMultipleWindows ?? false;
              if (module.default.iconContextMenu) {
                try {
                  const customPromise = Promise.resolve(module.default.iconContextMenu(context));
                  const timeoutPromise = new Promise<MenuItem[]>((resolve) => {
                    setTimeout(() => resolve([]), 200);
                  });
                  iconContextMenuItems = await Promise.race([customPromise, timeoutPromise]);
                } catch (error) {
                  console.error('[DesktopIcon] Error generating iconContextMenu:', error);
                }
              }
            }
          } catch (error) {
            console.error('[DesktopIcon] Error loading program metadata:', error);
          }
        }

        if (programId) {
          // Capture programId and programName in closure
          const capturedProgramId = programId;
          const capturedProgramName = programName;

          items.push({
            id: 'desktop-icon-open',
            label: 'Open',
            icon: 'open',
            action: async () => {
              try {
                const { launchOrFocusProgram } = await import('@core/context');
                await launchOrFocusProgram(capturedProgramId);
              } catch (error) {
                console.error('[DesktopIcon] Error launching program:', error);
              }
            },
          });

          // Add "New {appName} window" option if the app supports multiple windows
          if (allowMultiple && capturedProgramName) {
            items.push({
              id: 'desktop-icon-new-window',
              label: `New ${capturedProgramName} window`,
              icon: 'new-window',
              action: async () => {
                try {
                  const { launchOrFocusProgram } = await import('@core/context');
                  await launchOrFocusProgram(capturedProgramId, true);
                } catch (error) {
                  console.error('[DesktopIcon] Error launching new window:', error);
                }
              },
            });
          }

          if (iconContextMenuItems.length > 0) {
            items.push(...iconContextMenuItems);
          }
        }
      }

      // Open / Download for file or media icons on the desktop
      if (!isMultipleSelection && selectedFiles.length === 1) {
        const fileId = selectedFiles[0];
        items.push({
          id: 'desktop-icon-open-file',
          label: 'Open',
          icon: 'open',
          action: async () => {
            const { getFileById } = await import('@core/desktop-shortcuts');
            const { openDesktopItem } = await import('@core/open-file');
            const file = getFileById(fileId);
            if (file) await openDesktopItem(file);
          },
        });
        items.push({
          id: 'desktop-icon-download-file',
          label: 'Download',
          icon: 'download',
          action: async () => {
            const { downloadItemById } = await import('@core/file-transfer');
            await downloadItemById(fileId);
          },
        });
      }

      if (!isMultipleSelection && selectedMedia.length === 1) {
        const mediaId = selectedMedia[0];
        items.push({
          id: 'desktop-icon-open-media',
          label: 'Open',
          icon: 'open',
          action: async () => {
            const { getMediaById } = await import('@core/desktop-shortcuts');
            const { openDesktopItem } = await import('@core/open-file');
            const media = getMediaById(mediaId);
            if (media) await openDesktopItem(media);
          },
        });
        items.push({
          id: 'desktop-icon-download-media',
          label: 'Download',
          icon: 'download',
          action: async () => {
            const { downloadItemById } = await import('@core/file-transfer');
            await downloadItemById(mediaId);
          },
        });
      }

      if (items.length > 0) {
        items.push({
          id: 'desktop-icon-separator-1',
          type: 'separator',
          label: '',
        });
      }

      // Copy and Cut actions - show if there's a selection
      const totalSelectedForCopyCut =
        selectedShortcuts.length +
        selectedFolders.length +
        selectedFiles.length +
        selectedMedia.length;
      if (totalSelectedForCopyCut > 0) {
        const buildClipboardItems = async () => {
          const { getMediaById, isImageItem, isVideoItem, isAudioItem } =
            await import('@core/desktop-shortcuts');
          const clipboardItems: Array<{
            id: string;
            type: 'shortcut' | 'folder' | 'file' | 'image' | 'video' | 'audio';
          }> = [];
          selectedShortcuts.forEach((id) => {
            clipboardItems.push({ id, type: 'shortcut' });
          });
          selectedFolders.forEach((id) => {
            clipboardItems.push({ id, type: 'folder' });
          });
          selectedFiles.forEach((id) => {
            clipboardItems.push({ id, type: 'file' });
          });
          selectedMedia.forEach((id) => {
            const media = getMediaById(id);
            if (!media) return;
            if (isImageItem(media)) clipboardItems.push({ id, type: 'image' });
            else if (isVideoItem(media)) clipboardItems.push({ id, type: 'video' });
            else if (isAudioItem(media)) clipboardItems.push({ id, type: 'audio' });
          });
          return clipboardItems;
        };

        items.push({
          id: 'desktop-icon-copy',
          label: 'Copy',
          icon: 'copy',
          shortcut: 'Cmd+C',
          action: async () => {
            try {
              const { copy } = await import('@core/clipboard');
              const clipboardItems = await buildClipboardItems();
              if (clipboardItems.length > 0) {
                copy({
                  type: 'desktop-items',
                  items: clipboardItems,
                  operation: 'copy',
                });
              }
            } catch (error) {
              console.error('[DesktopIcon] Error copying items:', error);
            }
          },
        });

        items.push({
          id: 'desktop-icon-cut',
          label: 'Cut',
          icon: 'cut',
          shortcut: 'Cmd+X',
          action: async () => {
            try {
              const { cut } = await import('@core/clipboard');
              const clipboardItems = await buildClipboardItems();
              if (clipboardItems.length > 0) {
                cut({
                  type: 'desktop-items',
                  items: clipboardItems,
                  operation: 'cut',
                });
              }
            } catch (error) {
              console.error('[DesktopIcon] Error cutting items:', error);
            }
          },
        });

        items.push({
          id: 'desktop-icon-separator-copy-cut',
          type: 'separator',
          label: '',
        });
      }

      // Info action - only show if single selection
      if (
        !isMultipleSelection &&
        (selectedShortcuts.length === 1 || selectedFolders.length === 1)
      ) {
        items.push({
          id: 'desktop-icon-info',
          label: 'Get Info',
          icon: 'info',
          action: async (context: MenuContext) => {
            // TODO: Show info dialog/modal
            console.log('[DesktopIcon] Get Info', context);
          },
        });

        items.push({
          id: 'desktop-icon-separator-info',
          type: 'separator',
          label: '',
        });
      }

      // Duplicate action - only show if single selection
      if (!isMultipleSelection && selectedShortcuts.length === 1) {
        items.push({
          id: 'desktop-icon-duplicate',
          label: 'Duplicate',
          icon: 'duplicate',
          action: async (context: MenuContext) => {
            const shortcutId = context.target.getAttribute('data-shortcut-id');
            if (shortcutId) {
              try {
                const { getDesktopShortcuts, addDesktopShortcut, getGridMetrics } =
                  await import('@core/desktop-shortcuts');
                const shortcuts = getDesktopShortcuts();
                const shortcut = shortcuts.find((s) => s.id === shortcutId);
                if (shortcut) {
                  // Add duplicate at offset position
                  const { cellWidth } = getGridMetrics();
                  addDesktopShortcut(shortcut.programId, shortcut.x + cellWidth, shortcut.y);
                  window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
                }
              } catch (error) {
                console.error('[DesktopIcon] Error duplicating shortcut:', error);
              }
            }
          },
        });
      }

      // Rename action - only show if single selection
      if (
        !isMultipleSelection &&
        (selectedShortcuts.length === 1 ||
          selectedFolders.length === 1 ||
          selectedFiles.length === 1 ||
          selectedMedia.length === 1)
      ) {
        items.push({
          id: 'desktop-icon-rename',
          label: 'Rename',
          icon: 'rename',
          action: async (context: MenuContext) => {
            const shortcutId = context.target.getAttribute('data-shortcut-id');
            const folderId = context.target.getAttribute('data-folder-id');
            const fileId = context.target.getAttribute('data-file-id');
            const mediaId = context.target.getAttribute('data-media-id');
            if (shortcutId) {
              try {
                const { getDesktopShortcuts, renameDesktopShortcut } =
                  await import('@core/desktop-shortcuts');
                const shortcuts = getDesktopShortcuts();
                const shortcut = shortcuts.find((s) => s.id === shortcutId);
                if (shortcut) {
                  const currentName = shortcut.customName || '';
                  const newName = await dialog.prompt('Enter new shortcut name:', currentName);
                  if (newName !== null && newName.trim()) {
                    renameDesktopShortcut(shortcutId, newName.trim());
                  }
                }
              } catch (error) {
                console.error('[DesktopIcon] Error renaming shortcut:', error);
              }
            } else if (folderId) {
              try {
                const { renameDesktopFolder } = await import('@core/desktop-shortcuts');
                const newName = await dialog.prompt('Enter new folder name:');
                if (newName !== null && newName.trim()) {
                  renameDesktopFolder(folderId, newName.trim());
                }
              } catch (error) {
                console.error('[DesktopIcon] Error renaming folder:', error);
              }
            } else if (fileId) {
              try {
                const { getFileById, renameDesktopFile } = await import('@core/desktop-shortcuts');
                const file = getFileById(fileId);
                const newName = await dialog.prompt('Enter new file name:', file?.name ?? '');
                if (newName !== null && newName.trim()) {
                  renameDesktopFile(fileId, newName.trim());
                }
              } catch (error) {
                console.error('[DesktopIcon] Error renaming file:', error);
              }
            } else if (mediaId) {
              try {
                const { getMediaById, renameDesktopMedia } =
                  await import('@core/desktop-shortcuts');
                const media = getMediaById(mediaId);
                const newName = await dialog.prompt('Enter new name:', media?.name ?? '');
                if (newName !== null && newName.trim()) {
                  renameDesktopMedia(mediaId, newName.trim());
                }
              } catch (error) {
                console.error('[DesktopIcon] Error renaming media:', error);
              }
            }
          },
        });
      }

      if (
        items.length > 0 &&
        (!isMultipleSelection ||
          selectedShortcuts.length > 0 ||
          selectedFolders.length > 0 ||
          selectedFiles.length > 0 ||
          selectedMedia.length > 0)
      ) {
        items.push({
          id: 'desktop-icon-separator-2',
          type: 'separator',
          label: '',
        });
      }

      const totalSelectedForDelete =
        selectedShortcuts.length +
        selectedFolders.length +
        selectedFiles.length +
        selectedMedia.length;
      const { getDeleteItemsLabel, deleteDesktopItems } = await import('@core/delete-items');

      items.push({
        id: 'desktop-icon-delete',
        label: getDeleteItemsLabel(totalSelectedForDelete),
        icon: 'delete',
        shortcut: 'Delete',
        action: async () => {
          try {
            await deleteDesktopItems([
              ...selectedShortcuts,
              ...selectedFolders,
              ...selectedFiles,
              ...selectedMedia,
            ]);
          } catch (error) {
            console.error('[DesktopIcon] Error deleting items:', error);
          }
        },
      });

      return items;
    },
  });
}
