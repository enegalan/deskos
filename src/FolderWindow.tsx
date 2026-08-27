import { useState, useEffect, useCallback, useRef } from 'react';
import { useKernel } from '@core/kernel';
import { ICON_EMOJI_SCALE, ICON_GLYPH_SCALE } from '@core/constants';
import {
  getItemsByPath,
  getSpecialLocationItems,
  resolvePath,
  parsePath,
  addRecentItem,
  SPECIAL_LOCATIONS,
} from '../file-system/file-system';
import {
  getDesktopFolders,
  type DesktopItem,
  isDesktopFolder,
  isDesktopShortcut,
  getGridSize,
  addItemToFolder,
  getFolderByPath,
} from '@core/desktop-shortcuts';
import { programs } from 'virtual:programs';
import { launchOrFocusProgram } from '@core/context';
import { FolderSidebar } from './FolderSidebar';
import { Icon } from '../components/Icon';
import { hasIcon, type IconName } from '@core/icons';
import { registerSelectAllHandler } from '@core/selection';
import { registerCopyHandler, registerCutHandler, registerPasteHandler, copy as clipboardCopy, cut as clipboardCut, getClipboard, clearClipboard, CLIPBOARD_PRIORITY, HandlerSkippedError, type ClipboardItem } from '@core/clipboard';

interface FolderWindowProps {
  /** Absolute path to open (default `/Desktop`) */
  initialPath?: string;
  /** Open by folder id when path is unknown */
  folderId?: string;
}

