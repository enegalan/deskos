import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { programs } from 'virtual:programs';
import { launchOrFocusProgram } from '@core/context';
import { getMaxIconSize, useKernel } from '@core/kernel';
import { DRAG_START_THRESHOLD, ICON_EMOJI_SCALE, ICON_GLYPH_SCALE } from '@core/constants';
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
  updateDesktopShortcutPosition,
  findItemAtPosition,
  swapItemPositions,
  pixelToGrid,
  clampGridPosition,
  getGridMetrics,
  addItemToFolder,
  isDesktopFolder,
  isImageItem,
  isVideoItem,
  updateFolderPosition,
  updateMediaPosition,
  computeGroupDropPositions,
  type DesktopShortcut,
  type DesktopFolder,
  type DesktopMediaItem,
} from '@core/desktop-shortcuts';
import { deleteDesktopItems } from '@core/delete-items';
import { resolveProgramIcon } from '@core/program-icons';

/**
 * Highlight the desktop icon under a drag, or clear all highlights.
 *
 * @param itemId - Shortcut/folder id to mark, or `null` to clear
 */
function setDragOverTarget(itemId: string | null) {
  document.querySelectorAll('.desktop-icon').forEach((el) => {
    el.classList.remove('drag-over-target');
  });
  if (itemId) {
    const target = document.querySelector(
      `[data-shortcut-id="${itemId}"], [data-folder-id="${itemId}"]`
    );
    target?.classList.add('drag-over-target');
  }
}

/** True when a folder browser window is focused (desktop defers clipboard shortcuts to it). */
function isFolderWindowActive(): boolean {
  const { activeWindowId, windows } = useKernel.getState();
  if (!activeWindowId) return false;
  return windows.some((w) => w.id === activeWindowId && w.programId === 'folder');
}

/** Active multi-icon drag on the desktop surface */
interface DesktopDragGroup {
  ids: string[];
  primaryId: string;
  delta: { x: number; y: number };
  origins: Record<string, { x: number; y: number }>;
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
  const [isDragging, setIsDragging] = useState(false);
  const [visualPosition, setVisualPosition] = useState({ x: shortcut.x, y: shortcut.y });
  const [gridPosition, setGridPosition] = useState<{ x: number; y: number } | null>(null);
  const [isOverFolderWindow, setIsOverFolderWindow] = useState(false);
  const iconRef = useRef<HTMLDivElement>(null);
  const lastClickTimeRef = useRef<number>(0);
  const clickTimeoutRef = useRef<number | null>(null);
  const dragStateRef = useRef<{
    isDragging: boolean;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    animationFrame: number | null;
    lastPosition: { x: number; y: number } | null;
  }>({
    isDragging: false,
    offsetX: 0,
    offsetY: 0,
    startX: 0,
    startY: 0,
    animationFrame: null,
    lastPosition: null,
  });

  const handleLaunch = useCallback(async () => {
    await launchOrFocusProgram(shortcut.programId);
  }, [shortcut.programId]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't trigger click if we were dragging
      if (dragStateRef.current.isDragging) {
        return;
      }

      const now = Date.now();
      const timeSinceLastClick = now - lastClickTimeRef.current;

      if (timeSinceLastClick < 300 && timeSinceLastClick > 0) {
        // Double click detected
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
          clickTimeoutRef.current = null;
        }
        handleLaunch();
        lastClickTimeRef.current = 0;
      } else {
        // Single click - select the icon and wait to see if it becomes a double click
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
    [handleLaunch, onSelect]
  );

