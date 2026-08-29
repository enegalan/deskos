import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { programs } from 'virtual:programs';
import { launchOrFocusProgram } from '@core/context';
import { getMaxIconSize, useKernel } from '@core/kernel';
import { ICON_EMOJI_SCALE, ICON_GLYPH_SCALE } from '@core/constants';
import { Icon } from '../components/Icon';
import { hasIcon, type IconName } from '@core/icons';
import {
  registerSelectAllHandler,
  registerSelectionSource,
  startMarqueeSelection,
  SELECTION_PRIORITY,
  SELECTION_SOURCE_IDS,
  type MarqueeRect,
} from '@core/selection';
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
  HandlerSkippedError,
  type ClipboardItem,
} from '@core/clipboard';
import {
  getDesktopShortcuts,
  getDesktopFolders,
  getDesktopSurfaceMedia,
  getDesktopSurfaceFiles,
  updateDesktopShortcutPosition,
  getGridMetrics,
  isImageItem,
  isVideoItem,
  isAudioItem,
  getMediaUrl,
  updateFolderPosition,
  updateMediaPosition,
  updateFilePosition,
  type DesktopShortcut,
  type DesktopFolder,
  type DesktopMediaItem,
  type DesktopFileItem,
} from '@core/desktop-shortcuts';
import { openDesktopItem } from '@core/open-file';
import { deleteDesktopItems } from '@core/delete-items';
import { resolveProgramIcon } from '@core/program-icons';
import { useDesktopIconDrag, type DesktopDragGroup } from './useDesktopIconDrag';

/** True when a folder browser window is focused (desktop defers clipboard shortcuts to it). */
function isFolderWindowActive(): boolean {
  const { activeWindowId, windows } = useKernel.getState();
  if (!activeWindowId) return false;
  return windows.some((w) => w.id === activeWindowId && w.programId === 'folder');
}

/** Props for a single desktop shortcut icon. */
interface DesktopIconProps {
  shortcut: DesktopShortcut;
  program: {
    id: string;
    name: string;
    icon: string;
  };
  onUpdate: () => void;
  isSelected: boolean;
  isCut?: boolean;
  onSelect: (e?: React.MouseEvent, forceSingle?: boolean) => void;
  layoutTick: number;
  getDragIds: (id: string) => string[];
  getItemOrigin: (id: string) => { x: number; y: number };
  dragGroup: DesktopDragGroup | null;
  onDragGroupStart: (
    ids: string[],
    primaryId: string,
    origins: Record<string, { x: number; y: number }>
  ) => void;
  onDragGroupMove: (delta: { x: number; y: number }) => void;
  onDragGroupEnd: () => void;
  resolveItemPosition: (id: string, x: number, y: number) => void;
}