/** File-browser window: sidebar, breadcrumbs, grid, and clipboard/DnD. */
export function FolderWindow({ initialPath, folderId }: FolderWindowProps) {
  const [currentPath, setCurrentPath] = useState<string>(initialPath || '/Desktop');
  const [items, setItems] = useState<DesktopItem[]>([]);
  const [folderName, setFolderName] = useState<string>('Folder');
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [pathInput, setPathInput] = useState(initialPath || '/Desktop');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedIndexRef = useRef<number>(-1);
  const contentRef = useRef<HTMLDivElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const isInitialMount = useRef(true);

  const loadItems = useCallback((path: string) => {
    const resolved = resolvePath(path);
    
    if (resolved.type === 'special') {
      const locationItems = getSpecialLocationItems(resolved.location!);
      setItems(locationItems);
      const locationInfo = Object.values(SPECIAL_LOCATIONS).find(
        loc => loc.path === path
      );
      setFolderName(locationInfo?.name || 'Location');
    } else if (resolved.type === 'folder') {
      const folderItems = getItemsByPath(path);
      setItems(folderItems);
      setFolderName(resolved.folder!.name);
    } else {
      setItems([]);
      setFolderName('Folder');
    }
    
    // Add to recent items
    addRecentItem(path);
  }, []);

  useEffect(() => {
    if (folderId && isInitialMount.current) {
      const folders = getDesktopFolders();
      const folder = folders.find(f => f.id === folderId);
      if (folder) {
        const path = `/Desktop/${folder.name}`;
        setCurrentPath(path);
        setPathInput(path);
        loadItems(path);
        isInitialMount.current = false;
      }
    } else if (isInitialMount.current) {
      setPathInput(currentPath);
      loadItems(currentPath);
      isInitialMount.current = false;
    }
  }, [folderId, loadItems]);

  useEffect(() => {
    if (!isEditingPath) {
      setPathInput(currentPath);
    }
  }, [currentPath, isEditingPath]);

  // Listen for desktop-shortcuts-updated to refresh when items are added via drag and drop
  useEffect(() => {
    const handleShortcutsUpdated = () => {
      // Reload items if we're viewing a folder
      const resolved = resolvePath(currentPath);
      if (resolved.type === 'folder') {
        console.log('[FolderWindow] Desktop shortcuts updated, reloading items');
        loadItems(currentPath);
      }
    };

    window.addEventListener('desktop-shortcuts-updated', handleShortcutsUpdated);
    return () => {
      window.removeEventListener('desktop-shortcuts-updated', handleShortcutsUpdated);
    };
  }, [currentPath, loadItems]);

  const handleNavigate = useCallback((path: string) => {
    setCurrentPath(path);
    loadItems(path);
  }, [loadItems]);

  const handleItemSelect = useCallback((item: DesktopItem, e?: React.MouseEvent, forceSingle?: boolean) => {
    const isCtrlClick = !forceSingle && e && (e.ctrlKey || e.metaKey);
    const isShiftClick = !forceSingle && e && e.shiftKey;
    
    if (isShiftClick && lastSelectedIndexRef.current >= 0) {
      // Range selection
      const currentIndex = items.findIndex(i => i.id === item.id);
      if (currentIndex >= 0) {
        const start = Math.min(lastSelectedIndexRef.current, currentIndex);
        const end = Math.max(lastSelectedIndexRef.current, currentIndex);
        const newSelection = new Set(selectedIds);
        for (let i = start; i <= end; i++) {
          newSelection.add(items[i].id);
        }
        setSelectedIds(newSelection);
      }
    } else if (isCtrlClick) {
      // Toggle selection
      const newSelection = new Set(selectedIds);
      if (newSelection.has(item.id)) {
        newSelection.delete(item.id);
      } else {
        newSelection.add(item.id);
      }
      setSelectedIds(newSelection);
      lastSelectedIndexRef.current = items.findIndex(i => i.id === item.id);
    } else {
      // Single selection
      setSelectedIds(new Set([item.id]));
      lastSelectedIndexRef.current = items.findIndex(i => i.id === item.id);
    }
  }, [selectedIds, items]);

  const handleItemClick = useCallback(async (item: DesktopItem, e?: React.MouseEvent) => {
    // Handle selection on single click
    handleItemSelect(item, e);
    
    // Double click handling is separate
  }, [handleItemSelect]);

  const handleItemDoubleClick = useCallback(async (item: DesktopItem) => {
    if (isDesktopFolder(item)) {
      const path = `${currentPath}/${item.name}`;
      handleNavigate(path);
    } else if (isDesktopShortcut(item)) {
      await launchOrFocusProgram(item.programId);
    }
  }, [currentPath, handleNavigate]);

  // Context menu "Open" on a nested folder navigates this window
  useEffect(() => {
    const handleFolderNavigate = (e: Event) => {
      const detail = (e as CustomEvent<{ windowId?: string; path: string }>).detail;
      if (!detail?.path || !detail.windowId || !contentRef.current) return;
      const hostWindow = contentRef.current.closest('[data-window-id]');
      const thisWindowId = hostWindow?.getAttribute('data-window-id');
      if (!thisWindowId || thisWindowId !== detail.windowId) return;
      handleNavigate(detail.path);
    };

    window.addEventListener('folder-navigate', handleFolderNavigate as EventListener);
    return () => {
      window.removeEventListener('folder-navigate', handleFolderNavigate as EventListener);
    };
  }, [handleNavigate]);

  const breadcrumbs = parsePath(currentPath);

  const handleBreadcrumbClick = useCallback((index: number) => {
    const pathParts = breadcrumbs.slice(0, index + 1);
    const newPath = '/' + pathParts.join('/');
    handleNavigate(newPath);
  }, [breadcrumbs, handleNavigate]);

  const handlePathClick = useCallback(() => {
    setIsEditingPath(true);
    setPathInput(currentPath);
    setTimeout(() => {
      pathInputRef.current?.focus();
      pathInputRef.current?.select();
    }, 0);
  }, [currentPath]);

  const handlePathInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPathInput(e.target.value);
  }, []);

  const handlePathInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const normalizedPath = pathInput.trim() || '/Desktop';
      const finalPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
      handleNavigate(finalPath);
      setIsEditingPath(false);
    } else if (e.key === 'Escape') {
      setIsEditingPath(false);
      setPathInput(currentPath);
    }
  }, [pathInput, currentPath, handleNavigate]);

  const handlePathInputBlur = useCallback(() => {
    setIsEditingPath(false);
    setPathInput(currentPath);
  }, [currentPath]);

  // Select All handler
  const handleSelectAll = useCallback(() => {
    const allItemIds = items.map(item => item.id);
    setSelectedIds(new Set(allItemIds));
    if (allItemIds.length > 0) {
      lastSelectedIndexRef.current = allItemIds.length - 1;
    }
  }, [items]);

  // Copy handler
  const handleCopy = useCallback(() => {
    // If no selection in this folder window, check if there's desktop selection
    if (selectedIds.size === 0) {
      const desktopSelection = (window as any).__desktopSelection as Set<string> | undefined;
      if (desktopSelection && desktopSelection.size > 0) {
        // There's desktop selection, let DesktopIcons handle it
        throw new HandlerSkippedError();
      }
      // No selection anywhere, nothing to copy
      return;
    }

    const clipboardItems: ClipboardItem[] = [];
    selectedIds.forEach(id => {
      const item = items.find(i => i.id === id);
      if (item) {
        if (isDesktopShortcut(item)) {
          clipboardItems.push({ id: item.id, type: 'shortcut' });
        } else if (isDesktopFolder(item)) {
          clipboardItems.push({ id: item.id, type: 'folder' });
        }
      }
    });

    if (clipboardItems.length > 0) {
      clipboardCopy({
        type: 'folder-items',
        items: clipboardItems,
        operation: 'copy',
        sourcePath: currentPath,
      });
    }
  }, [selectedIds, items, currentPath]);

  // Cut handler
  const handleCut = useCallback(() => {
    // If no selection in this folder window, check if there's desktop selection
    if (selectedIds.size === 0) {
      const desktopSelection = (window as any).__desktopSelection as Set<string> | undefined;
      if (desktopSelection && desktopSelection.size > 0) {
        // There's desktop selection, let DesktopIcons handle it
        throw new HandlerSkippedError();
      }
      // No selection anywhere, nothing to cut
      return;
    }

    const clipboardItems: ClipboardItem[] = [];
    selectedIds.forEach(id => {
      const item = items.find(i => i.id === id);
      if (item) {
        if (isDesktopShortcut(item)) {
          clipboardItems.push({ id: item.id, type: 'shortcut' });
        } else if (isDesktopFolder(item)) {
          clipboardItems.push({ id: item.id, type: 'folder' });
        }
      }
    });

    if (clipboardItems.length > 0) {
      clipboardCut({
        type: 'folder-items',
        items: clipboardItems,
        operation: 'cut',
        sourcePath: currentPath,
      });
    }
  }, [selectedIds, items, currentPath]);

  // Paste handler
  const handlePaste = useCallback(async () => {
    console.log('[FolderWindow] Paste: Handler called');
    
    // Verify this window is active before handling paste
    // We need to check if ANY folder window is active, not just this specific instance
    const kernel = useKernel.getState();
    if (kernel.activeWindowId) {
      const activeWindow = kernel.windows.find(w => w.id === kernel.activeWindowId);
      if (!activeWindow || activeWindow.programId !== 'folder') {
        console.log('[FolderWindow] Paste: Not a folder window active, skipping');
        // Throw special error to indicate next handler should be tried
        throw new HandlerSkippedError();
      }
    } else {
      console.log('[FolderWindow] Paste: No active window, skipping');
      throw new HandlerSkippedError();
    }
    
    const clipboard = getClipboard();
    console.log('[FolderWindow] Paste: Clipboard data', clipboard);
    if (!clipboard || clipboard.items.length === 0) {
      console.log('[FolderWindow] Paste: No clipboard data');
      return;
    }

    // Handle both folder-items and desktop-items
    if (clipboard.type !== 'folder-items' && clipboard.type !== 'desktop-items') {
      console.log('[FolderWindow] Paste: Wrong clipboard type', clipboard.type);
      return;
    }

    // Get the current folder
    const resolved = resolvePath(currentPath);
    if (resolved.type !== 'folder') {
      console.log('[FolderWindow] Paste: Current path is not a folder', currentPath);
      return;
    }

    const currentFolder = getFolderByPath(currentPath);
    if (!currentFolder) {
      console.log('[FolderWindow] Paste: Folder not found', currentPath);
      return;
    }

    const { getDesktopShortcuts, getDesktopFolders, removeItemFromFolder } = await import('@core/desktop-shortcuts');
    const allShortcuts = getDesktopShortcuts();
    const allFolders = getDesktopFolders();

    try {
      if (clipboard.operation === 'copy') {
        console.log('[FolderWindow] Paste: Copying', clipboard.items.length, 'items to folder');
        // Copy items to current folder - create new items instead of moving
        const { addDesktopShortcut, createDesktopFolder } = await import('@core/desktop-shortcuts');
        
        for (const item of clipboard.items) {
          // Verify item exists
          const shortcut = allShortcuts.find(s => s.id === item.id);
          const folder = allFolders.find(f => f.id === item.id);
          
          if (!shortcut && !folder) {
            console.warn('[FolderWindow] Paste: Item not found', item.id);
            continue;
          }

          if (shortcut) {
            // Create a new shortcut with the same programId and customName
            console.log('[FolderWindow] Paste: Creating copy of shortcut', shortcut.id);
            const newShortcut = addDesktopShortcut(shortcut.programId, undefined, undefined, shortcut.customName);
            // Add the new shortcut to the folder
            addItemToFolder(currentFolder.id, newShortcut.id);
          } else if (folder) {
            // Create a new folder with the same name
            console.log('[FolderWindow] Paste: Creating copy of folder', folder.id);
            const newFolder = createDesktopFolder(folder.name, undefined, undefined, currentPath === '/Desktop' ? undefined : currentPath);
            
            // Add the new folder to the current folder
            console.log('[FolderWindow] Paste: Adding new folder to current folder', newFolder.id);
            addItemToFolder(currentFolder.id, newFolder.id);
            
            // Copy contents recursively
            const copyFolderContents = async (sourceFolderId: string, targetFolderId: string) => {
              // Get fresh data for each recursive call
              const { getDesktopFolders: getCurrentFolders, getDesktopShortcuts: getCurrentShortcuts } = await import('@core/desktop-shortcuts');
              const currentFolders = getCurrentFolders();
              const currentShortcuts = getCurrentShortcuts();
              
              const sourceFolder = currentFolders.find(f => f.id === sourceFolderId);
              if (!sourceFolder) return;
              
              const targetFolder = currentFolders.find(f => f.id === targetFolderId);
              if (!targetFolder) return;
              
              for (const contentId of sourceFolder.contents) {
                const contentShortcut = currentShortcuts.find(s => s.id === contentId);
                const contentFolder = currentFolders.find(f => f.id === contentId);
                
                if (contentShortcut) {
                  // Copy shortcut
                  const newContentShortcut = addDesktopShortcut(contentShortcut.programId, undefined, undefined, contentShortcut.customName);
                  addItemToFolder(targetFolderId, newContentShortcut.id);
                } else if (contentFolder) {
                  // Recursively copy folder
                  const targetFolderPath = targetFolder.parentPath ? `${targetFolder.parentPath}/${targetFolder.name}` : `/Desktop/${targetFolder.name}`;
                  const newContentFolder = createDesktopFolder(contentFolder.name, undefined, undefined, targetFolderPath === '/Desktop' ? undefined : targetFolderPath);
                  addItemToFolder(targetFolderId, newContentFolder.id);
                  // Recursively copy its contents
                  await copyFolderContents(contentFolder.id, newContentFolder.id);
                }
              }
            };
            
            await copyFolderContents(folder.id, newFolder.id);
          }
        }
      } else if (clipboard.operation === 'cut') {
        console.log('[FolderWindow] Paste: Moving', clipboard.items.length, 'items to folder');
        // Move items to current folder
        for (const item of clipboard.items) {
          // Verify item exists
          const shortcut = allShortcuts.find(s => s.id === item.id);
          const folder = allFolders.find(f => f.id === item.id);
          
          if (!shortcut && !folder) {
            console.warn('[FolderWindow] Paste: Item not found for cut', item.id);
            continue;
          }

          // Remove from source location
          if (clipboard.type === 'folder-items' && clipboard.sourcePath) {
            // Item is from another folder
            if (clipboard.sourcePath !== currentPath) {
              const sourceResolved = resolvePath(clipboard.sourcePath);
              if (sourceResolved.type === 'folder') {
                const sourceFolder = getFolderByPath(clipboard.sourcePath);
                if (sourceFolder) {
                  console.log('[FolderWindow] Paste: Removing item from source folder', item.id);
                  removeItemFromFolder(sourceFolder.id, item.id);
                }
              }
            }
          } else if (clipboard.type === 'desktop-items') {
            // Item is from desktop - remove from any parent folder it might be in
            allFolders.forEach(f => {
              if (f.contents.includes(item.id)) {
                console.log('[FolderWindow] Paste: Removing item from parent folder', item.id, f.id);
                removeItemFromFolder(f.id, item.id);
              }
            });
          }

          // Add to current folder
          console.log('[FolderWindow] Paste: Adding item to current folder', item.id);
          addItemToFolder(currentFolder.id, item.id);
        }
        // Clear selection and clipboard after cut
        setSelectedIds(new Set());
        clearClipboard();
      }

      // Reload items to reflect changes
      loadItems(currentPath);
      window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
    } catch (error) {
      console.error('[FolderWindow] Error pasting items:', error);
    }
  }, [currentPath, loadItems]);

  // Register keyboard shortcut handlers with higher priority than desktop
  useEffect(() => {
    const unregisterSelectAll = registerSelectAllHandler(handleSelectAll);
    const unregisterCopy = registerCopyHandler(handleCopy, CLIPBOARD_PRIORITY.FOLDER_WINDOW);
    const unregisterCut = registerCutHandler(handleCut, CLIPBOARD_PRIORITY.FOLDER_WINDOW);
    const unregisterPaste = registerPasteHandler(handlePaste, CLIPBOARD_PRIORITY.FOLDER_WINDOW);

    return () => {
      unregisterSelectAll();
      unregisterCopy();
      unregisterCut();
      unregisterPaste();
    };
  }, [handleSelectAll, handleCopy, handleCut, handlePaste]);

  // Store selection state globally for context menu access
  useEffect(() => {
    (window as any).__folderSelection = { ids: Array.from(selectedIds), path: currentPath };
    return () => {
      delete (window as any).__folderSelection;
    };
  }, [selectedIds, currentPath]);

  // Handle click on folder window content to deselect
  useEffect(() => {
    const handleContentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Only deselect if clicking on the grid area, not on items
      if (target.classList.contains('folder-window-grid') || target.closest('.folder-window-grid') === target) {
        setSelectedIds(new Set());
        lastSelectedIndexRef.current = -1;
      }
    };

    const contentElement = contentRef.current;
    if (contentElement) {
      contentElement.addEventListener('click', handleContentClick);
      return () => {
        contentElement.removeEventListener('click', handleContentClick);
      };
    }
  }, []);

  // Handle drag and drop from desktop to folder window
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Check if dragging a desktop item
    const shortcutId = e.dataTransfer.getData('application/x-deskos-shortcut-id');
    const folderId = e.dataTransfer.getData('application/x-deskos-folder-id');
    const programId = e.dataTransfer.getData('application/x-deskos-program-id');
    
    if (shortcutId || folderId || programId) {
      e.dataTransfer.dropEffect = 'move';
      if (contentRef.current) {
        contentRef.current.classList.add('drag-over');
      }
    }
  }, []);

  // Handle mouse move to detect dragging over folder window (for custom drag system)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Check if any desktop icon is being dragged
      const draggingIcon = document.querySelector('.desktop-icon.dragging');
      if (draggingIcon && contentRef.current) {
        const rect = contentRef.current.getBoundingClientRect();
        const isOverWindow = e.clientX >= rect.left && e.clientX <= rect.right &&
                            e.clientY >= rect.top && e.clientY <= rect.bottom;
        
        if (isOverWindow) {
          contentRef.current.classList.add('drag-over');
          draggingIcon.classList.add('dragging-over-folder');
        } else {
          contentRef.current.classList.remove('drag-over');
          draggingIcon.classList.remove('dragging-over-folder');
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (contentRef.current) {
      contentRef.current.classList.remove('drag-over');
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (contentRef.current) {
      contentRef.current.classList.remove('drag-over');
    }

    // Get the current folder
    const resolved = resolvePath(currentPath);
    if (resolved.type !== 'folder') return;

    const currentFolder = getFolderByPath(currentPath);
    if (!currentFolder) return;

    // Check what type of item is being dropped
    const shortcutId = e.dataTransfer.getData('application/x-deskos-shortcut-id');
    const folderId = e.dataTransfer.getData('application/x-deskos-folder-id');
    const programId = e.dataTransfer.getData('application/x-deskos-program-id');

    try {
      if (shortcutId) {
        // Dropping an existing shortcut
        console.log('[FolderWindow] Drop: Adding shortcut to folder', shortcutId);
        addItemToFolder(currentFolder.id, shortcutId);
        loadItems(currentPath);
        window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
      } else if (folderId) {
        // Dropping an existing folder
        console.log('[FolderWindow] Drop: Adding folder to folder', folderId);
        // Prevent adding folder to itself
        if (folderId !== currentFolder.id) {
          addItemToFolder(currentFolder.id, folderId);
          loadItems(currentPath);
          window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
        }
      } else if (programId) {
        // Dropping a new program (from launcher/taskbar)
        console.log('[FolderWindow] Drop: Creating new shortcut from program', programId);
        const { addDesktopShortcut } = await import('@core/desktop-shortcuts');
        const newShortcut = addDesktopShortcut(programId);
        // Add the newly created shortcut to the folder
        addItemToFolder(currentFolder.id, newShortcut.id);
        loadItems(currentPath);
        window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
      }
    } catch (error) {
      console.error('[FolderWindow] Error handling drop:', error);
    }
  }, [currentPath, loadItems]);

  const settings = useKernel((state) => state.settings);
  const gridSize = getGridSize();

  return (
    <div className="folder-window-content">
      <div className="folder-window-header">
        {isEditingPath ? (
          <input
            ref={pathInputRef}
            type="text"
            className="folder-path-input"
            value={pathInput}
            onChange={handlePathInputChange}
            onKeyDown={handlePathInputKeyDown}
            onBlur={handlePathInputBlur}
            placeholder="Enter path (e.g., /Desktop/Folder1)"
          />
        ) : (
          <div className="folder-breadcrumbs" onClick={handlePathClick}>
            {breadcrumbs.length === 0 ? (
              <span className="folder-breadcrumb-item clickable">/</span>
            ) : (
              breadcrumbs.map((part, index) => (
                <span key={index} className="folder-breadcrumb">
                  {index > 0 && <span className="folder-breadcrumb-separator">/</span>}
                  <button
                    className="folder-breadcrumb-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBreadcrumbClick(index);
                    }}
                  >
                    {part}
                  </button>
                </span>
              ))
            )}
          </div>
        )}
      </div>
      <div className="folder-window-body">
        <FolderSidebar currentPath={currentPath} onNavigate={handleNavigate} />
        <div 
          ref={contentRef} 
          className="folder-window-main"
          data-folder-path={currentPath}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="folder-window-title">{folderName}</div>
          <div className="folder-window-grid">
            {items.length === 0 ? (
              <div className="folder-window-empty">This folder is empty</div>
            ) : (
              items.map((item, index) => {
                const containerWidth = contentRef.current?.clientWidth || 800;
                const itemsPerRow = Math.max(1, Math.floor((containerWidth - 32) / (gridSize + 16)));
                const row = Math.floor(index / itemsPerRow);
                const col = index % itemsPerRow;
                const x = col * (gridSize + 16) + 16;
                const y = row * (gridSize + 64) + 16;

                if (isDesktopFolder(item)) {
                  return (
                    <div
                      key={item.id}
                      className={`folder-window-item folder-item ${selectedIds.has(item.id) ? 'selected' : ''}`}
                      data-item-id={item.id}
                      data-item-type="folder"
                      style={{
                        left: `${x}px`,
                        top: `${y}px`,
                        width: `${gridSize}px`,
                      }}
                      draggable={true}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-deskos-folder-id', item.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={(e) => handleItemClick(item, e)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                    >
                      <div
                        className="folder-window-item-icon"
                        style={{
                          width: `${settings.iconSize}px`,
                          height: `${settings.iconSize}px`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {hasIcon(item.icon as IconName) ? (
                          <Icon 
                            name={item.icon as IconName} 
                            size={settings.iconSize * ICON_GLYPH_SCALE}
                            color="var(--color-accent)"
                            fallback={typeof item.icon === 'string' && !hasIcon(item.icon as IconName) ? item.icon : undefined}
                          />
                        ) : (
                          <span style={{ fontSize: `${settings.iconSize * ICON_EMOJI_SCALE}px` }}>{item.icon}</span>
                        )}
                      </div>
                      {settings.showIconLabels && (
                        <div className="folder-window-item-label">{item.name}</div>
                      )}
                    </div>
                  );
                } else if (isDesktopShortcut(item)) {
                  const program = programs[item.programId];
                  if (!program) return null;
                  
                  return (
                    <div
                      key={item.id}
                      className={`folder-window-item shortcut-item ${selectedIds.has(item.id) ? 'selected' : ''}`}
                      data-item-id={item.id}
                      data-item-type="shortcut"
                      data-program-id={item.programId}
                      style={{
                        left: `${x}px`,
                        top: `${y}px`,
                        width: `${gridSize}px`,
                      }}
                      draggable={true}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-deskos-shortcut-id', item.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={(e) => handleItemClick(item, e)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                    >
                      <div
                        className="folder-window-item-icon"
                        style={{
                          width: `${settings.iconSize}px`,
                          height: `${settings.iconSize}px`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {hasIcon(program.metadata.icon as IconName) ? (
                          <Icon 
                            name={program.metadata.icon as IconName} 
                            size={settings.iconSize * ICON_GLYPH_SCALE}
                            fallback={typeof program.metadata.icon === 'string' && !hasIcon(program.metadata.icon as IconName) ? program.metadata.icon : undefined}
                          />
                        ) : (
                          <span style={{ fontSize: `${settings.iconSize * ICON_EMOJI_SCALE}px` }}>{program.metadata.icon}</span>
                        )}
                      </div>
                      {settings.showIconLabels && (
                        <div className="folder-window-item-label">
                          {item.customName || program.metadata.name}
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
