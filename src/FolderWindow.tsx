import { useState, useEffect, useCallback, useRef } from 'react';
import { useKernel, type FolderViewMode } from '@core/kernel';
import { ICON_EMOJI_SCALE, ICON_GLYPH_SCALE } from '@core/constants';
import {
  getSpecialLocationItems,
  resolvePath,
  parsePath,
  addRecentItem,
  SPECIAL_LOCATIONS,
} from '../file-system/file-system';
import {
  getDesktopFolders,
  getItemsByPath,
  type DesktopItem,
  isDesktopFolder,
  isDesktopShortcut,
  isImageItem,
  isVideoItem,
  getGridSize,
  addItemToFolder,
  getFolderByPath,
  DESKOS_ITEM_IDS_MIME,
  readDraggedItemIds,
} from '@core/desktop-shortcuts';
import { programs } from 'virtual:programs';
import { launchOrFocusProgram } from '@core/context';
import { FolderSidebar } from './FolderSidebar';
import { Icon } from '../components/Icon';
import { hasIcon, type IconName } from '@core/icons';
import { resolveProgramIcon } from '@core/program-icons';
import {
  registerSelectAllHandler,
  registerSelectionSource,
  getSelectionById,
  startMarqueeSelection,
  SELECTION_PRIORITY,
  SELECTION_SOURCE_IDS,
  type MarqueeRect,
} from '@core/selection';
import type { ProgramContext } from '@core/context';
import { useWindowSessionState } from '@core/window-session';
import {
  registerCopyHandler,
  registerCutHandler,
  registerPasteHandler,
  registerDeleteHandler,
  copy as clipboardCopy,
  cut as clipboardCut,
  getClipboard,
  clearClipboard,
  getCutItemIds,
  CLIPBOARD_PRIORITY,
  HandlerSkippedError,
  type ClipboardItem,
} from '@core/clipboard';
import { deleteDesktopItems } from '@core/delete-items';

/** Props for the folder browser window. */
interface FolderWindowProps {
  /** Program context when opened via the folder program */
  ctx?: ProgramContext;
  /** Absolute path to open (default `/Desktop`) */
  initialPath?: string;
  /** Open by folder id when path is unknown */
  folderId?: string;
}