/** Single desktop shortcut icon (drag, select, launch). */
const DesktopIcon = memo(function DesktopIcon({
  shortcut,
  program,
  onUpdate,
  isSelected,
  isCut,
  onSelect,
  layoutTick,
  getDragIds,
  getItemOrigin,
  dragGroup,
  onDragGroupStart,
  onDragGroupMove,
  onDragGroupEnd,
  resolveItemPosition,
}: DesktopIconProps) {
  void layoutTick;
  const settings = useKernel((state) => state.settings);
  const lastClickTimeRef = useRef<number>(0);
  const clickTimeoutRef = useRef<number | null>(null);
  const {
    iconRef,
    isDragging,
    gridPosition,
    isOverFolderWindow,
    displayPosition,
    handleMouseDown,
    showDragging,
  } = useDesktopIconDrag({
    id: shortcut.id,
    x: shortcut.x,
    y: shortcut.y,
    getDragIds,
    getItemOrigin,
    dragGroup,
    onDragGroupStart,
    onDragGroupMove,
    onDragGroupEnd,
    resolveItemPosition,
    onSelect,
    onUpdate,
  });

  const handleLaunch = useCallback(async () => {
    await launchOrFocusProgram(shortcut.programId);
  }, [shortcut.programId]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return;

      const now = Date.now();
      const timeSinceLastClick = now - lastClickTimeRef.current;

      if (timeSinceLastClick < 300 && timeSinceLastClick > 0) {
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
          clickTimeoutRef.current = null;
        }
        handleLaunch();
        lastClickTimeRef.current = 0;
      } else {
        onSelect(e);
        lastClickTimeRef.current = now;
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
        }
        clickTimeoutRef.current = window.setTimeout(() => {
          clickTimeoutRef.current = null;
          lastClickTimeRef.current = 0;
        }, 300);
      }
    },
    [handleLaunch, onSelect, isDragging]
  );

  const displayName = shortcut.customName || program.name;
  const { cellWidth, cellHeight } = getGridMetrics();
  const iconSize = Math.min(
    settings.iconSize,
    getMaxIconSize(Math.min(cellWidth, cellHeight), settings.showIconLabels)
  );

  return (
    <>
      {isDragging && gridPosition && !isOverFolderWindow && (
        <div
          className="desktop-icon-grid-indicator"
          style={{
            left: `${gridPosition.x}px`,
            top: `${gridPosition.y}px`,
            width: `${cellWidth}px`,
            height: `${cellHeight}px`,
          }}
        />
      )}
      <div
        ref={iconRef}
        className={`desktop-icon ${showDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''} ${isCut ? 'cut' : ''}`}
        style={{
          left: `${displayPosition.x}px`,
          top: `${displayPosition.y}px`,
          width: `${cellWidth}px`,
          height: `${cellHeight}px`,
          transition: showDragging ? 'none' : 'left 0.2s ease-out, top 0.2s ease-out',
        }}
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          e.stopPropagation();
          handleClick(e);
        }}
        data-program-id={shortcut.programId}
        data-shortcut-id={shortcut.id}
      >
        <div
          className="desktop-icon-image"
          style={{
            width: `${iconSize}px`,
            height: `${iconSize}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {hasIcon(program.icon as IconName) ? (
            <Icon
              name={program.icon as IconName}
              size={iconSize * ICON_GLYPH_SCALE}
              color="currentColor"
              fallback={
                typeof program.icon === 'string' && !hasIcon(program.icon as IconName)
                  ? program.icon
                  : undefined
              }
            />
          ) : (
            <span style={{ fontSize: `${iconSize * ICON_EMOJI_SCALE}px` }}>{program.icon}</span>
          )}
        </div>
        {settings.showIconLabels && <div className="desktop-icon-label">{displayName}</div>}
      </div>
    </>
  );
});

/** Props for a single desktop folder icon. */
interface FolderIconProps {
  folder: DesktopFolder;
  onUpdate: () => void;
  onOpen: (folderId: string) => void;
  isSelected: boolean;
  isCut?: boolean;
  onSelect: (e?: React.MouseEvent, forceSingle?: boolean) => void;
  layoutTick: number;
  getDragIds: (id: string) => string[];
  getItemOrigin: (id: string) => { x: number; y: number };
  dragGroup: DesktopDragGroup | null;
  onDragGroupStart: (
    ids: string[],
    primaryId: string,
    origins: Record<string, { x: number; y: number }>
  ) => void;
  onDragGroupMove: (delta: { x: number; y: number }) => void;
  onDragGroupEnd: () => void;
  resolveItemPosition: (id: string, x: number, y: number) => void;
}

/** Single desktop folder icon (drag, select, open). */
const FolderIcon = memo(function FolderIcon({
  folder,
  onUpdate,
  onOpen,
  isSelected,
  isCut,
  onSelect,
  layoutTick,
  getDragIds,
  getItemOrigin,
  dragGroup,
  onDragGroupStart,
  onDragGroupMove,
  onDragGroupEnd,
  resolveItemPosition,
}: FolderIconProps) {
  void layoutTick;
  const settings = useKernel((state) => state.settings);
  const lastClickTimeRef = useRef<number>(0);
  const clickTimeoutRef = useRef<number | null>(null);
  const {
    iconRef,
    isDragging,
    gridPosition,
    isOverFolderWindow,
    displayPosition,
    handleMouseDown,
    showDragging,
  } = useDesktopIconDrag({
    id: folder.id,
    x: folder.x,
    y: folder.y,
    getDragIds,
    getItemOrigin,
    dragGroup,
    onDragGroupStart,
    onDragGroupMove,
    onDragGroupEnd,
    resolveItemPosition,
    onSelect,
    onUpdate,
  });

  const handleOpen = useCallback(() => {
    onOpen(folder.id);
  }, [folder.id, onOpen]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return;

      const now = Date.now();
      const timeSinceLastClick = now - lastClickTimeRef.current;

      if (timeSinceLastClick < 300 && timeSinceLastClick > 0) {
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
          clickTimeoutRef.current = null;
        }
        handleOpen();
        lastClickTimeRef.current = 0;
      } else {
        onSelect(e);
        lastClickTimeRef.current = now;
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
        }
        clickTimeoutRef.current = window.setTimeout(() => {
          clickTimeoutRef.current = null;
          lastClickTimeRef.current = 0;
        }, 300);
      }
    },
    [handleOpen, onSelect, isDragging]
  );

  const { cellWidth, cellHeight } = getGridMetrics();
  const iconSize = Math.min(
    settings.iconSize,
    getMaxIconSize(Math.min(cellWidth, cellHeight), settings.showIconLabels)
  );

  return (
    <>
      {isDragging && gridPosition && !isOverFolderWindow && (
        <div
          className="desktop-icon-grid-indicator"
          style={{
            left: `${gridPosition.x}px`,
            top: `${gridPosition.y}px`,
            width: `${cellWidth}px`,
            height: `${cellHeight}px`,
          }}
        />
      )}
      <div
        ref={iconRef}
        className={`desktop-icon folder-icon ${showDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''} ${isCut ? 'cut' : ''}`}
        style={{
          left: `${displayPosition.x}px`,
          top: `${displayPosition.y}px`,
          width: `${cellWidth}px`,
          height: `${cellHeight}px`,
          transition: showDragging ? 'none' : 'left 0.2s ease-out, top 0.2s ease-out',
        }}
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          e.stopPropagation();
          handleClick(e);
        }}
        data-folder-id={folder.id}
      >
        <div
          className="desktop-icon-image"
          style={{
            width: `${iconSize}px`,
            height: `${iconSize}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {hasIcon(folder.icon as IconName) ? (
            <Icon
              name={folder.icon as IconName}
              size={iconSize * ICON_GLYPH_SCALE}
              color="var(--color-accent)"
              fallback={
                typeof folder.icon === 'string' && !hasIcon(folder.icon as IconName)
                  ? folder.icon
                  : undefined
              }
            />
          ) : (
            <span style={{ fontSize: `${iconSize * ICON_EMOJI_SCALE}px` }}>{folder.icon}</span>
          )}
        </div>
        {settings.showIconLabels && <div className="desktop-icon-label">{folder.name}</div>}
      </div>
    </>
  );
});