  // Update visual position when shortcut position changes externally
  useEffect(() => {
    const inGroup = dragGroup?.ids.includes(shortcut.id);
    if (!isDragging && !dragStateRef.current.isDragging && !inGroup) {
      // Only update if the position actually changed to avoid overwriting during drag
      if (visualPosition.x !== shortcut.x || visualPosition.y !== shortcut.y) {
        setVisualPosition({ x: shortcut.x, y: shortcut.y });
      }
    }
  }, [
    shortcut.x,
    shortcut.y,
    isDragging,
    visualPosition.x,
    visualPosition.y,
    dragGroup,
    shortcut.id,
  ]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // Only handle left mouse button

      const desktopElement = document.querySelector('.desktop');
      const desktopRect = desktopElement?.getBoundingClientRect();
      if (!desktopRect || !iconRef.current) return;

      // Calculate offset immediately on mouse down for precise tracking
      const iconRect = iconRef.current.getBoundingClientRect();
      const iconXRelativeToDesktop = iconRect.left - desktopRect.left;
      const iconYRelativeToDesktop = iconRect.top - desktopRect.top;

      // Offset is the distance from click point to icon's top-left corner
      const initialOffsetX = e.clientX - desktopRect.left - iconXRelativeToDesktop;
      const initialOffsetY = e.clientY - desktopRect.top - iconYRelativeToDesktop;

      const startX = e.clientX;
      const startY = e.clientY;
      let hasMoved = false;
      let dragIds: string[] = [shortcut.id];
      let origins: Record<string, { x: number; y: number }> = {
        [shortcut.id]: { x: shortcut.x, y: shortcut.y },
      };

      const updatePosition = (moveEvent: MouseEvent) => {
        if (!iconRef.current || !desktopElement) return;

        // Check if icon is over a folder window - if so, don't show grid indicator
        const elementUnderMouse = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        const folderWindowMain = elementUnderMouse?.closest('.folder-window-main');
        const isOverFolderWindow = !!folderWindowMain;

        // If over a folder window, don't calculate grid position or show indicator
        if (isOverFolderWindow) {
          setGridPosition(null);
          setDragOverTarget(null);
          return;
        }

        const currentDesktopRect = desktopElement.getBoundingClientRect();
        const bounds = {
          width: currentDesktopRect.width,
          height: currentDesktopRect.height,
        };
        const { cellWidth, cellHeight } = getGridMetrics(bounds);

        // Calculate position relative to desktop
        let rawX = moveEvent.clientX - currentDesktopRect.left - initialOffsetX;
        let rawY = moveEvent.clientY - currentDesktopRect.top - initialOffsetY;

        // Icon fills one grid cell
        const iconWidth = cellWidth;
        const iconHeight = cellHeight;

        // Constrain position to desktop bounds
        const minX = 0;
        const minY = 0;
        const maxX = currentDesktopRect.width - iconWidth;
        const maxY = currentDesktopRect.height - iconHeight;

        rawX = Math.max(minX, Math.min(maxX, rawX));
        rawY = Math.max(minY, Math.min(maxY, rawY));

        // Snap by icon center so adjacent cell highlights past midpoint
        const snapped = pixelToGrid(rawX + cellWidth / 2, rawY + cellHeight / 2, bounds);
        const gridPos = clampGridPosition(snapped.x, snapped.y, bounds);

        const origin = origins[shortcut.id];
        onDragGroupMove({ x: rawX - origin.x, y: rawY - origin.y });
        setVisualPosition({ x: rawX, y: rawY });
        setGridPosition(gridPos);
        dragStateRef.current.lastPosition = gridPos;

        const collidingItem = findItemAtPosition(gridPos.x, gridPos.y, dragIds);
        setDragOverTarget(collidingItem?.id ?? null);
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = Math.abs(moveEvent.clientX - startX);
        const deltaY = Math.abs(moveEvent.clientY - startY);

        // Only start dragging if mouse moved more than the threshold
        if ((deltaX > DRAG_START_THRESHOLD || deltaY > DRAG_START_THRESHOLD) && !hasMoved) {
          hasMoved = true;
          dragIds = getDragIds(shortcut.id);
          if (dragIds.length === 1) {
            onSelect(undefined, true);
          }
          origins = Object.fromEntries(dragIds.map((id) => [id, getItemOrigin(id)]));
          onDragGroupStart(dragIds, shortcut.id, origins);
          if (iconRef.current) {
            dragStateRef.current = {
              isDragging: true,
              offsetX: initialOffsetX,
              offsetY: initialOffsetY,
              startX: shortcut.x,
              startY: shortcut.y,
              animationFrame: null,
              lastPosition: null,
            };
            setIsDragging(true);
            iconRef.current.style.zIndex = '10000';
          }
        }

        // Continue dragging if already started
        if (hasMoved && dragStateRef.current.isDragging) {
          // Check if mouse is over a folder window or desktop
          const elementUnderMouse = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          const folderWindowMain = elementUnderMouse?.closest('.folder-window-main');
          const desktopElement = elementUnderMouse?.closest('.desktop');

          // When over a window, increase z-index of container to keep icon visible
          if (iconRef.current) {
            const container = iconRef.current.closest('.desktop-icons-container');
            if (folderWindowMain) {
              setIsOverFolderWindow(true);
              if (container) {
                container.classList.add('dragging-over-window');
              }
              iconRef.current.style.zIndex = '100000';
              folderWindowMain.classList.add('drag-over');
              iconRef.current.classList.add('dragging-over-folder');
            } else if (desktopElement) {
              setIsOverFolderWindow(false);
              if (container) {
                container.classList.remove('dragging-over-window');
              }
              iconRef.current.style.zIndex = '10000';
              desktopElement.classList.add('drag-over');
              iconRef.current.classList.add('dragging-over-desktop');
            } else {
              setIsOverFolderWindow(false);
              if (container) {
                container.classList.remove('dragging-over-window');
              }
              iconRef.current.style.zIndex = '10000';
              iconRef.current.classList.remove('dragging-over-folder', 'dragging-over-desktop');
              document.querySelectorAll('.folder-window-main, .desktop').forEach((el) => {
                el.classList.remove('drag-over');
              });
            }
          }

          // Cancel previous animation frame if exists
          if (dragStateRef.current.animationFrame !== null) {
            cancelAnimationFrame(dragStateRef.current.animationFrame);
          }

          // Use requestAnimationFrame for smooth updates
          dragStateRef.current.animationFrame = requestAnimationFrame(() => {
            updatePosition(moveEvent);
          });
        }
      };

      const handleMouseUp = (e?: MouseEvent) => {
        // Cancel any pending animation frame
        if (dragStateRef.current.animationFrame !== null) {
          cancelAnimationFrame(dragStateRef.current.animationFrame);
          dragStateRef.current.animationFrame = null;
        }

        // Remove dragging-over-window class from container
        const container = iconRef.current?.closest('.desktop-icons-container');
        if (container) {
          container.classList.remove('dragging-over-window');
        }

        // Reset z-index
        if (iconRef.current) {
          iconRef.current.style.zIndex = '';
        }

        setDragOverTarget(null);
        document.querySelectorAll('.desktop-icon').forEach((el) => {
          el.classList.remove('dragging-over-folder', 'dragging-over-desktop');
        });

        // Remove drag-over classes from windows and desktop
        document.querySelectorAll('.folder-window-main, .desktop').forEach((el) => {
          el.classList.remove('drag-over');
        });

        if (hasMoved && dragStateRef.current.isDragging) {
          // Check if mouse is over a folder window
          let handledByFolderWindow = false;
          if (e) {
            const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
            const folderWindowMain = elementUnderMouse?.closest('.folder-window-main');
            if (folderWindowMain) {
              const path = (folderWindowMain as HTMLElement).dataset.folderPath;
              if (path) {
                handledByFolderWindow = true;
                Promise.all([
                  import('@file-system/file-system'),
                  import('@core/desktop-shortcuts'),
                ]).then(([{ resolvePath }, { getFolderByPath, addItemToFolder }]) => {
                  const resolved = resolvePath(path);
                  if (resolved.type === 'folder') {
                    const targetFolder = getFolderByPath(path);
                    if (targetFolder) {
                      // Add items to the folder
                      for (const id of dragIds) {
                        if (id !== targetFolder.id) {
                          addItemToFolder(targetFolder.id, id);
                        }
                      }
                      setVisualPosition({ x: shortcut.x, y: shortcut.y });
                      // Dispatch event to update folder window
                      window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
                    }
                  }
                });
              }
            }
          }

          // If handled by folder window, skip desktop collision check
          if (handledByFolderWindow) {
            // Reset dragging state
            dragStateRef.current.isDragging = false;
            setIsDragging(false);
            setGridPosition(null);
            setIsOverFolderWindow(false);
            onDragGroupEnd();
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp as EventListener);
            return;
          }

          const desktopElement = document.querySelector('.desktop');
          if (desktopElement && iconRef.current) {
            // Calculate final position based on last mouse position
            // Use the last calculated grid position for final placement
            const finalPos = dragStateRef.current.lastPosition;

            if (finalPos) {
              const collidingItem = findItemAtPosition(finalPos.x, finalPos.y, dragIds);

              if (collidingItem && isDesktopFolder(collidingItem)) {
                for (const id of dragIds) {
                  if (id !== collidingItem.id) {
                    addItemToFolder(collidingItem.id, id);
                  }
                }
                setVisualPosition({ x: shortcut.x, y: shortcut.y });
              } else if (collidingItem && dragIds.length === 1) {
                const targetX = collidingItem.x;
                const targetY = collidingItem.y;
                swapItemPositions(shortcut.id, collidingItem.id);
                setVisualPosition({ x: targetX, y: targetY });
              } else {
                const positions = computeGroupDropPositions(
                  dragIds,
                  origins,
                  shortcut.id,
                  finalPos
                );
                for (const id of dragIds) {
                  const pos = positions[id];
                  if (pos) resolveItemPosition(id, pos.x, pos.y);
                }
                const primaryPos = positions[shortcut.id] ?? finalPos;
                setVisualPosition({ x: primaryPos.x, y: primaryPos.y });
                onUpdate();
              }
            } else {
              // No final position, just call onUpdate
              onUpdate();
            }

            // Reset z-index
            if (iconRef.current) {
              iconRef.current.style.zIndex = '';
            }

            // Reset last position
            dragStateRef.current.lastPosition = null;
            setGridPosition(null);
          }

          // Reset dragging state
          dragStateRef.current.isDragging = false;
          setIsDragging(false);
          setGridPosition(null);
          setIsOverFolderWindow(false);
          onDragGroupEnd();
        }

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [
      shortcut.id,
      shortcut.x,
      shortcut.y,
      onUpdate,
      onSelect,
      getDragIds,
      getItemOrigin,
      onDragGroupStart,
      onDragGroupMove,
      onDragGroupEnd,
      resolveItemPosition,
    ]
  );

