import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { DRAG_START_THRESHOLD } from '@core/constants';
import {
  findItemAtPosition,
  swapItemPositions,
  pixelToGrid,
  clampGridPosition,
  getGridMetrics,
  addItemToFolder,
  isDesktopFolder,
  computeGroupDropPositions,
} from '@core/desktop-shortcuts';

/** Active multi-icon drag on the desktop surface. */
export interface DesktopDragGroup {
  ids: string[];
  primaryId: string;
  delta: { x: number; y: number };
  origins: Record<string, { x: number; y: number }>;
}

/**
 * Highlight the desktop icon under a drag, or clear all highlights.
 *
 * @param itemId - Shortcut/folder/media id to mark, or `null` to clear
 */
export function setDragOverTarget(itemId: string | null) {
  document.querySelectorAll('.desktop-icon').forEach((el) => {
    el.classList.remove('drag-over-target');
  });
  if (itemId) {
    const target = document.querySelector(
      `[data-shortcut-id="${itemId}"], [data-folder-id="${itemId}"], [data-media-id="${itemId}"]`
    );
    target?.classList.add('drag-over-target');
  }
}

export interface UseDesktopIconDragOptions {
  id: string;
  x: number;
  y: number;
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
  onSelect: (e?: ReactMouseEvent, forceSingle?: boolean) => void;
  onUpdate: () => void;
}

/**
 * Shared desktop-icon drag pipeline (offset, threshold, folder drops, swaps, group drop).
 */
export function useDesktopIconDrag({
  id,
  x,
  y,
  getDragIds,
  getItemOrigin,
  dragGroup,
  onDragGroupStart,
  onDragGroupMove,
  onDragGroupEnd,
  resolveItemPosition,
  onSelect,
  onUpdate,
}: UseDesktopIconDragOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [visualPosition, setVisualPosition] = useState({ x, y });
  const [gridPosition, setGridPosition] = useState<{ x: number; y: number } | null>(null);
  const [isOverFolderWindow, setIsOverFolderWindow] = useState(false);
  const iconRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const inGroup = dragGroup?.ids.includes(id);
    if (!isDragging && !dragStateRef.current.isDragging && !inGroup) {
      if (visualPosition.x !== x || visualPosition.y !== y) {
        setVisualPosition({ x, y });
      }
    }
  }, [x, y, isDragging, visualPosition.x, visualPosition.y, dragGroup, id]);

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
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
      let dragIds: string[] = [id];
      let origins: Record<string, { x: number; y: number }> = {
        [id]: { x, y },
      };

      const updatePosition = (moveEvent: MouseEvent) => {
        if (!desktopElement || !iconRef.current) return;

        const elementUnderMouse = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        const overFolderDrop =
          elementUnderMouse?.closest('.folder-window-main') ||
          elementUnderMouse?.closest('.folder-sidebar-item[data-drop-path]');
        if (overFolderDrop) {
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

        const origin = origins[id];
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
          dragIds = getDragIds(id);
          if (dragIds.length === 1) {
            onSelect(undefined, true);
          }
          origins = Object.fromEntries(dragIds.map((dragId) => [dragId, getItemOrigin(dragId)]));
          onDragGroupStart(dragIds, id, origins);
          if (iconRef.current) {
            dragStateRef.current = {
              isDragging: true,
              offsetX: initialOffsetX,
              offsetY: initialOffsetY,
              startX: x,
              startY: y,
              animationFrame: null,
              lastPosition: null,
            };
            setIsDragging(true);
            iconRef.current.style.zIndex = '10000';
          }
        }

        if (hasMoved && dragStateRef.current.isDragging) {
          const elementUnderMouse = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          const sidebarTarget = elementUnderMouse?.closest(
            '.folder-sidebar-item[data-drop-path]'
          ) as HTMLElement | null;
          const folderWindowMain = elementUnderMouse?.closest('.folder-window-main');
          const overDesktop = elementUnderMouse?.closest('.desktop');

          document.querySelectorAll('.folder-sidebar-item.drag-over-target').forEach((el) => {
            el.classList.remove('drag-over-target');
          });

          if (iconRef.current) {
            const container = iconRef.current.closest('.desktop-icons-container');
            if (sidebarTarget && sidebarTarget.dataset.dropPath !== '/Applications') {
              setIsOverFolderWindow(true);
              container?.classList.add('dragging-over-window');
              iconRef.current.style.zIndex = '100000';
              sidebarTarget.classList.add('drag-over-target');
              iconRef.current.classList.add('dragging-over-folder');
              document.querySelectorAll('.folder-window-main, .desktop').forEach((el) => {
                el.classList.remove('drag-over');
              });
            } else if (folderWindowMain) {
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

        iconRef.current
          ?.closest('.desktop-icons-container')
          ?.classList.remove('dragging-over-window');
        if (iconRef.current) iconRef.current.style.zIndex = '';

        setDragOverTarget(null);
        document.querySelectorAll('.desktop-icon').forEach((el) => {
          el.classList.remove('dragging-over-folder', 'dragging-over-desktop');
        });
        document.querySelectorAll('.folder-window-main, .desktop').forEach((el) => {
          el.classList.remove('drag-over');
        });
        document.querySelectorAll('.folder-sidebar-item.drag-over-target').forEach((el) => {
          el.classList.remove('drag-over-target');
        });

        if (hasMoved && dragStateRef.current.isDragging) {
          let handledByFolderWindow = false;
          if (upEvent) {
            const elementUnderMouse = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
            const sidebarTarget = elementUnderMouse?.closest(
              '.folder-sidebar-item[data-drop-path]'
            ) as HTMLElement | null;
            const sidebarPath = sidebarTarget?.dataset.dropPath;
            const folderWindowMain = elementUnderMouse?.closest('.folder-window-main');
            const path =
              sidebarPath || (folderWindowMain as HTMLElement | null)?.dataset.folderPath;

            if (path) {
              handledByFolderWindow = true;
              import('@core/desktop-shortcuts').then(({ moveItemsToPath }) => {
                moveItemsToPath(path, dragIds);
                setVisualPosition({ x, y });
              });
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
                for (const dragId of dragIds) {
                  if (dragId !== collidingItem.id) {
                    addItemToFolder(collidingItem.id, dragId);
                  }
                }
                setVisualPosition({ x, y });
              } else if (collidingItem && dragIds.length === 1) {
                const targetX = collidingItem.x;
                const targetY = collidingItem.y;
                swapItemPositions(id, collidingItem.id);
                setVisualPosition({ x: targetX, y: targetY });
              } else {
                const positions = computeGroupDropPositions(dragIds, origins, id, finalPos);
                for (const dragId of dragIds) {
                  const pos = positions[dragId];
                  if (pos) resolveItemPosition(dragId, pos.x, pos.y);
                }
                const primaryPos = positions[id] ?? finalPos;
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
      id,
      x,
      y,
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

  const inDragGroup = dragGroup?.ids.includes(id) ?? false;
  const displayPosition =
    inDragGroup && dragGroup?.origins[id]
      ? {
          x: dragGroup.origins[id].x + dragGroup.delta.x,
          y: dragGroup.origins[id].y + dragGroup.delta.y,
        }
      : visualPosition;
  const showDragging = isDragging || inDragGroup;

  return {
    iconRef,
    isDragging,
    gridPosition,
    isOverFolderWindow,
    displayPosition,
    handleMouseDown,
    showDragging,
  };
}
