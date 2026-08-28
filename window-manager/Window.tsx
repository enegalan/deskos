import { useState, useCallback, useEffect, useRef, memo, type MouseEvent as ReactMouseEvent } from 'react';
import { useKernel } from '@core/kernel';
import type { WindowState } from '@core/kernel';
import { Icon } from '../components/Icon';

/** Resize handle direction for window edges and corners. */
type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Pointer drag state while moving a window. */
interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
}

/** Pointer resize state while resizing a window. */
interface ResizeState {
  isResizing: boolean;
  direction: ResizeDirection | null;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  startPosX: number;
  startPosY: number;
}

/** Stacking z-index layers for desktop, windows, overlays, and taskbar. */
const Z_INDEX = {
  DESKTOP: 0,
  WINDOW_BASE: 1000,
  WINDOW_ACTIVE: 4000,
  OVERLAY: 5000,
  TASKBAR: 6000,
} as const;

/**
 * Compute stacking z-index from focus and window order.
 *
 * @param windowId - Window id
 * @param windowOrder - Bottom-to-top ordered window ids
 * @param isFocused - Whether this window is focused
 * @returns CSS z-index value
 */
function calculateZIndex(windowId: string, windowOrder: string[], isFocused: boolean): number {
  if (isFocused) {
    return Z_INDEX.WINDOW_ACTIVE;
  }

  const position = windowOrder.indexOf(windowId);
  if (position === -1) {
    return Z_INDEX.WINDOW_BASE;
  }

  return Z_INDEX.WINDOW_BASE + position;
}

/** Props for a managed program window shell. */
interface WindowProps {
  window: WindowState;
  windowOrder: string[];
}