/** Desktop media icon — same drag / transition behavior as folder & app icons. */
const DesktopMediaIcon = memo(function DesktopMediaIcon({
  media,
  onUpdate,
  isSelected,
  isCut,
  onSelect,
  layoutTick,
  getDragIds,
  getItemOrigin,
  dragGroup,
  onDragGroupStart,
  onDragGroupMove,
  onDragGroupEnd,
  resolveItemPosition,
}: {
  media: DesktopMediaItem;
  onUpdate: () => void;
  isSelected: boolean;
  isCut?: boolean;
  onSelect: (e?: React.MouseEvent, forceSingle?: boolean) => void;
  layoutTick: number;
  getDragIds: (id: string) => string[];
  getItemOrigin: (id: string) => { x: number; y: number };
  dragGroup: DesktopDragGroup | null;
  onDragGroupStart: (
    ids: string[],
    primaryId: string,
    origins: Record<string, { x: number; y: number }>
  ) => void;
  onDragGroupMove: (delta: { x: number; y: number }) => void;
  onDragGroupEnd: () => void;
  resolveItemPosition: (id: string, x: number, y: number) => void;
}) {
  void layoutTick;
  const settings = useKernel((state) => state.settings);
  const url = getMediaUrl(media);
  const lastClickTimeRef = useRef(0);
  const clickTimeoutRef = useRef<number | null>(null);
  const {
    iconRef,
    isDragging,
    gridPosition,
    isOverFolderWindow,
    displayPosition,
    handleMouseDown,
    showDragging,
  } = useDesktopIconDrag({
    id: media.id,
    x: media.x,
    y: media.y,
    getDragIds,
    getItemOrigin,
    dragGroup,
    onDragGroupStart,
    onDragGroupMove,
    onDragGroupEnd,
    resolveItemPosition,
    onSelect,
    onUpdate,
  });

  const openMedia = useCallback(() => {
    void openDesktopItem(media);
  }, [media]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return;

      const now = Date.now();
      const timeSinceLastClick = now - lastClickTimeRef.current;

      if (timeSinceLastClick < 300 && timeSinceLastClick > 0) {
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
          clickTimeoutRef.current = null;
        }
        openMedia();
        lastClickTimeRef.current = 0;
      } else {
        onSelect(e);
        lastClickTimeRef.current = now;
        if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = window.setTimeout(() => {
          clickTimeoutRef.current = null;
          lastClickTimeRef.current = 0;
        }, 300);
      }
    },
    [openMedia, onSelect, isDragging]
  );

  const { cellWidth, cellHeight } = getGridMetrics();
  const iconSize = Math.min(
    settings.iconSize,
    getMaxIconSize(Math.min(cellWidth, cellHeight), settings.showIconLabels)
  );

  return (
    <>
      {isDragging && gridPosition && !isOverFolderWindow && (
        <div
          className="desktop-icon-grid-indicator"
          style={{
            left: `${gridPosition.x}px`,
            top: `${gridPosition.y}px`,
            width: `${cellWidth}px`,
            height: `${cellHeight}px`,
          }}
        />
      )}
      <div
        ref={iconRef}
        className={`desktop-icon ${showDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''} ${isCut ? 'cut' : ''}`}
        style={{
          left: `${displayPosition.x}px`,
          top: `${displayPosition.y}px`,
          width: `${cellWidth}px`,
          height: `${cellHeight}px`,
          transition: showDragging ? 'none' : 'left 0.2s ease-out, top 0.2s ease-out',
        }}
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          e.stopPropagation();
          handleClick(e);
        }}
        data-media-id={media.id}
      >
        <div
          className="desktop-icon-image"
          style={{
            width: `${iconSize}px`,
            height: `${iconSize}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isImageItem(media) ? (
            <img className="desktop-media-thumb" src={url} alt={media.name} draggable={false} />
          ) : isVideoItem(media) ? (
            <video
              className="desktop-media-thumb"
              src={url}
              muted
              preload="metadata"
              playsInline
              draggable={false}
            />
          ) : (
            <Icon name="music" size={iconSize * ICON_GLYPH_SCALE} />
          )}
        </div>
        {settings.showIconLabels && <div className="desktop-icon-label">{media.name}</div>}
      </div>
    </>
  );
});

/** Desktop icon for a user-created file. */
const DesktopFileIcon = memo(function DesktopFileIcon({
  file,
  onUpdate,
  isSelected,
  isCut,
  onSelect,
  layoutTick,
  getDragIds,
  getItemOrigin,
  dragGroup,
  onDragGroupStart,
  onDragGroupMove,
  onDragGroupEnd,
  resolveItemPosition,
}: {
  file: DesktopFileItem;
  onUpdate: () => void;
  isSelected: boolean;
  isCut?: boolean;
  onSelect: (e?: React.MouseEvent, forceSingle?: boolean) => void;
  layoutTick: number;
  getDragIds: (id: string) => string[];
  getItemOrigin: (id: string) => { x: number; y: number };
  dragGroup: DesktopDragGroup | null;
  onDragGroupStart: (
    ids: string[],
    primaryId: string,
    origins: Record<string, { x: number; y: number }>
  ) => void;
  onDragGroupMove: (delta: { x: number; y: number }) => void;
  onDragGroupEnd: () => void;
  resolveItemPosition: (id: string, x: number, y: number) => void;
}) {
  void layoutTick;
  const settings = useKernel((state) => state.settings);
  const lastClickTimeRef = useRef(0);
  const clickTimeoutRef = useRef<number | null>(null);
  const {
    iconRef,
    isDragging,
    gridPosition,
    isOverFolderWindow,
    displayPosition,
    handleMouseDown,
    showDragging,
  } = useDesktopIconDrag({
    id: file.id,
    x: file.x,
    y: file.y,
    getDragIds,
    getItemOrigin,
    dragGroup,
    onDragGroupStart,
    onDragGroupMove,
    onDragGroupEnd,
    resolveItemPosition,
    onSelect,
    onUpdate,
  });

  const openFile = useCallback(() => {
    void openDesktopItem(file);
  }, [file]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return;

      const now = Date.now();
      const timeSinceLastClick = now - lastClickTimeRef.current;

      if (timeSinceLastClick < 300 && timeSinceLastClick > 0) {
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
          clickTimeoutRef.current = null;
        }
        openFile();
        lastClickTimeRef.current = 0;
      } else {
        onSelect(e);
        lastClickTimeRef.current = now;
        if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = window.setTimeout(() => {
          clickTimeoutRef.current = null;
          lastClickTimeRef.current = 0;
        }, 300);
      }
    },
    [openFile, onSelect, isDragging]
  );

  const { cellWidth, cellHeight } = getGridMetrics();
  const iconSize = Math.min(
    settings.iconSize,
    getMaxIconSize(Math.min(cellWidth, cellHeight), settings.showIconLabels)
  );

  return (
    <>
      {isDragging && gridPosition && !isOverFolderWindow && (
        <div
          className="desktop-icon-grid-indicator"
          style={{
            left: `${gridPosition.x}px`,
            top: `${gridPosition.y}px`,
            width: `${cellWidth}px`,
            height: `${cellHeight}px`,
          }}
        />
      )}
      <div
        ref={iconRef}
        className={`desktop-icon ${showDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''} ${isCut ? 'cut' : ''}`}
        style={{
          left: `${displayPosition.x}px`,
          top: `${displayPosition.y}px`,
          width: `${cellWidth}px`,
          height: `${cellHeight}px`,
          transition: showDragging ? 'none' : 'left 0.2s ease-out, top 0.2s ease-out',
        }}
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          e.stopPropagation();
          handleClick(e);
        }}
        data-file-id={file.id}
      >
        <div
          className="desktop-icon-image"
          style={{
            width: `${iconSize}px`,
            height: `${iconSize}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="file" size={iconSize * ICON_GLYPH_SCALE} />
        </div>
        {settings.showIconLabels && <div className="desktop-icon-label">{file.name}</div>}
      </div>
    </>
  );
});

