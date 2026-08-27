import type { ContextMenuManager, MenuContext, MenuItem } from '../../ContextMenuManager';

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
                const { getDesktopShortcuts, addDesktopShortcut, getGridMetrics } = await import('@core/desktop-shortcuts');
                const shortcuts = getDesktopShortcuts();
                const shortcut = shortcuts.find(s => s.id === shortcutId);
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
        shortcut: 'Delete',
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
}