  const inDragGroup = dragGroup?.ids.includes(shortcut.id) ?? false;
  const displayPosition =
    inDragGroup && dragGroup?.origins[shortcut.id]
      ? {
          x: dragGroup.origins[shortcut.id].x + dragGroup.delta.x,
          y: dragGroup.origins[shortcut.id].y + dragGroup.delta.y,
        }
      : visualPosition;
  const showDragging = isDragging || inDragGroup;

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
  const [isDragging, setIsDragging] = useState(false);
  const [visualPosition, setVisualPosition] = useState({ x: folder.x, y: folder.y });
  const [gridPosition, setGridPosition] = useState<{ x: number; y: number } | null>(null);
  const [isOverFolderWindow, setIsOverFolderWindow] = useState(false);
  const iconRef = useRef<HTMLDivElement>(null);
  const lastClickTimeRef = useRef<number>(0);
  const clickTimeoutRef = useRef<number | null>(null);
  const dragStateRef = useRef<{
    isDragging: boolean;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    animationFrame: number | null;
    lastPosition: { x: number; y: number } | null;
  }>({
    isDragging: false,
    offsetX: 0,
    offsetY: 0,
    startX: 0,
    startY: 0,
    animationFrame: null,
    lastPosition: null,
  });

  const handleOpen = useCallback(() => {
    onOpen(folder.id);
  }, [folder.id, onOpen]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragStateRef.current.isDragging) {
        return;
      }

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
        // Single click - select the folder and wait to see if it becomes a double click
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
    [handleOpen, onSelect]
  );

  useEffect(() => {
    const inGroup = dragGroup?.ids.includes(folder.id);
    if (!isDragging && !dragStateRef.current.isDragging && !inGroup) {
      // Only update if the position actually changed to avoid overwriting during drag
      if (visualPosition.x !== folder.x || visualPosition.y !== folder.y) {
        setVisualPosition({ x: folder.x, y: folder.y });
      }
    }
  }, [folder.x, folder.y, isDragging, visualPosition.x, visualPosition.y, dragGroup, folder.id]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;

      const desktopElement = document.querySelector('.desktop');
      const desktopRect = desktopElement?.getBoundingClientRect();
      if (!desktopRect || !iconRef.current) return;

      const iconRect = iconRef.current.getBoundingClientRect();
      const iconXRelativeToDesktop = iconRect.left - desktopRect.left;
      const iconYRelativeToDesktop = iconRect.top - desktopRect.top;

      const initialOffsetX = e.clientX - desktopRect.left - iconXRelativeToDesktop;
      const initialOffsetY = e.clientY - desktopRect.top - iconYRelativeToDesktop;

      const startX = e.clientX;
      const startY = e.clientY;
      let hasMoved = false;
      let dragIds: string[] = [folder.id];
      let origins: Record<string, { x: number; y: number }> = {
        [folder.id]: { x: folder.x, y: folder.y },
      };

      const updatePosition = (moveEvent: MouseEvent) => {
        if (!desktopElement || !iconRef.current) return;

        // Check if icon is over a folder window - if so, don't show grid indicator
        const elementUnderMouse = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        const folderWindowMain = elementUnderMouse?.closest('.folder-window-main');
        const isOverFolderWindow = !!folderWindowMain;

        // If over a folder window, don't calculate grid position or show indicator
        if (isOverFolderWindow) {
          setGridPosition(null);
          setDragOverTarget(null);
          return;
        }

        const currentDesktopRect = desktopElement.getBoundingClientRect();
        const bounds = {
          width: currentDesktopRect.width,
          height: currentDesktopRect.height,
        };
        const { cellWidth, cellHeight } = getGridMetrics(bounds);
        let rawX = moveEvent.clientX - currentDesktopRect.left - initialOffsetX;
        let rawY = moveEvent.clientY - currentDesktopRect.top - initialOffsetY;

        // Icon fills one grid cell
        const iconWidth = cellWidth;
        const iconHeight = cellHeight;

        // Constrain position to desktop bounds
        const minX = 0;
        const minY = 0;
        const maxX = currentDesktopRect.width - iconWidth;
        const maxY = currentDesktopRect.height - iconHeight;

        rawX = Math.max(minX, Math.min(maxX, rawX));
        rawY = Math.max(minY, Math.min(maxY, rawY));

        // Snap by icon center so adjacent cell highlights past midpoint
        const snapped = pixelToGrid(rawX + cellWidth / 2, rawY + cellHeight / 2, bounds);
        const gridPos = clampGridPosition(snapped.x, snapped.y, bounds);

        const origin = origins[folder.id];
        onDragGroupMove({ x: rawX - origin.x, y: rawY - origin.y });
        setVisualPosition({ x: rawX, y: rawY });
        setGridPosition(gridPos);
        dragStateRef.current.lastPosition = gridPos;

        const collidingItem = findItemAtPosition(gridPos.x, gridPos.y, dragIds);
        setDragOverTarget(collidingItem?.id ?? null);
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = Math.abs(moveEvent.clientX - startX);
        const deltaY = Math.abs(moveEvent.clientY - startY);

        if ((deltaX > DRAG_START_THRESHOLD || deltaY > DRAG_START_THRESHOLD) && !hasMoved) {
          hasMoved = true;
          dragIds = getDragIds(folder.id);
          if (dragIds.length === 1) {
            onSelect(undefined, true);
          }
          origins = Object.fromEntries(dragIds.map((id) => [id, getItemOrigin(id)]));
          onDragGroupStart(dragIds, folder.id, origins);
          if (iconRef.current) {
            dragStateRef.current = {
              isDragging: true,
              offsetX: initialOffsetX,
              offsetY: initialOffsetY,
              startX: folder.x,
              startY: folder.y,
              animationFrame: null,
              lastPosition: null,
            };
            setIsDragging(true);
            iconRef.current.style.zIndex = '10000';
          }
        }

        if (hasMoved && dragStateRef.current.isDragging) {
          // Check if mouse is over a folder window or desktop
          const elementUnderMouse = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          const folderWindowMain = elementUnderMouse?.closest('.folder-window-main');
          const desktopElement = elementUnderMouse?.closest('.desktop');

          // When over a window, increase z-index of container to keep icon visible
          if (iconRef.current) {
            const container = iconRef.current.closest('.desktop-icons-container');
            if (folderWindowMain) {
              setIsOverFolderWindow(true);
              if (container) {
                container.classList.add('dragging-over-window');
              }
              iconRef.current.style.zIndex = '100000';
              folderWindowMain.classList.add('drag-over');
              iconRef.current.classList.add('dragging-over-folder');
            } else if (desktopElement) {
              setIsOverFolderWindow(false);
              if (container) {
                container.classList.remove('dragging-over-window');
              }
              iconRef.current.style.zIndex = '10000';
              desktopElement.classList.add('drag-over');
              iconRef.current.classList.add('dragging-over-desktop');
            } else {
              setIsOverFolderWindow(false);
              if (container) {
                container.classList.remove('dragging-over-window');
              }
              iconRef.current.style.zIndex = '10000';
              iconRef.current.classList.remove('dragging-over-folder', 'dragging-over-desktop');
              document.querySelectorAll('.folder-window-main, .desktop').forEach((el) => {
                el.classList.remove('drag-over');
              });
            }
          }

          if (dragStateRef.current.animationFrame !== null) {
            cancelAnimationFrame(dragStateRef.current.animationFrame);
          }

          dragStateRef.current.animationFrame = requestAnimationFrame(() => {
            updatePosition(moveEvent);
          });
        }
      };

      const handleMouseUp = (e?: MouseEvent) => {
        if (dragStateRef.current.animationFrame !== null) {
          cancelAnimationFrame(dragStateRef.current.animationFrame);
          dragStateRef.current.animationFrame = null;
        }

        // Remove dragging-over-window class from container
        const container = iconRef.current?.closest('.desktop-icons-container');
        if (container) {
          container.classList.remove('dragging-over-window');
        }

        // Reset z-index
        if (iconRef.current) {
          iconRef.current.style.zIndex = '';
        }

        setDragOverTarget(null);
        document.querySelectorAll('.desktop-icon').forEach((el) => {
          el.classList.remove('dragging-over-folder', 'dragging-over-desktop');
        });

        // Remove drag-over classes from windows and desktop
        document.querySelectorAll('.folder-window-main, .desktop').forEach((el) => {
          el.classList.remove('drag-over');
        });

        if (hasMoved && dragStateRef.current.isDragging) {
          // Check if mouse is over a folder window
          let handledByFolderWindow = false;
          if (e) {
            const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
            const folderWindowMain = elementUnderMouse?.closest('.folder-window-main');
            if (folderWindowMain) {
              const path = (folderWindowMain as HTMLElement).dataset.folderPath;
              if (path) {
                handledByFolderWindow = true;
                Promise.all([
                  import('@file-system/file-system'),
                  import('@core/desktop-shortcuts'),
                ]).then(([{ resolvePath }, { getFolderByPath, addItemToFolder }]) => {
                  const resolved = resolvePath(path);
                  if (resolved.type === 'folder') {
                    const targetFolder = getFolderByPath(path);
                    if (targetFolder) {
                      for (const id of dragIds) {
                        if (id !== targetFolder.id) {
                          addItemToFolder(targetFolder.id, id);
                        }
                      }
                      setVisualPosition({ x: folder.x, y: folder.y });
                      window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
                    }
                  }
                });
              }
            }
          }

          // If handled by folder window, skip desktop collision check
          if (handledByFolderWindow) {
            // Reset dragging state
            dragStateRef.current.isDragging = false;
            setIsDragging(false);
            setGridPosition(null);
            setIsOverFolderWindow(false);
            onDragGroupEnd();
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp as EventListener);
            return;
          }

          const desktopElement = document.querySelector('.desktop');
          if (desktopElement && iconRef.current) {
            const finalPos = dragStateRef.current.lastPosition;

            if (finalPos) {
              const collidingItem = findItemAtPosition(finalPos.x, finalPos.y, dragIds);

              if (collidingItem && isDesktopFolder(collidingItem)) {
                for (const id of dragIds) {
                  if (id !== collidingItem.id) {
                    addItemToFolder(collidingItem.id, id);
                  }
                }
                setVisualPosition({ x: folder.x, y: folder.y });
              } else if (collidingItem && dragIds.length === 1) {
                const targetX = collidingItem.x;
                const targetY = collidingItem.y;
                swapItemPositions(folder.id, collidingItem.id);
                setVisualPosition({ x: targetX, y: targetY });
              } else {
                const positions = computeGroupDropPositions(dragIds, origins, folder.id, finalPos);
                for (const id of dragIds) {
                  const pos = positions[id];
                  if (pos) resolveItemPosition(id, pos.x, pos.y);
                }
                const primaryPos = positions[folder.id] ?? finalPos;
                setVisualPosition({ x: primaryPos.x, y: primaryPos.y });
                onUpdate();
              }
            } else {
              onUpdate();
            }

            if (iconRef.current) {
              iconRef.current.style.zIndex = '';
            }

            dragStateRef.current.lastPosition = null;
            setGridPosition(null);
          }

          // Reset dragging state
          dragStateRef.current.isDragging = false;
          setIsDragging(false);
          setGridPosition(null);
          setIsOverFolderWindow(false);
          onDragGroupEnd();
        }

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp as EventListener);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [
      folder.id,
      folder.x,
      folder.y,
      onUpdate,
      onSelect,
      getDragIds,
      getItemOrigin,
      onDragGroupStart,
      onDragGroupMove,
      onDragGroupEnd,
      resolveItemPosition,
    ]
  );

  const inDragGroup = dragGroup?.ids.includes(folder.id) ?? false;
  const displayPosition =
    inDragGroup && dragGroup?.origins[folder.id]
      ? {
          x: dragGroup.origins[folder.id].x + dragGroup.delta.x,
          y: dragGroup.origins[folder.id].y + dragGroup.delta.y,
        }
      : visualPosition;
  const showDragging = isDragging || inDragGroup;

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
  const url = isImageItem(media) ? media.imageUrl : media.videoUrl;
  const [isDragging, setIsDragging] = useState(false);
  const [visualPosition, setVisualPosition] = useState({ x: media.x, y: media.y });
  const [gridPosition, setGridPosition] = useState<{ x: number; y: number } | null>(null);
  const [isOverFolderWindow, setIsOverFolderWindow] = useState(false);
  const iconRef = useRef<HTMLDivElement>(null);
  const lastClickTimeRef = useRef(0);
  const clickTimeoutRef = useRef<number | null>(null);
  const dragStateRef = useRef<{
    isDragging: boolean;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    animationFrame: number | null;
    lastPosition: { x: number; y: number } | null;
  }>({
    isDragging: false,
    offsetX: 0,
    offsetY: 0,
    startX: 0,
    startY: 0,
    animationFrame: null,
    lastPosition: null,
  });

  const openMedia = useCallback(() => {
    if (isImageItem(media)) {
      window.dispatchEvent(
        new CustomEvent('open-image', {
          detail: { images: [{ src: media.imageUrl, name: media.name }], startIndex: 0 },
        })
      );
    } else {
      window.dispatchEvent(
        new CustomEvent('open-video', {
          detail: { videos: [{ src: media.videoUrl, name: media.name }], startIndex: 0 },
        })
      );
    }
  }, [media]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragStateRef.current.isDragging) return;

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
    [openMedia, onSelect]
  );

  useEffect(() => {
    const inGroup = dragGroup?.ids.includes(media.id);
    if (!isDragging && !dragStateRef.current.isDragging && !inGroup) {
      if (visualPosition.x !== media.x || visualPosition.y !== media.y) {
        setVisualPosition({ x: media.x, y: media.y });
      }
    }
  }, [media.x, media.y, isDragging, visualPosition.x, visualPosition.y, dragGroup, media.id]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;

      const desktopElement = document.querySelector('.desktop');
      const desktopRect = desktopElement?.getBoundingClientRect();
      if (!desktopRect || !iconRef.current) return;

      const iconRect = iconRef.current.getBoundingClientRect();
      const iconXRelativeToDesktop = iconRect.left - desktopRect.left;
      const iconYRelativeToDesktop = iconRect.top - desktopRect.top;

      const initialOffsetX = e.clientX - desktopRect.left - iconXRelativeToDesktop;
      const initialOffsetY = e.clientY - desktopRect.top - iconYRelativeToDesktop;

      const startX = e.clientX;
      const startY = e.clientY;
      let hasMoved = false;
      let dragIds: string[] = [media.id];
      let origins: Record<string, { x: number; y: number }> = {
        [media.id]: { x: media.x, y: media.y },
      };

      const updatePosition = (moveEvent: MouseEvent) => {
        if (!desktopElement || !iconRef.current) return;

        const elementUnderMouse = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        const folderWindowMain = elementUnderMouse?.closest('.folder-window-main');
        if (folderWindowMain) {
          setGridPosition(null);
          setDragOverTarget(null);
          return;
        }

        const currentDesktopRect = desktopElement.getBoundingClientRect();
        const bounds = {
          width: currentDesktopRect.width,
          height: currentDesktopRect.height,
        };
        const { cellWidth, cellHeight } = getGridMetrics(bounds);
        let rawX = moveEvent.clientX - currentDesktopRect.left - initialOffsetX;
        let rawY = moveEvent.clientY - currentDesktopRect.top - initialOffsetY;

        rawX = Math.max(0, Math.min(currentDesktopRect.width - cellWidth, rawX));
        rawY = Math.max(0, Math.min(currentDesktopRect.height - cellHeight, rawY));

        const snapped = pixelToGrid(rawX + cellWidth / 2, rawY + cellHeight / 2, bounds);
        const gridPos = clampGridPosition(snapped.x, snapped.y, bounds);

        const origin = origins[media.id];
        onDragGroupMove({ x: rawX - origin.x, y: rawY - origin.y });
        setVisualPosition({ x: rawX, y: rawY });
        setGridPosition(gridPos);
        dragStateRef.current.lastPosition = gridPos;

        const collidingItem = findItemAtPosition(gridPos.x, gridPos.y, dragIds);
        setDragOverTarget(collidingItem?.id ?? null);
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = Math.abs(moveEvent.clientX - startX);
        const deltaY = Math.abs(moveEvent.clientY - startY);

        if ((deltaX > DRAG_START_THRESHOLD || deltaY > DRAG_START_THRESHOLD) && !hasMoved) {
          hasMoved = true;
          dragIds = getDragIds(media.id);
          if (dragIds.length === 1) onSelect(undefined, true);
          origins = Object.fromEntries(dragIds.map((id) => [id, getItemOrigin(id)]));
          onDragGroupStart(dragIds, media.id, origins);
          if (iconRef.current) {
            dragStateRef.current = {
              isDragging: true,
              offsetX: initialOffsetX,
              offsetY: initialOffsetY,
              startX: media.x,
              startY: media.y,
              animationFrame: null,
              lastPosition: null,
            };
            setIsDragging(true);
            iconRef.current.style.zIndex = '10000';
          }
        }

        if (hasMoved && dragStateRef.current.isDragging) {
          const elementUnderMouse = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          const folderWindowMain = elementUnderMouse?.closest('.folder-window-main');
          const overDesktop = elementUnderMouse?.closest('.desktop');

          if (iconRef.current) {
            const container = iconRef.current.closest('.desktop-icons-container');
            if (folderWindowMain) {
              setIsOverFolderWindow(true);
              container?.classList.add('dragging-over-window');
              iconRef.current.style.zIndex = '100000';
              folderWindowMain.classList.add('drag-over');
              iconRef.current.classList.add('dragging-over-folder');
            } else if (overDesktop) {
              setIsOverFolderWindow(false);
              container?.classList.remove('dragging-over-window');
              iconRef.current.style.zIndex = '10000';
              overDesktop.classList.add('drag-over');
              iconRef.current.classList.add('dragging-over-desktop');
            } else {
              setIsOverFolderWindow(false);
              container?.classList.remove('dragging-over-window');
              iconRef.current.style.zIndex = '10000';
              iconRef.current.classList.remove('dragging-over-folder', 'dragging-over-desktop');
              document.querySelectorAll('.folder-window-main, .desktop').forEach((el) => {
                el.classList.remove('drag-over');
              });
            }
          }

          if (dragStateRef.current.animationFrame !== null) {
            cancelAnimationFrame(dragStateRef.current.animationFrame);
          }
          dragStateRef.current.animationFrame = requestAnimationFrame(() => {
            updatePosition(moveEvent);
          });
        }
      };

      const handleMouseUp = (upEvent?: MouseEvent) => {
        if (dragStateRef.current.animationFrame !== null) {
          cancelAnimationFrame(dragStateRef.current.animationFrame);
          dragStateRef.current.animationFrame = null;
        }

        iconRef.current?.closest('.desktop-icons-container')?.classList.remove('dragging-over-window');
        if (iconRef.current) iconRef.current.style.zIndex = '';

        setDragOverTarget(null);
        document.querySelectorAll('.desktop-icon').forEach((el) => {
          el.classList.remove('dragging-over-folder', 'dragging-over-desktop');
        });
        document.querySelectorAll('.folder-window-main, .desktop').forEach((el) => {
          el.classList.remove('drag-over');
        });

        if (hasMoved && dragStateRef.current.isDragging) {
          let handledByFolderWindow = false;
          if (upEvent) {
            const elementUnderMouse = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
            const folderWindowMain = elementUnderMouse?.closest('.folder-window-main');
            if (folderWindowMain) {
              const path = (folderWindowMain as HTMLElement).dataset.folderPath;
              if (path) {
                handledByFolderWindow = true;
                Promise.all([
                  import('@file-system/file-system'),
                  import('@core/desktop-shortcuts'),
                ]).then(([{ resolvePath }, { getFolderByPath, addItemToFolder }]) => {
                  const resolved = resolvePath(path);
                  if (resolved.type === 'folder') {
                    const targetFolder = getFolderByPath(path);
                    if (targetFolder) {
                      for (const id of dragIds) {
                        if (id !== targetFolder.id) addItemToFolder(targetFolder.id, id);
                      }
                      setVisualPosition({ x: media.x, y: media.y });
                      window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
                    }
                  }
                });
              }
            }
          }

          if (handledByFolderWindow) {
            dragStateRef.current.isDragging = false;
            setIsDragging(false);
            setGridPosition(null);
            setIsOverFolderWindow(false);
            onDragGroupEnd();
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp as EventListener);
            return;
          }

          const desktopEl = document.querySelector('.desktop');
          if (desktopEl && iconRef.current) {
            const finalPos = dragStateRef.current.lastPosition;
            if (finalPos) {
              const collidingItem = findItemAtPosition(finalPos.x, finalPos.y, dragIds);

              if (collidingItem && isDesktopFolder(collidingItem)) {
                for (const id of dragIds) {
                  if (id !== collidingItem.id) addItemToFolder(collidingItem.id, id);
                }
                setVisualPosition({ x: media.x, y: media.y });
              } else if (collidingItem && dragIds.length === 1) {
                const targetX = collidingItem.x;
                const targetY = collidingItem.y;
                swapItemPositions(media.id, collidingItem.id);
                setVisualPosition({ x: targetX, y: targetY });
              } else {
                const positions = computeGroupDropPositions(dragIds, origins, media.id, finalPos);
                for (const id of dragIds) {
                  const pos = positions[id];
                  if (pos) resolveItemPosition(id, pos.x, pos.y);
                }
                const primaryPos = positions[media.id] ?? finalPos;
                setVisualPosition({ x: primaryPos.x, y: primaryPos.y });
                onUpdate();
              }
            } else {
              onUpdate();
            }

            if (iconRef.current) iconRef.current.style.zIndex = '';
            dragStateRef.current.lastPosition = null;
            setGridPosition(null);
          }

          dragStateRef.current.isDragging = false;
          setIsDragging(false);
          setGridPosition(null);
          setIsOverFolderWindow(false);
          onDragGroupEnd();
        }

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp as EventListener);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [
      media.id,
      media.x,
      media.y,
      onUpdate,
      onSelect,
      getDragIds,
      getItemOrigin,
      onDragGroupStart,
      onDragGroupMove,
      onDragGroupEnd,
      resolveItemPosition,
    ]
  );

  const inDragGroup = dragGroup?.ids.includes(media.id) ?? false;
  const displayPosition =
    inDragGroup && dragGroup?.origins[media.id]
      ? {
          x: dragGroup.origins[media.id].x + dragGroup.delta.x,
          y: dragGroup.origins[media.id].y + dragGroup.delta.y,
        }
      : visualPosition;
  const showDragging = isDragging || inDragGroup;

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
          ) : (
            <video
              className="desktop-media-thumb"
              src={url}
              muted
              preload="metadata"
              playsInline
              draggable={false}
            />
          )}
        </div>
        {settings.showIconLabels && <div className="desktop-icon-label">{media.name}</div>}
      </div>
    </>
  );
});

