import { ContextMenuManager } from './ContextMenuManager';
import type { MenuContext, MenuItem } from './types';
import { useKernel } from '@core/kernel';
import { organizeIconsByName, organizeIconsByDate } from '@core/desktop-shortcuts';

// Track if default menus have been registered
let defaultMenusRegistered = false;

/**
 * Register default system context menus
 */
export function registerDefaultMenus(): void {
  // Prevent duplicate registration
  if (defaultMenusRegistered) {
    console.log('[DefaultMenus] Default menus already registered, skipping...');
    return;
  }

  const manager = ContextMenuManager.getInstance();
  
  console.log('[DefaultMenus] Registering default context menus...');

  // Desktop context menu
  manager.registerProvider({
    id: 'system-desktop-menu',
    target: 'desktop',
    programId: 'system',
    priority: 0,
    generator: async (context: MenuContext) => {
      const items: MenuItem[] = [];
      
      // Static items
      items.push(
      {
        id: 'desktop-view',
        label: 'View',
        icon: 'view',
        type: 'submenu',
        submenu: [
          {
            id: 'desktop-icon-size-small',
            label: 'Icon Size: Small',
            icon: 'view',
            action: (_context) => {
              useKernel.getState().updateSettings({ iconSize: 48 });
            },
          },
          {
            id: 'desktop-icon-size-medium',
            label: 'Icon Size: Medium',
            icon: 'view',
            action: (_context) => {
              useKernel.getState().updateSettings({ iconSize: 64 });
            },
          },
          {
            id: 'desktop-icon-size-large',
            label: 'Icon Size: Large',
            icon: 'view',
            action: (_context) => {
              useKernel.getState().updateSettings({ iconSize: 80 });
            },
          },
          {
            id: 'desktop-view-separator-1',
            type: 'separator',
            label: '',
          },
          {
            id: 'desktop-show-labels',
            label: 'Show Icon Labels',
            icon: 'view',
            action: (_context) => {
              const current = useKernel.getState().settings.showIconLabels;
              useKernel.getState().updateSettings({ showIconLabels: !current });
            },
          },
          {
            id: 'desktop-view-separator-2',
            type: 'separator',
            label: '',
          },
          {
            id: 'desktop-refresh',
            label: 'Refresh',
            icon: 'refresh',
            action: (_context) => {
              window.location.reload();
            },
          },
        ],
      },
      {
        id: 'desktop-organize',
        label: 'Organize By',
        icon: 'organize',
        type: 'submenu',
        submenu: [
          {
            id: 'desktop-organize-name',
            label: 'Name',
            icon: 'organize',
            action: async (_context) => {
              await organizeIconsByName();
            },
          },
          {
            id: 'desktop-organize-date',
            label: 'Date Created',
            icon: 'organize',
            action: (_context) => {
              organizeIconsByDate();
            },
          },
        ],
      },
      {
        id: 'desktop-new-folder',
        label: 'New Folder',
        icon: 'new-folder',
        action: async (context: MenuContext) => {
          try {
            const { createDesktopFolder, findItemAtPosition, pixelToGrid } = await import('@core/desktop-shortcuts');
            const desktopElement = document.querySelector('.desktop');
            if (desktopElement && context.event && 'clientX' in context.event && 'clientY' in context.event) {
              const rect = desktopElement.getBoundingClientRect();
              // Convert click coordinates to desktop-relative coordinates
              const x = context.event.clientX - rect.left;
              const y = context.event.clientY - rect.top;
              const gridPos = pixelToGrid(x, y);
              
              // Check if there's already an item at this position
              const existingItem = findItemAtPosition(gridPos.x, gridPos.y);
              if (existingItem) {
                console.warn('[Desktop] Cannot create folder: position already occupied by', existingItem);
                return;
              }
              
              createDesktopFolder('New Folder', gridPos.x, gridPos.y);
            } else {
              createDesktopFolder('New Folder');
            }
          } catch (error) {
            console.error('[Desktop] Error creating folder:', error);
          }
        },
      },
        {
          id: 'desktop-separator-paste',
          type: 'separator',
          label: '',
        }
      );

      // Check clipboard and add Paste if available
      try {
        const { getClipboard, hasClipboardData } = await import('@core/clipboard');
        if (hasClipboardData()) {
          const clipboard = getClipboard();
          if (clipboard && clipboard.type === 'desktop-items') {
            const itemCount = clipboard.items.length;
            items.push({
              id: 'desktop-paste',
              label: itemCount > 1 ? `Paste (${itemCount} items)` : 'Paste',
              icon: 'paste',
              shortcut: 'Cmd+V',
              action: async () => {
                try {
                  const { getPasteHandler } = await import('@core/clipboard');
                  const handler = getPasteHandler();
                  if (handler) {
                    handler();
                  }
                } catch (error) {
                  console.error('[Desktop] Error pasting items:', error);
                }
              },
            });
          }
        }
      } catch (error) {
        console.error('[Desktop] Error checking clipboard:', error);
      }

      items.push(
        {
          id: 'desktop-separator-1',
          type: 'separator',
          label: '',
        },
        {
          id: 'desktop-settings',
          label: 'Settings',
          icon: 'settings',
          action: async (context: MenuContext) => {
            console.log('[Desktop] Open Settings', context);
            try {
              const { launchOrFocusProgram } = await import('@core/context');
              await launchOrFocusProgram('settings');
            } catch (error) {
              console.error('[Desktop] Error opening Settings:', error);
            }
          },
        }
      );

      return items;
    },
  });

  // Launcher item context menu
  manager.registerProvider({
    id: 'system-launcher-item-menu',
    target: '.launcher-item',
    programId: 'system',
    priority: 0,
    items: [
      {
        id: 'launcher-create-shortcut',
        label: 'Create Desktop Shortcut',
        icon: 'open',
        action: async (context: MenuContext) => {
          const programId = context.target.getAttribute('data-program-id');
          if (programId) {
            try {
              const { addDesktopShortcut } = await import('@core/desktop-shortcuts');
              addDesktopShortcut(programId);
              
              // Dispatch custom event to notify DesktopIcons to refresh
              window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
            } catch (error) {
              console.error('[Launcher] Error creating desktop shortcut:', error);
            }
          }
        },
      },
    ],
  });

  // Desktop icon context menu (for shortcuts)
  manager.registerProvider({
    id: 'system-desktop-icon-menu',
    target: '.desktop-icon:not(.folder-icon)',
    programId: 'system',
    priority: 0,
    generator: async (context: MenuContext) => {
      const items: MenuItem[] = [];
      
      // Check for multiple selection
      const selection = context.selection as { type: string; ids: string[]; count: number } | undefined;
      const isMultipleSelection = selection?.type === 'desktop-icons' && selection.count > 1;
      
      // Get selected items info
      let selectedShortcuts: string[] = [];
      let selectedFolders: string[] = [];
      
      if (isMultipleSelection && selection) {
        // Multiple selection - get all selected items
        const { getDesktopShortcuts, getDesktopFolders } = await import('@core/desktop-shortcuts');
        const shortcuts = getDesktopShortcuts();
        const folders = getDesktopFolders();
        
        selection.ids.forEach(id => {
          if (shortcuts.some(s => s.id === id)) {
            selectedShortcuts.push(id);
          } else if (folders.some(f => f.id === id)) {
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
      
      // Open action - only show if single selection and it's a shortcut
      if (!isMultipleSelection && selectedShortcuts.length === 1) {
        const programId = context.target.getAttribute('data-program-id');
        let programName = '';
        let allowMultiple = false;
        
        if (programId) {
          try {
            const { programs } = await import('virtual:programs');
            const program = programs[programId];
            if (program) {
              const module = await program.load();
              programName = module.default.name;
              allowMultiple = module.default.allowMultipleWindows ?? false;
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
        }
      }
      
      if (items.length > 0) {
        items.push({
          id: 'desktop-icon-separator-1',
          type: 'separator',
          label: '',
        });
      }

      // Copy and Cut actions - show if there's a selection
      const totalSelectedForCopyCut = selectedShortcuts.length + selectedFolders.length;
      if (totalSelectedForCopyCut > 0) {
        items.push({
          id: 'desktop-icon-copy',
          label: 'Copy',
          icon: 'copy',
          shortcut: 'Cmd+C',
          action: async () => {
            try {
              const { copy } = await import('@core/clipboard');
              const clipboardItems: Array<{ id: string; type: 'shortcut' | 'folder' }> = [];
              selectedShortcuts.forEach(id => {
                clipboardItems.push({ id, type: 'shortcut' });
              });
              selectedFolders.forEach(id => {
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
              const clipboardItems: Array<{ id: string; type: 'shortcut' | 'folder' }> = [];
              selectedShortcuts.forEach(id => {
                clipboardItems.push({ id, type: 'shortcut' });
              });
              selectedFolders.forEach(id => {
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
      if (!isMultipleSelection && (selectedShortcuts.length === 1 || selectedFolders.length === 1)) {
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
                const { getDesktopShortcuts, addDesktopShortcut, getGridSize } = await import('@core/desktop-shortcuts');
                const shortcuts = getDesktopShortcuts();
                const shortcut = shortcuts.find(s => s.id === shortcutId);
                if (shortcut) {
                  // Add duplicate at offset position
                  const gridSize = getGridSize();
                  addDesktopShortcut(shortcut.programId, shortcut.x + gridSize, shortcut.y);
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
      if (!isMultipleSelection && (selectedShortcuts.length === 1 || selectedFolders.length === 1)) {
        items.push({
          id: 'desktop-icon-rename',
          label: 'Rename',
          icon: 'rename',
          action: async (context: MenuContext) => {
            const shortcutId = context.target.getAttribute('data-shortcut-id');
            const folderId = context.target.getAttribute('data-folder-id');
            if (shortcutId) {
              try {
                const { getDesktopShortcuts, renameDesktopShortcut } = await import('@core/desktop-shortcuts');
                const shortcuts = getDesktopShortcuts();
                const shortcut = shortcuts.find(s => s.id === shortcutId);
                if (shortcut) {
                  const currentName = shortcut.customName || '';
                  const newName = prompt('Enter new shortcut name:', currentName);
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
                const newName = prompt('Enter new folder name:');
                if (newName && newName.trim()) {
                  renameDesktopFolder(folderId, newName.trim());
                }
              } catch (error) {
                console.error('[DesktopIcon] Error renaming folder:', error);
              }
            }
          },
        });
      }
      
      if (items.length > 0 && (!isMultipleSelection || selectedShortcuts.length > 0 || selectedFolders.length > 0)) {
        items.push({
          id: 'desktop-icon-separator-2',
          type: 'separator',
          label: '',
        });
      }
      
      // Delete action - adapt label based on selection
      const totalSelectedForDelete = selectedShortcuts.length + selectedFolders.length;
      const deleteLabel = totalSelectedForDelete > 1 
        ? `Delete (${totalSelectedForDelete} items)`
        : selectedFolders.length > 0 
          ? 'Delete'
          : 'Delete';
      
      items.push({
        id: 'desktop-icon-delete',
        label: deleteLabel,
        icon: 'delete',
        action: async () => {
          try {
            const { removeDesktopShortcut, deleteDesktopFolder } = await import('@core/desktop-shortcuts');
            
            // Show confirmation dialog if there are folders to delete
            if (selectedFolders.length > 0) {
              const folderMessage = selectedFolders.length === 1
                ? 'Are you sure you want to delete this folder and all its contents?'
                : `Are you sure you want to delete ${selectedFolders.length} folders and all their contents?`;
              
              if (!confirm(folderMessage)) {
                return; // User cancelled
              }
            }
            
            // Delete all selected shortcuts (no confirmation needed for shortcuts)
            for (const shortcutId of selectedShortcuts) {
              removeDesktopShortcut(shortcutId);
            }
            
            // Delete all selected folders
            for (const folderId of selectedFolders) {
              deleteDesktopFolder(folderId);
            }
            
            // Dispatch custom event to notify DesktopIcons to refresh
            window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
          } catch (error) {
            console.error('[DesktopIcon] Error deleting items:', error);
          }
        },
      });
      
      return items;
    },
  });

  // Folder icon context menu
  manager.registerProvider({
    id: 'system-folder-icon-menu',
    target: '.folder-icon',
    programId: 'system',
    priority: 0,
    generator: async (context: MenuContext) => {
      const items: MenuItem[] = [];
      
      // Check for multiple selection
      const selection = context.selection as { type: string; ids: string[]; count: number } | undefined;
      const isMultipleSelection = selection?.type === 'desktop-icons' && selection.count > 1;
      
      // Get selected items info
      let selectedShortcuts: string[] = [];
      let selectedFolders: string[] = [];
      
      if (isMultipleSelection && selection) {
        // Multiple selection - get all selected items
        const { getDesktopShortcuts, getDesktopFolders } = await import('@core/desktop-shortcuts');
        const shortcuts = getDesktopShortcuts();
        const folders = getDesktopFolders();
        
        selection.ids.forEach(id => {
          if (shortcuts.some(s => s.id === id)) {
            selectedShortcuts.push(id);
          } else if (folders.some(f => f.id === id)) {
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
          icon: '▶️',
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
              selectedShortcuts.forEach(id => {
                clipboardItems.push({ id, type: 'shortcut' });
              });
              selectedFolders.forEach(id => {
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
              selectedShortcuts.forEach(id => {
                clipboardItems.push({ id, type: 'shortcut' });
              });
              selectedFolders.forEach(id => {
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
              const newName = prompt('Enter new folder name:');
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
      
      // Delete action - adapt label based on selection
      const totalSelectedForDelete = selectedShortcuts.length + selectedFolders.length;
      const deleteLabel = totalSelectedForDelete > 1 
        ? `Delete (${totalSelectedForDelete} items)`
        : 'Delete';
      
      items.push({
        id: 'folder-icon-delete',
        label: deleteLabel,
        icon: 'delete',
        action: async () => {
          try {
            const { removeDesktopShortcut, deleteDesktopFolder } = await import('@core/desktop-shortcuts');
            
            // Show confirmation dialog if there are folders to delete
            if (selectedFolders.length > 0) {
              const folderMessage = selectedFolders.length === 1
                ? 'Are you sure you want to delete this folder and all its contents?'
                : `Are you sure you want to delete ${selectedFolders.length} folders and all their contents?`;
              
              if (!confirm(folderMessage)) {
                return; // User cancelled
              }
            }
            
            // Delete all selected shortcuts (no confirmation needed for shortcuts)
            for (const shortcutId of selectedShortcuts) {
              removeDesktopShortcut(shortcutId);
            }
            
            // Delete all selected folders
            for (const folderId of selectedFolders) {
              deleteDesktopFolder(folderId);
            }
            
            // Dispatch custom event to notify DesktopIcons to refresh
            window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
          } catch (error) {
            console.error('[FolderIcon] Error deleting items:', error);
          }
        },
      });
      
      return items;
    },
  });

  // Window context menu
  manager.registerProvider({
    id: 'system-window-menu',
    target: 'window',
    programId: 'system',
    priority: 0,
    items: [
      {
        id: 'window-restore',
        label: 'Restore',
        icon: 'restore',
        action: (context: MenuContext) => {
          console.log('[Window] Restore', context);
          if (context.windowId) {
            import('@core/kernel').then(({ useKernel }) => {
              useKernel.getState().restoreWindow(context.windowId!);
            });
          }
        },
      },
      {
        id: 'window-move',
        label: 'Move',
        icon: 'open',
        action: (context: MenuContext) => {
          console.log('[Window] Move', context);
          // Move is typically handled by dragging the title bar
          // This could trigger a move mode if needed
        },
      },
      {
        id: 'window-resize',
        label: 'Resize',
        icon: 'maximize',
        action: (context: MenuContext) => {
          console.log('[Window] Resize', context);
          // Resize is typically handled by dragging the edges
          // This could trigger a resize mode if needed
        },
      },
      {
        id: 'window-separator-1',
        type: 'separator',
        label: '',
      },
      {
        id: 'window-minimize',
        label: 'Minimize',
        icon: 'minimize',
        action: (context: MenuContext) => {
          console.log('[Window] Minimize', context);
          if (context.windowId) {
            import('@core/kernel').then(({ useKernel }) => {
              useKernel.getState().minimizeWindow(context.windowId!);
            });
          }
        },
      },
      {
        id: 'window-maximize',
        label: 'Maximize',
        icon: 'maximize',
        action: (context: MenuContext) => {
          console.log('[Window] Maximize', context);
          if (context.windowId) {
            import('@core/kernel').then(({ useKernel }) => {
              const kernel = useKernel.getState();
              const window = kernel.windows.find((w) => w.id === context.windowId);
              if (window) {
                if (window.isMaximized) {
                  kernel.restoreWindow(context.windowId!);
                } else {
                  kernel.maximizeWindow(context.windowId!);
                }
              }
            });
          }
        },
      },
      {
        id: 'window-separator-2',
        type: 'separator',
        label: '',
      },
      {
        id: 'window-bring-to-front',
        label: 'Bring All to Front',
        icon: 'bring-to-front',
        action: async (context: MenuContext) => {
          if (context.programId) {
            const { useKernel } = await import('@core/kernel');
            const kernel = useKernel.getState();
            const programWindows = kernel.windows.filter((w) => w.programId === context.programId);
            programWindows.forEach((win) => {
              kernel.focusWindow(win.id);
            });
          }
        },
      },
      {
        id: 'window-separator-3',
        type: 'separator',
        label: '',
      },
      {
        id: 'window-hide',
        label: 'Hide',
        icon: 'hide',
        action: async (context: MenuContext) => {
          if (context.programId) {
            const { useKernel } = await import('@core/kernel');
            const kernel = useKernel.getState();
            const programWindows = kernel.windows.filter((w) => w.programId === context.programId);
            programWindows.forEach((win) => {
              kernel.minimizeWindow(win.id);
            });
          }
        },
      },
      {
        id: 'window-hide-others',
        label: 'Hide Others',
        icon: 'hide-others',
        action: async (context: MenuContext) => {
          if (context.programId) {
            const { useKernel } = await import('@core/kernel');
            const kernel = useKernel.getState();
            kernel.windows.forEach((win) => {
              if (win.programId !== context.programId) {
                kernel.minimizeWindow(win.id);
              }
            });
          }
        },
      },
      {
        id: 'window-show-all',
        label: 'Show All',
        icon: 'show-all',
        action: async () => {
          const { useKernel } = await import('@core/kernel');
          const kernel = useKernel.getState();
          kernel.windows.forEach((win) => {
            if (win.isMinimized) {
              kernel.restoreWindow(win.id);
            }
          });
        },
      },
      {
        id: 'window-separator-4',
        type: 'separator',
        label: '',
      },
      {
        id: 'window-close',
        label: 'Close',
        icon: 'close',
        action: (context: MenuContext) => {
          console.log('[Window] Close', context);
          if (context.windowId) {
            // Import kernel dynamically to avoid circular dependency
            import('@core/kernel').then(({ useKernel }) => {
              useKernel.getState().closeWindow(context.windowId!);
            });
          }
        },
      },
    ],
  });

  // Text selection context menu
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

  defaultMenusRegistered = true;
  
  console.log('[DefaultMenus] Default menus registered:', {
    desktop: manager.getRenderState(),
  });
}