/** File-browser window: sidebar, breadcrumbs, grid/list, and clipboard/DnD. */
export function FolderWindow({ ctx: _ctx, initialPath, folderId }: FolderWindowProps) {
  const settings = useKernel((state) => state.settings);
  const updateSettings = useKernel((state) => state.updateSettings);
  const viewMode: FolderViewMode = settings.folderViewMode === 'list' ? 'list' : 'grid';
  const [currentPath, setCurrentPath] = useWindowSessionState(
    'currentPath',
    () => initialPath || '/Desktop'
  );
  const [items, setItems] = useState<DesktopItem[]>([]);
  const [folderName, setFolderName] = useState<string>('Folder');
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [pathInput, setPathInput] = useWindowSessionState(
    'pathInput',
    () => initialPath || '/Desktop'
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cutIds, setCutIds] = useState<Set<string>>(() => getCutItemIds());
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const lastSelectedIndexRef = useRef<number>(-1);
  const contentRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const isInitialMount = useRef(true);
  const selectedIdsRef = useRef(selectedIds);
  const itemsRef = useRef(items);
  const currentPathRef = useRef(currentPath);
  const suppressClickClearRef = useRef(false);
  selectedIdsRef.current = selectedIds;
  itemsRef.current = items;
  currentPathRef.current = currentPath;

  useEffect(() => {
    const sync = () => setCutIds(getCutItemIds());
    sync();
    window.addEventListener('deskos-clipboard-updated', sync);
    return () => window.removeEventListener('deskos-clipboard-updated', sync);
  }, []);

  const loadItems = useCallback((path: string) => {
    const resolved = resolvePath(path);

    if (resolved.type === 'special') {
      const locationItems = getSpecialLocationItems(resolved.location!);
      setItems(locationItems);
      const locationInfo = Object.values(SPECIAL_LOCATIONS).find((loc) => loc.path === path);
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
      const folder = folders.find((f) => f.id === folderId);
      if (folder) {
        const path =
          folder.parentPath && folder.parentPath !== '/Desktop'
            ? `${folder.parentPath}/${folder.name}`
            : `/Desktop/${folder.name}`;
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
      loadItems(currentPath);
    };

    window.addEventListener('desktop-shortcuts-updated', handleShortcutsUpdated);
    return () => {
      window.removeEventListener('desktop-shortcuts-updated', handleShortcutsUpdated);
    };
  }, [currentPath, loadItems]);

  const handleNavigate = useCallback(
    (path: string) => {
      setCurrentPath(path);
      loadItems(path);
    },
    [loadItems]
  );

  const handleItemSelect = useCallback(
    (item: DesktopItem, e?: React.MouseEvent, forceSingle?: boolean) => {
      const isCtrlClick = !forceSingle && e && (e.ctrlKey || e.metaKey);
      const isShiftClick = !forceSingle && e && e.shiftKey;

      if (isShiftClick && lastSelectedIndexRef.current >= 0) {
        // Range selection
        const currentIndex = items.findIndex((i) => i.id === item.id);
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
        lastSelectedIndexRef.current = items.findIndex((i) => i.id === item.id);
      } else {
        // Single selection
        setSelectedIds(new Set([item.id]));
        lastSelectedIndexRef.current = items.findIndex((i) => i.id === item.id);
      }
    },
    [selectedIds, items]
  );

  const handleItemClick = useCallback(
    async (item: DesktopItem, e?: React.MouseEvent) => {
      // Handle selection on single click
      handleItemSelect(item, e);

      // Double click handling is separate
    },
    [handleItemSelect]
  );

  const handleItemDoubleClick = useCallback(
    async (item: DesktopItem) => {
      if (isDesktopFolder(item)) {
        const path = `${currentPath}/${item.name}`;
        handleNavigate(path);
      } else if (isDesktopShortcut(item)) {
        await launchOrFocusProgram(item.programId);
      } else if (isImageItem(item)) {
        // Double-click previews just this image, on its own.
        window.dispatchEvent(
          new CustomEvent('open-image', {
            detail: {
              images: [{ src: item.imageUrl, name: item.name }],
              startIndex: 0,
            },
          })
        );
      } else if (isVideoItem(item)) {
        // Double-click plays just this video, on its own.
        window.dispatchEvent(
          new CustomEvent('open-video', {
            detail: {
              videos: [{ src: item.videoUrl, name: item.name }],
              startIndex: 0,
            },
          })
        );
      }
    },
    [currentPath, handleNavigate]
  );

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

  const handleBreadcrumbClick = useCallback(
    (index: number) => {
      const pathParts = breadcrumbs.slice(0, index + 1);
      const newPath = '/' + pathParts.join('/');
      handleNavigate(newPath);
    },
    [breadcrumbs, handleNavigate]
  );

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

  const handlePathInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    },
    [pathInput, currentPath, handleNavigate]
  );

  const handlePathInputBlur = useCallback(() => {
    setIsEditingPath(false);
    setPathInput(currentPath);
  }, [currentPath]);

  const assertThisFolderWindowActive = useCallback(() => {
    const kernel = useKernel.getState();
    const hostWindow = contentRef.current?.closest('[data-window-id]');
    const thisWindowId = hostWindow?.getAttribute('data-window-id');
    if (!thisWindowId || kernel.activeWindowId !== thisWindowId) {
      throw new HandlerSkippedError();
    }
  }, []);

  // Select All handler
  const handleSelectAll = useCallback(() => {
    assertThisFolderWindowActive();
    const allItemIds = items.map((item) => item.id);
    setSelectedIds(new Set(allItemIds));
    if (allItemIds.length > 0) {
      lastSelectedIndexRef.current = allItemIds.length - 1;
    }
  }, [items, assertThisFolderWindowActive]);

  // Copy handler
  const handleCopy = useCallback(() => {
    assertThisFolderWindowActive();
    // If no selection in this folder window, check if there's desktop selection
    if (selectedIds.size === 0) {
      const desktopSelection = getSelectionById(SELECTION_SOURCE_IDS.DESKTOP) as
        { ids?: string[] } | undefined;
      if (desktopSelection?.ids && desktopSelection.ids.length > 0) {
        // There's desktop selection, let DesktopIcons handle it
        throw new HandlerSkippedError();
      }
      // No selection anywhere — let other handlers try
      throw new HandlerSkippedError();
    }

    const clipboardItems: ClipboardItem[] = [];
    selectedIds.forEach((id) => {
      const item = items.find((i) => i.id === id);
      if (item) {
        if (isDesktopShortcut(item)) {
          clipboardItems.push({ id: item.id, type: 'shortcut' });
        } else if (isDesktopFolder(item)) {
          clipboardItems.push({ id: item.id, type: 'folder' });
        } else if (isImageItem(item)) {
          clipboardItems.push({ id: item.id, type: 'image' });
        } else if (isVideoItem(item)) {
          clipboardItems.push({ id: item.id, type: 'video' });
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
  }, [selectedIds, items, currentPath, assertThisFolderWindowActive]);

  // Cut handler
  const handleCut = useCallback(() => {
    assertThisFolderWindowActive();
    // If no selection in this folder window, check if there's desktop selection
    if (selectedIds.size === 0) {
      const desktopSelection = getSelectionById(SELECTION_SOURCE_IDS.DESKTOP) as
        { ids?: string[] } | undefined;
      if (desktopSelection?.ids && desktopSelection.ids.length > 0) {
        // There's desktop selection, let DesktopIcons handle it
        throw new HandlerSkippedError();
      }
      // No selection anywhere — let other handlers try
      throw new HandlerSkippedError();
    }

    const clipboardItems: ClipboardItem[] = [];
    selectedIds.forEach((id) => {
      const item = items.find((i) => i.id === id);
      if (item) {
        if (isDesktopShortcut(item)) {
          clipboardItems.push({ id: item.id, type: 'shortcut' });
        } else if (isDesktopFolder(item)) {
          clipboardItems.push({ id: item.id, type: 'folder' });
        } else if (isImageItem(item)) {
          clipboardItems.push({ id: item.id, type: 'image' });
        } else if (isVideoItem(item)) {
          clipboardItems.push({ id: item.id, type: 'video' });
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
  }, [selectedIds, items, currentPath, assertThisFolderWindowActive]);

  // Delete handler — soft-delete into Trash
  const handleDelete = useCallback(() => {
    assertThisFolderWindowActive();
    if (selectedIds.size === 0) throw new HandlerSkippedError();
    void deleteDesktopItems(Array.from(selectedIds));
    setSelectedIds(new Set());
    lastSelectedIndexRef.current = -1;
    loadItems(currentPath);
  }, [selectedIds, currentPath, loadItems, assertThisFolderWindowActive]);

  // Paste handler
  const handlePaste = useCallback(async () => {
    console.log('[FolderWindow] Paste: Handler called');

    assertThisFolderWindowActive();

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

    const {
      getDesktopShortcuts,
      getDesktopFolders,
      getMediaById,
      copyDesktopMedia,
      removeItemFromFolder,
    } = await import('@core/desktop-shortcuts');
    const allShortcuts = getDesktopShortcuts();
    const allFolders = getDesktopFolders();

    try {
      if (clipboard.operation === 'copy') {
        console.log('[FolderWindow] Paste: Copying', clipboard.items.length, 'items to folder');
        // Copy items to current folder - create new items instead of moving
        const { addDesktopShortcut, createDesktopFolder } = await import('@core/desktop-shortcuts');

        for (const item of clipboard.items) {
          // Verify item exists
          const shortcut = allShortcuts.find((s) => s.id === item.id);
          const folder = allFolders.find((f) => f.id === item.id);
          const media =
            item.type === 'image' || item.type === 'video' ? getMediaById(item.id) : null;

          if (!shortcut && !folder && !media) {
            console.warn('[FolderWindow] Paste: Item not found', item.id);
            continue;
          }

          if (shortcut) {
            // Create a new shortcut with the same programId and customName
            console.log('[FolderWindow] Paste: Creating copy of shortcut', shortcut.id);
            const newShortcut = addDesktopShortcut(
              shortcut.programId,
              undefined,
              undefined,
              shortcut.customName
            );
            // Add the new shortcut to the folder
            addItemToFolder(currentFolder.id, newShortcut.id);
          } else if (folder) {
            // Create a new folder with the same name
            console.log('[FolderWindow] Paste: Creating copy of folder', folder.id);
            const newFolder = createDesktopFolder(
              folder.name,
              undefined,
              undefined,
              currentPath === '/Desktop' ? undefined : currentPath
            );

            // Add the new folder to the current folder
            console.log('[FolderWindow] Paste: Adding new folder to current folder', newFolder.id);
            addItemToFolder(currentFolder.id, newFolder.id);

            // Copy contents recursively
            const copyFolderContents = async (sourceFolderId: string, targetFolderId: string) => {
              // Get fresh data for each recursive call
              const {
                getDesktopFolders: getCurrentFolders,
                getDesktopShortcuts: getCurrentShortcuts,
                getDesktopMedia: getCurrentMedia,
                copyDesktopMedia: copyMedia,
              } = await import('@core/desktop-shortcuts');
              const currentFolders = getCurrentFolders();
              const currentShortcuts = getCurrentShortcuts();
              const currentMedia = getCurrentMedia();

              const sourceFolder = currentFolders.find((f) => f.id === sourceFolderId);
              if (!sourceFolder) return;

              const targetFolder = currentFolders.find((f) => f.id === targetFolderId);
              if (!targetFolder) return;

              for (const contentId of sourceFolder.contents) {
                const contentShortcut = currentShortcuts.find((s) => s.id === contentId);
                const contentFolder = currentFolders.find((f) => f.id === contentId);
                const contentMedia = currentMedia.find((m) => m.id === contentId);

                if (contentShortcut) {
                  // Copy shortcut
                  const newContentShortcut = addDesktopShortcut(
                    contentShortcut.programId,
                    undefined,
                    undefined,
                    contentShortcut.customName
                  );
                  addItemToFolder(targetFolderId, newContentShortcut.id);
                } else if (contentFolder) {
                  // Recursively copy folder
                  const targetFolderPath = targetFolder.parentPath
                    ? `${targetFolder.parentPath}/${targetFolder.name}`
                    : `/Desktop/${targetFolder.name}`;
                  const newContentFolder = createDesktopFolder(
                    contentFolder.name,
                    undefined,
                    undefined,
                    targetFolderPath === '/Desktop' ? undefined : targetFolderPath
                  );
                  addItemToFolder(targetFolderId, newContentFolder.id);
                  // Recursively copy its contents
                  await copyFolderContents(contentFolder.id, newContentFolder.id);
                } else if (contentMedia) {
                  const clone = copyMedia(contentMedia.id);
                  if (clone) addItemToFolder(targetFolderId, clone.id);
                }
              }
            };

            await copyFolderContents(folder.id, newFolder.id);
          } else if (media) {
            const clone = copyDesktopMedia(media.id);
            if (clone) addItemToFolder(currentFolder.id, clone.id);
          }
        }
      } else if (clipboard.operation === 'cut') {
        // Same folder: keep items where they are
        if (clipboard.type === 'folder-items' && clipboard.sourcePath === currentPath) {
          setSelectedIds(new Set());
          clearClipboard();
        } else {
          console.log('[FolderWindow] Paste: Moving', clipboard.items.length, 'items to folder');
          for (const item of clipboard.items) {
            const shortcut = allShortcuts.find((s) => s.id === item.id);
            const folder = allFolders.find((f) => f.id === item.id);
            const media =
              item.type === 'image' || item.type === 'video' ? getMediaById(item.id) : null;

            if (!shortcut && !folder && !media) {
              console.warn('[FolderWindow] Paste: Item not found for cut', item.id);
              continue;
            }

            if (clipboard.type === 'folder-items' && clipboard.sourcePath) {
              if (
                clipboard.sourcePath !== currentPath &&
                clipboard.sourcePath !== '/Images' &&
                clipboard.sourcePath !== '/Videos'
              ) {
                const sourceResolved = resolvePath(clipboard.sourcePath);
                if (sourceResolved.type === 'folder') {
                  const sourceFolder = getFolderByPath(clipboard.sourcePath);
                  if (sourceFolder) {
                    removeItemFromFolder(sourceFolder.id, item.id);
                  }
                }
              }
            } else if (clipboard.type === 'desktop-items') {
              allFolders.forEach((f) => {
                if (f.contents.includes(item.id)) {
                  removeItemFromFolder(f.id, item.id);
                }
              });
            }

            addItemToFolder(currentFolder.id, item.id);
          }
          setSelectedIds(new Set());
          clearClipboard();
        }
      }

      // Reload items to reflect changes
      loadItems(currentPath);
      window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
    } catch (error) {
      console.error('[FolderWindow] Error pasting items:', error);
    }
  }, [currentPath, loadItems, assertThisFolderWindowActive]);

  // Register keyboard shortcut handlers with higher priority than desktop
  useEffect(() => {
    const unregisterSelectAll = registerSelectAllHandler(
      handleSelectAll,
      SELECTION_PRIORITY.FOLDER_WINDOW
    );
    const unregisterCopy = registerCopyHandler(handleCopy, CLIPBOARD_PRIORITY.FOLDER_WINDOW);
    const unregisterCut = registerCutHandler(handleCut, CLIPBOARD_PRIORITY.FOLDER_WINDOW);
    const unregisterPaste = registerPasteHandler(handlePaste, CLIPBOARD_PRIORITY.FOLDER_WINDOW);
    const unregisterDelete = registerDeleteHandler(handleDelete, CLIPBOARD_PRIORITY.FOLDER_WINDOW);

    return () => {
      unregisterSelectAll();
      unregisterCopy();
      unregisterCut();
      unregisterPaste();
      unregisterDelete();
    };
  }, [handleSelectAll, handleCopy, handleCut, handlePaste, handleDelete]);

  // Publish selection for context menus / clipboard coordination
  useEffect(() => {
    const hostWindow = contentRef.current?.closest('[data-window-id]');
    const thisWindowId = hostWindow?.getAttribute('data-window-id');
    if (!thisWindowId) return;

    return registerSelectionSource({
      id: `${SELECTION_SOURCE_IDS.FOLDER_WINDOW}:${thisWindowId}`,
      priority: SELECTION_PRIORITY.FOLDER_WINDOW,
      isActive: () => {
        const kernel = useKernel.getState();
        const host = contentRef.current?.closest('[data-window-id]');
        const windowId = host?.getAttribute('data-window-id');
        return !!windowId && kernel.activeWindowId === windowId;
      },
      getSelection: () => {
        const ids = Array.from(selectedIdsRef.current);
        if (ids.length === 0) return null;
        return {
          type: 'folder-items',
          ids,
          path: currentPathRef.current,
          count: ids.length,
        };
      },
    });
  }, []);

  // Drag-to-select on empty grid + click to clear
  useEffect(() => {
    const contentElement = contentRef.current;
    const gridElement = gridRef.current;
    if (!contentElement || !gridElement) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('.folder-window-item')) return;
      if (!target.closest('.folder-window-grid')) return;

      const additive = e.ctrlKey || e.metaKey;
      startMarqueeSelection({
        container: gridElement,
        startClientX: e.clientX,
        startClientY: e.clientY,
        additive,
        baseSelection: new Set(selectedIdsRef.current),
        getElements: () => gridElement.querySelectorAll('.folder-window-item'),
        getId: (el) => el.getAttribute('data-item-id'),
        onRect: setMarquee,
        onSelection: (ids) => {
          setSelectedIds(ids);
          if (ids.size === 0) {
            lastSelectedIndexRef.current = -1;
            return;
          }
          let last = -1;
          const list = itemsRef.current;
          ids.forEach((id) => {
            const idx = list.findIndex((item) => item.id === id);
            if (idx > last) last = idx;
          });
          lastSelectedIndexRef.current = last;
        },
        onDragged: () => {
          suppressClickClearRef.current = true;
        },
      });
    };

    const handleContentClick = (e: MouseEvent) => {
      if (suppressClickClearRef.current) {
        suppressClickClearRef.current = false;
        return;
      }
      const target = e.target as HTMLElement;
      // Only deselect if clicking on the grid area, not on items
      if (
        target.classList.contains('folder-window-grid') ||
        target.closest('.folder-window-grid') === target
      ) {
        setSelectedIds(new Set());
        lastSelectedIndexRef.current = -1;
      }
    };

    contentElement.addEventListener('mousedown', handleMouseDown);
    contentElement.addEventListener('click', handleContentClick);
    return () => {
      contentElement.removeEventListener('mousedown', handleMouseDown);
      contentElement.removeEventListener('click', handleContentClick);
    };
  }, []);

  const draggedItemIdsRef = useRef<string[]>([]);

  const hasDeskosDragData = useCallback((dataTransfer: DataTransfer) => {
    const types = Array.from(dataTransfer.types);
    return types.some(
      (type) =>
        type === 'application/x-deskos-shortcut-id' ||
        type === 'application/x-deskos-folder-id' ||
        type === 'application/x-deskos-program-id' ||
        type === DESKOS_ITEM_IDS_MIME
    );
  }, []);

  const handleItemDragStart = useCallback(
    (item: DesktopItem, e: React.DragEvent) => {
      const ids =
        selectedIds.has(item.id) && selectedIds.size > 1 ? Array.from(selectedIds) : [item.id];
      draggedItemIdsRef.current = ids;
      e.dataTransfer.setData(DESKOS_ITEM_IDS_MIME, JSON.stringify(ids));
      if (isDesktopFolder(item)) {
        e.dataTransfer.setData('application/x-deskos-folder-id', item.id);
      } else if (isDesktopShortcut(item)) {
        e.dataTransfer.setData('application/x-deskos-shortcut-id', item.id);
      }
      e.dataTransfer.effectAllowed = 'move';
    },
    [selectedIds]
  );

  const handleItemDragEnd = useCallback(() => {
    draggedItemIdsRef.current = [];
    document.querySelectorAll('.folder-window-item.drag-over-target').forEach((el) => {
      el.classList.remove('drag-over-target');
    });
    contentRef.current?.classList.remove('drag-over');
  }, []);

  /** Drop onto a nested folder icon (move into that folder, not the open window). */
  const handleFolderItemDragOver = useCallback(
    (targetFolder: DesktopItem, e: React.DragEvent) => {
      if (!isDesktopFolder(targetFolder) || !hasDeskosDragData(e.dataTransfer)) return;
      if (draggedItemIdsRef.current.includes(targetFolder.id)) return;

      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      contentRef.current?.classList.remove('drag-over');
      e.currentTarget.classList.add('drag-over-target');
    },
    [hasDeskosDragData]
  );

  const handleFolderItemDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    e.currentTarget.classList.remove('drag-over-target');
  }, []);

  const handleFolderItemDrop = useCallback(
    (targetFolder: DesktopItem, e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.classList.remove('drag-over-target');
      contentRef.current?.classList.remove('drag-over');

      if (!isDesktopFolder(targetFolder)) return;

      const itemIds = readDraggedItemIds(e.dataTransfer);
      if (itemIds.length === 0) return;

      for (const itemId of itemIds) {
        if (itemId !== targetFolder.id) {
          addItemToFolder(targetFolder.id, itemId);
        }
      }
      draggedItemIdsRef.current = [];
      loadItems(currentPath);
      window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
    },
    [currentPath, loadItems]
  );

  // Handle drag and drop from desktop to folder window
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (hasDeskosDragData(e.dataTransfer)) {
        e.dataTransfer.dropEffect = 'move';
        if (contentRef.current) {
          contentRef.current.classList.add('drag-over');
        }
      }
    },
    [hasDeskosDragData]
  );

  // Handle mouse move to detect dragging over folder window (for custom drag system)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Check if any desktop icon is being dragged
      const draggingIcon = document.querySelector('.desktop-icon.dragging');
      if (draggingIcon && contentRef.current) {
        const rect = contentRef.current.getBoundingClientRect();
        const isOverWindow =
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;

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

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
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
      const itemIds = readDraggedItemIds(e.dataTransfer);
      const programId = e.dataTransfer.getData('application/x-deskos-program-id');

      try {
        if (itemIds.length > 0) {
          for (const itemId of itemIds) {
            if (itemId !== currentFolder.id) {
              addItemToFolder(currentFolder.id, itemId);
            }
          }
          loadItems(currentPath);
          window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
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
    },
    [currentPath, loadItems]
  );

  const gridSize = getGridSize();
  const listIconSize = 20;
  const isList = viewMode === 'list';

  const setViewMode = useCallback(
    (mode: FolderViewMode) => {
      updateSettings({ folderViewMode: mode });
    },
    [updateSettings]
  );

  // Real image thumbnail rendered in the same box as a regular item icon.
  const renderImageThumb = (url: string, name: string, size: number) => (
    <div
      className="folder-window-item-icon"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <img
        className="folder-window-item-thumb"
        src={url}
        alt={name}
        loading="lazy"
        draggable={false}
      />
    </div>
  );

  // First-frame video thumbnail (muted, metadata-only) in the same box as icons.
  const renderVideoThumb = (url: string, name: string, size: number) => (
    <div
      className="folder-window-item-icon"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <video
        className="folder-window-item-thumb"
        src={url}
        muted
        preload="metadata"
        playsInline
        draggable={false}
        aria-label={name}
      />
    </div>
  );

  const renderItemIcon = (icon: string, size: number, color?: string) => (
    <div
      className="folder-window-item-icon"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {hasIcon(icon as IconName) ? (
        <Icon
          name={icon as IconName}
          size={size * ICON_GLYPH_SCALE}
          color={color}
          fallback={typeof icon === 'string' && !hasIcon(icon as IconName) ? icon : undefined}
        />
      ) : (
        <span style={{ fontSize: `${size * ICON_EMOJI_SCALE}px` }}>{icon}</span>
      )}
    </div>
  );

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
        <div className="folder-window-view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={`folder-view-button ${viewMode === 'grid' ? 'active' : ''}`}
            aria-pressed={viewMode === 'grid'}
            title="Grid view"
            onClick={() => setViewMode('grid')}
          >
            <Icon name="view-grid" size={14} />
          </button>
          <button
            type="button"
            className={`folder-view-button ${viewMode === 'list' ? 'active' : ''}`}
            aria-pressed={viewMode === 'list'}
            title="List view"
            onClick={() => setViewMode('list')}
          >
            <Icon name="view-list" size={14} />
          </button>
        </div>
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
          <div className={`folder-window-grid view-${viewMode}`} ref={gridRef}>
            {marquee && (
              <div
                className="selection-marquee"
                style={{
                  left: `${marquee.left}px`,
                  top: `${marquee.top}px`,
                  width: `${marquee.width}px`,
                  height: `${marquee.height}px`,
                }}
              />
            )}
            {items.length === 0 ? (
              <div className="folder-window-empty">This folder is empty</div>
            ) : (
              items.map((item, index) => {
                const containerWidth = contentRef.current?.clientWidth || 800;
                const itemsPerRow = Math.max(
                  1,
                  Math.floor((containerWidth - 32) / (gridSize + 16))
                );
                const row = Math.floor(index / itemsPerRow);
                const col = index % itemsPerRow;
                const gridStyle = isList
                  ? undefined
                  : {
                      left: `${col * (gridSize + 16) + 16}px`,
                      top: `${row * (gridSize + 64) + 16}px`,
                      width: `${gridSize}px`,
                    };
                const iconSize = isList ? listIconSize : settings.iconSize;
                const selectedClass = selectedIds.has(item.id) ? 'selected' : '';
                const cutClass = cutIds.has(item.id) ? 'cut' : '';

                if (isDesktopFolder(item)) {
                  return (
                    <div
                      key={item.id}
                      className={`folder-window-item folder-item ${selectedClass} ${cutClass}`}
                      data-item-id={item.id}
                      data-item-type="folder"
                      style={gridStyle}
                      draggable={true}
                      onDragStart={(e) => handleItemDragStart(item, e)}
                      onDragEnd={handleItemDragEnd}
                      onDragOver={(e) => handleFolderItemDragOver(item, e)}
                      onDragLeave={handleFolderItemDragLeave}
                      onDrop={(e) => handleFolderItemDrop(item, e)}
                      onClick={(e) => handleItemClick(item, e)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                    >
                      {renderItemIcon(item.icon, iconSize, 'var(--color-accent)')}
                      {(isList || settings.showIconLabels) && (
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
                      className={`folder-window-item shortcut-item ${selectedClass} ${cutClass}`}
                      data-item-id={item.id}
                      data-item-type="shortcut"
                      data-program-id={item.programId}
                      style={gridStyle}
                      draggable={true}
                      onDragStart={(e) => handleItemDragStart(item, e)}
                      onDragEnd={handleItemDragEnd}
                      onClick={(e) => handleItemClick(item, e)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                    >
                      {renderItemIcon(
                        resolveProgramIcon(item.programId, program.metadata.icon),
                        iconSize
                      )}
                      {(isList || settings.showIconLabels) && (
                        <div className="folder-window-item-label">
                          {item.customName || program.metadata.name}
                        </div>
                      )}
                    </div>
                  );
                } else if (isImageItem(item)) {
                  return (
                    <div
                      key={item.id}
                      className={`folder-window-item image-item ${selectedClass} ${cutClass}`}
                      data-item-id={item.id}
                      data-item-type="image"
                      data-item-url={item.imageUrl}
                      data-item-name={item.name}
                      style={gridStyle}
                      draggable={true}
                      onDragStart={(e) => handleItemDragStart(item, e)}
                      onDragEnd={handleItemDragEnd}
                      onClick={(e) => handleItemClick(item, e)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                    >
                      {renderImageThumb(item.imageUrl, item.name, iconSize)}
                      {(isList || settings.showIconLabels) && (
                        <div className="folder-window-item-label">{item.name}</div>
                      )}
                    </div>
                  );
                } else if (isVideoItem(item)) {
                  return (
                    <div
                      key={item.id}
                      className={`folder-window-item video-item ${selectedClass} ${cutClass}`}
                      data-item-id={item.id}
                      data-item-type="video"
                      data-item-url={item.videoUrl}
                      data-item-name={item.name}
                      style={gridStyle}
                      draggable={true}
                      onDragStart={(e) => handleItemDragStart(item, e)}
                      onDragEnd={handleItemDragEnd}
                      onClick={(e) => handleItemClick(item, e)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                    >
                      {renderVideoThumb(item.videoUrl, item.name, iconSize)}
                      {(isList || settings.showIconLabels) && (
                        <div className="folder-window-item-label">{item.name}</div>
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