/** Draggable / resizable app window shell (title bar, controls, content) */
export const Window = memo(function Window({ window: win, windowOrder }: WindowProps) {
  const focusWindow = useKernel((state) => state.focusWindow);
  const closeWindow = useKernel((state) => state.closeWindow);
  const minimizeWindow = useKernel((state) => state.minimizeWindow);
  const maximizeWindow = useKernel((state) => state.maximizeWindow);
  const restoreWindow = useKernel((state) => state.restoreWindow);
  const moveWindow = useKernel((state) => state.moveWindow);
  const resizeWindow = useKernel((state) => state.resizeWindow);

  const windowRef = useRef<HTMLDivElement>(null);

  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  });

  const [resizeState, setResizeState] = useState<ResizeState>({
    isResizing: false,
    direction: null,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
    startPosX: 0,
    startPosY: 0,
  });

  const handleMouseDown = useCallback(() => {
    focusWindow(win.id);
  }, [focusWindow, win.id]);

  const handleTitleBarMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (win.isMaximized) return;

      e.preventDefault();
      focusWindow(win.id);

      setDragState({
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: e.clientX - win.x,
        offsetY: e.clientY - win.y,
      });
    },
    [focusWindow, win.id, win.x, win.y, win.isMaximized]
  );

  const handleResizeMouseDown = useCallback(
    (direction: ResizeDirection) => (e: ReactMouseEvent) => {
      if (win.isMaximized) return;

      e.preventDefault();
      e.stopPropagation();
      focusWindow(win.id);

      setResizeState({
        isResizing: true,
        direction,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: win.width,
        startHeight: win.height,
        startPosX: win.x,
        startPosY: win.y,
      });
    },
    [focusWindow, win.id, win.width, win.height, win.x, win.y, win.isMaximized]
  );

  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (dragState.isDragging) {
        moveWindow(
          win.id,
          e.clientX - dragState.offsetX,
          e.clientY - dragState.offsetY
        );
      }

      if (resizeState.isResizing && resizeState.direction) {
        const deltaX = e.clientX - resizeState.startX;
        const deltaY = e.clientY - resizeState.startY;

        let newWidth = resizeState.startWidth;
        let newHeight = resizeState.startHeight;
        let newX = resizeState.startPosX;
        let newY = resizeState.startPosY;

        const dir = resizeState.direction;

        if (dir.includes('e')) {
          newWidth = resizeState.startWidth + deltaX;
        }
        if (dir.includes('w')) {
          newWidth = resizeState.startWidth - deltaX;
          newX = resizeState.startPosX + deltaX;
        }
        if (dir.includes('s')) {
          newHeight = resizeState.startHeight + deltaY;
        }
        if (dir.includes('n')) {
          newHeight = resizeState.startHeight - deltaY;
          newY = resizeState.startPosY + deltaY;
        }

        // Apply minimum constraints
        if (newWidth >= win.minWidth && newHeight >= win.minHeight) {
          if (newX !== win.x || newY !== win.y) {
            moveWindow(win.id, newX, newY);
          }
          resizeWindow(win.id, newWidth, newHeight);
        }
      }
    };

    const handleMouseUp = () => {
      setDragState((prev) => ({ ...prev, isDragging: false }));
      setResizeState((prev) => ({ ...prev, isResizing: false, direction: null }));
    };

    if (dragState.isDragging || resizeState.isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [
    dragState,
    resizeState,
    win.id,
    win.minWidth,
    win.minHeight,
    win.x,
    win.y,
    moveWindow,
    resizeWindow,
  ]);

  const handleClose = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      closeWindow(win.id);
    },
    [closeWindow, win.id]
  );

  const handleMinimize = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      minimizeWindow(win.id);
    },
    [minimizeWindow, win.id]
  );

  const handleMaximize = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      if (win.isMaximized) {
        restoreWindow(win.id);
      } else {
        maximizeWindow(win.id);
      }
    },
    [maximizeWindow, restoreWindow, win.id, win.isMaximized]
  );

  const handleDoubleClick = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      if (win.isMaximized) {
        restoreWindow(win.id);
      } else {
        maximizeWindow(win.id);
      }
    },
    [maximizeWindow, restoreWindow, win.id, win.isMaximized]
  );

  if (win.isMinimized) {
    return null;
  }

  const zIndex = calculateZIndex(win.id, windowOrder, win.isFocused);
  const isInteractiveMove = dragState.isDragging || resizeState.isResizing;

  return (
    <div
      ref={windowRef}
      className={`window ${win.isFocused ? 'focused' : ''} ${win.isMaximized ? 'maximized' : ''}`}
      style={{
        left: win.x,
        top: win.y,
        width: win.width,
        height: win.height,
        zIndex,
        // Animate maximize/restore; disable while dragging or resizing
        transition: isInteractiveMove
          ? 'none'
          : 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), top 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1), height 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease',
      }}
      data-program-id={win.programId}
      data-window-id={win.id}
      onMouseDown={handleMouseDown}
    >
      {/* Title Bar */}
      <div
        className="window-titlebar"
        onMouseDown={handleTitleBarMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        <span className="window-title">{win.title}</span>
        <div className="window-controls">
          <button
            className="window-control-btn window-control-close"
            onClick={handleClose}
            title="Close"
            aria-label="Close window"
          >
            <Icon name="close" size={8} />
          </button>
          <button
            className="window-control-btn window-control-minimize"
            onClick={handleMinimize}
            title="Minimize"
            aria-label="Minimize window"
          >
            <Icon name="minimize" size={8} />
          </button>
          <button
            className="window-control-btn window-control-maximize"
            onClick={handleMaximize}
            title={win.isMaximized ? 'Restore' : 'Maximize'}
            aria-label={win.isMaximized ? 'Restore window' : 'Maximize window'}
          >
            {win.isMaximized ? (
              <Icon name="restore" size={8} />
            ) : (
              <Icon name="maximize" size={8} />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="window-content">{win.component}</div>

      {/* Resize Handles */}
      {!win.isMaximized && (
        <>
          <div className="resize-handle resize-handle-n" onMouseDown={handleResizeMouseDown('n')} />
          <div className="resize-handle resize-handle-s" onMouseDown={handleResizeMouseDown('s')} />
          <div className="resize-handle resize-handle-e" onMouseDown={handleResizeMouseDown('e')} />
          <div className="resize-handle resize-handle-w" onMouseDown={handleResizeMouseDown('w')} />
          <div className="resize-handle resize-handle-ne" onMouseDown={handleResizeMouseDown('ne')} />
          <div className="resize-handle resize-handle-nw" onMouseDown={handleResizeMouseDown('nw')} />
          <div className="resize-handle resize-handle-se" onMouseDown={handleResizeMouseDown('se')} />
          <div className="resize-handle resize-handle-sw" onMouseDown={handleResizeMouseDown('sw')} />
        </>
      )}
    </div>
  );
});