/** Renders desktop shortcuts and folders with selection, drag, and clipboard support. */
export function DesktopIcons() {
  const [shortcuts, setShortcuts] = useState<DesktopShortcut[]>([]);
  const [folders, setFolders] = useState<DesktopFolder[]>([]);
  const [mediaItems, setMediaItems] = useState<DesktopMediaItem[]>([]);
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
  const suppressClickClearRef = useRef(false);
  selectedIdsRef.current = selectedIds;
  shortcutsRef.current = shortcuts;
  foldersRef.current = folders;
  mediaRef.current = mediaItems;

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
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
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
          el.getAttribute('data-media-id'),
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
        ];
        lastSelectedIndexRef.current = allItems.findIndex((itemId) => itemId === id);
      } else {
        // Single selection
        setSelectedIds(new Set([id]));
        const allItems = [
          ...shortcuts.map((s) => s.id),
          ...folders.map((f) => f.id),
          ...mediaItems.map((m) => m.id),
        ];
        lastSelectedIndexRef.current = allItems.findIndex((itemId) => itemId === id);
      }
    },
    [selectedIds, shortcuts, folders, mediaItems]
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
    ];
    setSelectedIds(new Set(allItemIds));
    if (allItemIds.length > 0) {
      lastSelectedIndexRef.current = allItemIds.length - 1;
    }
  }, [shortcuts, folders, mediaItems]);

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
      if (shortcut) {
        items.push({ id: shortcut.id, type: 'shortcut' });
      } else if (folder) {
        items.push({ id: folder.id, type: 'folder' });
      } else if (media && isImageItem(media)) {
        items.push({ id: media.id, type: 'image' });
      } else if (media && isVideoItem(media)) {
        items.push({ id: media.id, type: 'video' });
      }
    });

    if (items.length > 0) {
      clipboardCopy({
        type: 'desktop-items',
        items,
        operation: 'copy',
      });
    }
  }, [selectedIds, shortcuts, folders, mediaItems]);

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
      if (shortcut) {
        items.push({ id: shortcut.id, type: 'shortcut' });
      } else if (folder) {
        items.push({ id: folder.id, type: 'folder' });
      } else if (media && isImageItem(media)) {
        items.push({ id: media.id, type: 'image' });
      } else if (media && isVideoItem(media)) {
        items.push({ id: media.id, type: 'video' });
      }
    });

    if (items.length > 0) {
      clipboardCut({
        type: 'desktop-items',
        items,
        operation: 'cut',
      });
    }
  }, [selectedIds, shortcuts, folders, mediaItems]);

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
      findNextAvailablePosition,
      createDesktopFolder,
      getFolderById,
      removeItemFromFolder: removeFromFolder,
      getFolderByPath: folderByPath,
      updateFolderPosition: setFolderPos,
      copyDesktopMedia: copyMedia,
      placeMediaOnDesktop: placeMedia,
      getMediaById,
    } = await import('@core/desktop-shortcuts');
    const allShortcuts = getDesktopShortcuts();

    const occupied = () =>
      [
        ...getDesktopShortcuts(),
        ...getDesktopFolders(),
        ...getDesktopSurfaceMedia(),
      ].map((i) => ({ x: i.x, y: i.y }));

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
          } else if (item.type === 'image' || item.type === 'video') {
            const position = findNextAvailablePosition(occupied());
            copyMedia(item.id, position.x, position.y);
          }
        }
      } else if (clipboard.operation === 'cut') {
        // Same surface: keep positions, only clear cut state
        if (clipboard.type === 'desktop-items') {
          setSelectedIds(new Set());
          clearClipboard();
        } else {
          for (const item of clipboard.items) {
            if (
              clipboard.sourcePath &&
              clipboard.sourcePath !== '/Images' &&
              clipboard.sourcePath !== '/Videos'
            ) {
              const sourceFolder = folderByPath(clipboard.sourcePath);
              if (sourceFolder) {
                removeFromFolder(sourceFolder.id, item.id);
              }
            }

            const position = findNextAvailablePosition(occupied());
            if (item.type === 'shortcut') {
              updateDesktopShortcutPosition(item.id, position.x, position.y);
            } else if (item.type === 'folder') {
              setFolderPos(item.id, position.x, position.y);
            } else if (item.type === 'image' || item.type === 'video') {
              if (getMediaById(item.id)) {
                placeMedia(item.id, position.x, position.y);
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
    const unregisterPaste = registerPasteHandler(() => {
      void handlePaste();
    });
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
    </div>
  );
}