/** Renders desktop shortcuts and folders with selection, drag, and clipboard support. */
export function DesktopIcons() {
  const [shortcuts, setShortcuts] = useState<DesktopShortcut[]>([]);
  const [folders, setFolders] = useState<DesktopFolder[]>([]);
  const [mediaItems, setMediaItems] = useState<DesktopMediaItem[]>([]);
  const [fileItems, setFileItems] = useState<DesktopFileItem[]>([]);
  const [programData, setProgramData] = useState<
    Record<string, { id: string; name: string; icon: string }>
  >({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const [dragGroup, setDragGroup] = useState<DesktopDragGroup | null>(null);
  const [cutIds, setCutIds] = useState<Set<string>>(() => getCutItemIds());
  const [layoutTick, setLayoutTick] = useState(0);
  const lastSelectedIndexRef = useRef<number>(-1);
  const selectedIdsRef = useRef(selectedIds);
  const shortcutsRef = useRef(shortcuts);
  const foldersRef = useRef(folders);
  const mediaRef = useRef(mediaItems);
  const filesRef = useRef(fileItems);
  const suppressClickClearRef = useRef(false);
  selectedIdsRef.current = selectedIds;

  useEffect(() => {
    shortcutsRef.current = shortcuts;
    foldersRef.current = folders;
    mediaRef.current = mediaItems;
    filesRef.current = fileItems;
  }, [shortcuts, folders, mediaItems, fileItems]);

  const loadItems = useCallback(() => {
    const allFolders = getDesktopFolders();
    const loadedFolders = allFolders.filter((f) => !f.parentPath || f.parentPath === '/Desktop');

    // Get all item IDs that are inside folders
    const itemsInFolders = new Set<string>();
    allFolders.forEach((folder) => {
      folder.contents.forEach((itemId) => {
        itemsInFolders.add(itemId);
      });
    });

    // Filter shortcuts to only show those not inside folders
    const allShortcuts = getDesktopShortcuts();
    const loadedShortcuts = allShortcuts.filter((s) => !itemsInFolders.has(s.id));

    setShortcuts(loadedShortcuts);
    setFolders(loadedFolders);
    setMediaItems(getDesktopSurfaceMedia());
    setFileItems(getDesktopSurfaceFiles());

    // Load program metadata for each shortcut
    const data: Record<string, { id: string; name: string; icon: string }> = {};
    loadedShortcuts.forEach((shortcut) => {
      const program = programs[shortcut.programId];
      if (program) {
        data[shortcut.id] = {
          id: shortcut.programId,
          name: program.metadata.name,
          icon: resolveProgramIcon(shortcut.programId, program.metadata.icon),
        };
      }
    });
    setProgramData(data);
  }, []);

  // Memoize program data lookup
  const programDataMemo = useMemo(() => programData, [programData]);

  useEffect(() => {
    loadItems();
    import('@core/desktop-shortcuts').then(({ clampAllIconsToDesktop }) => {
      clampAllIconsToDesktop();
    });

    const handleStorageChange = () => {
      loadItems();
    };

    window.addEventListener('storage', handleStorageChange);

    const handleShortcutUpdate = () => {
      loadItems();
    };

    window.addEventListener('desktop-shortcuts-updated', handleShortcutUpdate);
    window.addEventListener('program-icon-updated', handleShortcutUpdate);

    const handleResize = () => {
      setLayoutTick((n) => n + 1);
      import('@core/desktop-shortcuts').then(({ clampAllIconsToDesktop }) => {
        clampAllIconsToDesktop();
      });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('desktop-shortcuts-updated', handleShortcutUpdate);
      window.removeEventListener('program-icon-updated', handleShortcutUpdate);
      window.removeEventListener('resize', handleResize);
    };
  }, [loadItems]);

  const handleUpdate = useCallback(() => {
    loadItems();
  }, [loadItems]);

  const handleOpenFolder = useCallback((folderId: string) => {
    // This will be implemented when FolderWindow is created
    // For now, just dispatch an event
    window.dispatchEvent(new CustomEvent('open-folder', { detail: { folderId } }));
  }, []);

  const getDragIds = useCallback(
    (id: string) => {
      if (selectedIds.has(id) && selectedIds.size > 1) {
        return Array.from(selectedIds);
      }
      return [id];
    },
    [selectedIds]
  );

  const getItemOrigin = useCallback((id: string) => {
    const shortcut = shortcutsRef.current.find((s) => s.id === id);
    if (shortcut) return { x: shortcut.x, y: shortcut.y };
    const folder = foldersRef.current.find((f) => f.id === id);
    if (folder) return { x: folder.x, y: folder.y };
    const media = mediaRef.current.find((m) => m.id === id);
    if (media) return { x: media.x, y: media.y };
    const file = filesRef.current.find((f) => f.id === id);
    if (file) return { x: file.x, y: file.y };
    return { x: 0, y: 0 };
  }, []);

  const handleDragGroupStart = useCallback(
    (ids: string[], primaryId: string, origins: Record<string, { x: number; y: number }>) => {
      setDragGroup({ ids, primaryId, origins, delta: { x: 0, y: 0 } });
    },
    []
  );

  const handleDragGroupMove = useCallback((delta: { x: number; y: number }) => {
    setDragGroup((prev) => (prev ? { ...prev, delta } : prev));
  }, []);

  const handleDragGroupEnd = useCallback(() => {
    setDragGroup(null);
  }, []);

  const resolveItemPosition = useCallback((id: string, x: number, y: number) => {
    if (shortcutsRef.current.some((s) => s.id === id)) {
      updateDesktopShortcutPosition(id, x, y);
      return;
    }
    if (foldersRef.current.some((f) => f.id === id)) {
      updateFolderPosition(id, x, y);
      return;
    }
    if (mediaRef.current.some((m) => m.id === id)) {
      updateMediaPosition(id, x, y);
      return;
    }
    if (filesRef.current.some((f) => f.id === id)) {
      updateFilePosition(id, x, y);
    }
  }, []);

  // Publish selection for context menus / clipboard coordination
  useEffect(() => {
    return registerSelectionSource({
      id: SELECTION_SOURCE_IDS.DESKTOP,
      priority: SELECTION_PRIORITY.DESKTOP,
      isActive: () => !useKernel.getState().activeWindowId,
      getSelection: () => {
        const ids = selectedIdsRef.current;
        if (ids.size === 0) return null;
        return {
          type: 'desktop-icons',
          ids: Array.from(ids),
          count: ids.size,
        };
      },
    });
  }, []);

  // Drag-to-select on empty desktop + click to clear
  useEffect(() => {
    const desktopElement = document.querySelector('.desktop') as HTMLElement | null;
    if (!desktopElement) return;

    const handleDesktopMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Windows sit inside .desktop; do not steal focus from them.
      if (target.closest('.window, .taskbar, .dock, .context-menu')) return;

      useKernel.getState().clearWindowFocus();

      if (e.button !== 0) return;
      if (!target.classList.contains('desktop')) return;

      const additive = e.ctrlKey || e.metaKey;
      startMarqueeSelection({
        container: desktopElement,
        startClientX: e.clientX,
        startClientY: e.clientY,
        additive,
        baseSelection: new Set(selectedIdsRef.current),
        getElements: () => document.querySelectorAll('.desktop-icon'),
        getId: (el) =>
          el.getAttribute('data-shortcut-id') ||
          el.getAttribute('data-folder-id') ||
          el.getAttribute('data-media-id') ||
          el.getAttribute('data-file-id'),
        onRect: setMarquee,
        onSelection: (ids) => {
          setSelectedIds(ids);
          if (ids.size === 0) {
            lastSelectedIndexRef.current = -1;
            return;
          }
          const allItems = [
            ...shortcutsRef.current.map((s) => s.id),
            ...foldersRef.current.map((f) => f.id),
            ...mediaRef.current.map((m) => m.id),
            ...filesRef.current.map((f) => f.id),
          ];
          let last = -1;
          ids.forEach((id) => {
            const idx = allItems.indexOf(id);
            if (idx > last) last = idx;
          });
          lastSelectedIndexRef.current = last;
        },
        onDragged: () => {
          suppressClickClearRef.current = true;
        },
      });
    };

    const handleDesktopClick = (e: Event) => {
      if (suppressClickClearRef.current) {
        suppressClickClearRef.current = false;
        return;
      }
      const target = e.target as HTMLElement;
      if (target.classList.contains('desktop')) {
        setSelectedIds(new Set());
        lastSelectedIndexRef.current = -1;
      }
    };

    desktopElement.addEventListener('mousedown', handleDesktopMouseDown);
    desktopElement.addEventListener('click', handleDesktopClick);
    return () => {
      desktopElement.removeEventListener('mousedown', handleDesktopMouseDown);
      desktopElement.removeEventListener('click', handleDesktopClick);
    };
  }, []);

  const handleIconSelect = useCallback(
    (id: string, e?: React.MouseEvent, forceSingle?: boolean) => {
      useKernel.getState().clearWindowFocus();

      const isCtrlClick = !forceSingle && e && (e.ctrlKey || e.metaKey);
      const isShiftClick = !forceSingle && e && e.shiftKey;

      if (isShiftClick && lastSelectedIndexRef.current >= 0) {
        // Range selection
        const allItems = [
          ...shortcuts.map((s, i) => ({ id: s.id, index: i })),
          ...folders.map((f, i) => ({ id: f.id, index: shortcuts.length + i })),
          ...mediaItems.map((m, i) => ({
            id: m.id,
            index: shortcuts.length + folders.length + i,
          })),
          ...fileItems.map((f, i) => ({
            id: f.id,
            index: shortcuts.length + folders.length + mediaItems.length + i,
          })),
        ];

        const currentIndex = allItems.findIndex((item) => item.id === id);
        if (currentIndex >= 0) {
          const start = Math.min(lastSelectedIndexRef.current, currentIndex);
          const end = Math.max(lastSelectedIndexRef.current, currentIndex);
          const newSelection = new Set(selectedIds);
          for (let i = start; i <= end; i++) {
            newSelection.add(allItems[i].id);
          }
          setSelectedIds(newSelection);
        }
      } else if (isCtrlClick) {
        // Toggle selection
        const newSelection = new Set(selectedIds);
        if (newSelection.has(id)) {
          newSelection.delete(id);
        } else {
          newSelection.add(id);
        }
        setSelectedIds(newSelection);
        const allItems = [
          ...shortcuts.map((s) => s.id),
          ...folders.map((f) => f.id),
          ...mediaItems.map((m) => m.id),
          ...fileItems.map((f) => f.id),
        ];
        lastSelectedIndexRef.current = allItems.findIndex((itemId) => itemId === id);
      } else {
        // Single selection
        setSelectedIds(new Set([id]));
        const allItems = [
          ...shortcuts.map((s) => s.id),
          ...folders.map((f) => f.id),
          ...mediaItems.map((m) => m.id),
          ...fileItems.map((f) => f.id),
        ];
        lastSelectedIndexRef.current = allItems.findIndex((itemId) => itemId === id);
      }
    },
    [selectedIds, shortcuts, folders, mediaItems, fileItems]
  );

  // Select All handler
  const handleSelectAll = useCallback(() => {
    if (isFolderWindowActive()) {
      throw new HandlerSkippedError();
    }
    const allItemIds = [
      ...shortcuts.map((s) => s.id),
      ...folders.map((f) => f.id),
      ...mediaItems.map((m) => m.id),
      ...fileItems.map((f) => f.id),
    ];
    setSelectedIds(new Set(allItemIds));
    if (allItemIds.length > 0) {
      lastSelectedIndexRef.current = allItemIds.length - 1;
    }
  }, [shortcuts, folders, mediaItems, fileItems]);

  // Copy handler
  const handleCopy = useCallback(() => {
    if (selectedIds.size === 0) {
      throw new HandlerSkippedError();
    }

    const items: ClipboardItem[] = [];
    selectedIds.forEach((id) => {
      const shortcut = shortcuts.find((s) => s.id === id);
      const folder = folders.find((f) => f.id === id);
      const media = mediaItems.find((m) => m.id === id);
      const file = fileItems.find((f) => f.id === id);
      if (shortcut) {
        items.push({ id: shortcut.id, type: 'shortcut' });
      } else if (folder) {
        items.push({ id: folder.id, type: 'folder' });
      } else if (media && isImageItem(media)) {
        items.push({ id: media.id, type: 'image' });
      } else if (media && isVideoItem(media)) {
        items.push({ id: media.id, type: 'video' });
      } else if (media && isAudioItem(media)) {
        items.push({ id: media.id, type: 'audio' });
      } else if (file) {
        items.push({ id: file.id, type: 'file' });
      }
    });

    if (items.length > 0) {
      clipboardCopy({
        type: 'desktop-items',
        items,
        operation: 'copy',
      });
    }
  }, [selectedIds, shortcuts, folders, mediaItems, fileItems]);

  // Cut handler
  const handleCut = useCallback(() => {
    if (selectedIds.size === 0) {
      throw new HandlerSkippedError();
    }

    const items: ClipboardItem[] = [];
    selectedIds.forEach((id) => {
      const shortcut = shortcuts.find((s) => s.id === id);
      const folder = folders.find((f) => f.id === id);
      const media = mediaItems.find((m) => m.id === id);
      const file = fileItems.find((f) => f.id === id);
      if (shortcut) {
        items.push({ id: shortcut.id, type: 'shortcut' });
      } else if (folder) {
        items.push({ id: folder.id, type: 'folder' });
      } else if (media && isImageItem(media)) {
        items.push({ id: media.id, type: 'image' });
      } else if (media && isVideoItem(media)) {
        items.push({ id: media.id, type: 'video' });
      } else if (media && isAudioItem(media)) {
        items.push({ id: media.id, type: 'audio' });
      } else if (file) {
        items.push({ id: file.id, type: 'file' });
      }
    });

    if (items.length > 0) {
      clipboardCut({
        type: 'desktop-items',
        items,
        operation: 'cut',
      });
    }
  }, [selectedIds, shortcuts, folders, mediaItems, fileItems]);

  // Delete handler — soft-delete into Trash
  const handleDelete = useCallback(() => {
    if (selectedIds.size === 0) {
      throw new HandlerSkippedError();
    }

    void deleteDesktopItems(Array.from(selectedIds));
    setSelectedIds(new Set());
    lastSelectedIndexRef.current = -1;
    loadItems();
  }, [selectedIds, loadItems]);

  // Paste handler
  const handlePaste = useCallback(async () => {
    if (isFolderWindowActive()) {
      throw new HandlerSkippedError();
    }
    const clipboard = getClipboard();
    if (!clipboard || clipboard.items.length === 0) {
      return;
    }

    if (clipboard.type !== 'desktop-items' && clipboard.type !== 'folder-items') {
      return;
    }

    const {
      addDesktopShortcut,
      getDesktopShortcuts,
      getDesktopFolders,
      getDesktopSurfaceMedia,
      getDesktopSurfaceFiles,
      findNextAvailablePosition,
      createDesktopFolder,
      getFolderById,
      removeItemFromFolder: removeFromFolder,
      getFolderByPath: folderByPath,
      updateFolderPosition: setFolderPos,
      copyDesktopMedia: copyMedia,
      copyDesktopFile: copyFile,
      placeMediaOnDesktop: placeMedia,
      placeFileOnDesktop: placeFile,
      getMediaById,
      getFileById,
    } = await import('@core/desktop-shortcuts');
    const allShortcuts = getDesktopShortcuts();

    const occupied = () =>
      [
        ...getDesktopShortcuts(),
        ...getDesktopFolders(),
        ...getDesktopSurfaceMedia(),
        ...getDesktopSurfaceFiles(),
      ].map((i) => ({
        x: i.x,
        y: i.y,
      }));

    try {
      if (clipboard.operation === 'copy') {
        for (const item of clipboard.items) {
          if (item.type === 'shortcut') {
            const shortcut = allShortcuts.find((s) => s.id === item.id);
            if (shortcut) {
              const position = findNextAvailablePosition(occupied());
              addDesktopShortcut(shortcut.programId, position.x, position.y, shortcut.customName);
            }
          } else if (item.type === 'folder') {
            const folder = getFolderById(item.id);
            if (folder) {
              const position = findNextAvailablePosition(occupied());
              createDesktopFolder(folder.name, position.x, position.y);
            }
          } else if (item.type === 'image' || item.type === 'video' || item.type === 'audio') {
            const position = findNextAvailablePosition(occupied());
            copyMedia(item.id, position.x, position.y);
          } else if (item.type === 'file') {
            const position = findNextAvailablePosition(occupied());
            copyFile(item.id, position.x, position.y);
          }
        }
      } else if (clipboard.operation === 'cut') {
        // Same surface: keep positions, only clear cut state
        if (clipboard.type === 'desktop-items') {
          setSelectedIds(new Set());
          clearClipboard();
        } else {
          for (const item of clipboard.items) {
            if (clipboard.sourcePath) {
              const { isWritableSpecialPath, removeItemFromSpecialLocation } =
                await import('@core/desktop-shortcuts');
              if (isWritableSpecialPath(clipboard.sourcePath)) {
                removeItemFromSpecialLocation(clipboard.sourcePath, item.id);
              } else {
                const sourceFolder = folderByPath(clipboard.sourcePath);
                if (sourceFolder) {
                  removeFromFolder(sourceFolder.id, item.id);
                }
              }
            }

            const position = findNextAvailablePosition(occupied());
            if (item.type === 'shortcut') {
              updateDesktopShortcutPosition(item.id, position.x, position.y);
            } else if (item.type === 'folder') {
              setFolderPos(item.id, position.x, position.y);
            } else if (item.type === 'image' || item.type === 'video' || item.type === 'audio') {
              if (getMediaById(item.id)) {
                placeMedia(item.id, position.x, position.y);
              }
            } else if (item.type === 'file') {
              if (getFileById(item.id)) {
                placeFile(item.id, position.x, position.y);
              }
            }
          }
          setSelectedIds(new Set());
          clearClipboard();
        }
      }

      loadItems();
      window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
    } catch (error) {
      console.error('[DesktopIcons] Error pasting items:', error);
    }
  }, [loadItems]);

  // Cut ghost UI
  useEffect(() => {
    const sync = () => setCutIds(getCutItemIds());
    sync();
    window.addEventListener('deskos-clipboard-updated', sync);
    return () => window.removeEventListener('deskos-clipboard-updated', sync);
  }, []);

  // Register keyboard shortcut handlers
  useEffect(() => {
    const unregisterSelectAll = registerSelectAllHandler(handleSelectAll);
    const unregisterCopy = registerCopyHandler(handleCopy);
    const unregisterCut = registerCutHandler(handleCut);
    const unregisterPaste = registerPasteHandler(handlePaste);
    const unregisterDelete = registerDeleteHandler(handleDelete);

    return () => {
      unregisterSelectAll();
      unregisterCopy();
      unregisterCut();
      unregisterPaste();
      unregisterDelete();
    };
  }, [handleSelectAll, handleCopy, handleCut, handlePaste, handleDelete]);

  return (
    <div className="desktop-icons">
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
      {shortcuts.map((shortcut) => {
        const program = programDataMemo[shortcut.id];
        if (!program) return null;

        return (
          <DesktopIcon
            key={shortcut.id}
            shortcut={shortcut}
            program={program}
            onUpdate={handleUpdate}
            isSelected={selectedIds.has(shortcut.id)}
            isCut={cutIds.has(shortcut.id)}
            onSelect={(e, forceSingle) => handleIconSelect(shortcut.id, e, forceSingle)}
            layoutTick={layoutTick}
            getDragIds={getDragIds}
            getItemOrigin={getItemOrigin}
            dragGroup={dragGroup}
            onDragGroupStart={handleDragGroupStart}
            onDragGroupMove={handleDragGroupMove}
            onDragGroupEnd={handleDragGroupEnd}
            resolveItemPosition={resolveItemPosition}
          />
        );
      })}
      {folders.map((folder) => (
        <FolderIcon
          key={folder.id}
          folder={folder}
          onUpdate={handleUpdate}
          onOpen={handleOpenFolder}
          isSelected={selectedIds.has(folder.id)}
          isCut={cutIds.has(folder.id)}
          onSelect={(e, forceSingle) => handleIconSelect(folder.id, e, forceSingle)}
          layoutTick={layoutTick}
          getDragIds={getDragIds}
          getItemOrigin={getItemOrigin}
          dragGroup={dragGroup}
          onDragGroupStart={handleDragGroupStart}
          onDragGroupMove={handleDragGroupMove}
          onDragGroupEnd={handleDragGroupEnd}
          resolveItemPosition={resolveItemPosition}
        />
      ))}
      {mediaItems.map((media) => (
        <DesktopMediaIcon
          key={media.id}
          media={media}
          onUpdate={handleUpdate}
          isSelected={selectedIds.has(media.id)}
          isCut={cutIds.has(media.id)}
          onSelect={(e, forceSingle) => handleIconSelect(media.id, e, forceSingle)}
          layoutTick={layoutTick}
          getDragIds={getDragIds}
          getItemOrigin={getItemOrigin}
          dragGroup={dragGroup}
          onDragGroupStart={handleDragGroupStart}
          onDragGroupMove={handleDragGroupMove}
          onDragGroupEnd={handleDragGroupEnd}
          resolveItemPosition={resolveItemPosition}
        />
      ))}
      {fileItems.map((file) => (
        <DesktopFileIcon
          key={file.id}
          file={file}
          onUpdate={handleUpdate}
          isSelected={selectedIds.has(file.id)}
          isCut={cutIds.has(file.id)}
          onSelect={(e, forceSingle) => handleIconSelect(file.id, e, forceSingle)}
          layoutTick={layoutTick}
          getDragIds={getDragIds}
          getItemOrigin={getItemOrigin}
          dragGroup={dragGroup}
          onDragGroupStart={handleDragGroupStart}
          onDragGroupMove={handleDragGroupMove}
          onDragGroupEnd={handleDragGroupEnd}
          resolveItemPosition={resolveItemPosition}
        />
      ))}
    </div>
  );
}
