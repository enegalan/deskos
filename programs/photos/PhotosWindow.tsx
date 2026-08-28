import { useCallback, useEffect } from 'react';
import type { ProgramContext } from '@core/context';
import { useKernel } from '@core/kernel';
import { useWindowId, useWindowSessionState } from '@core/window-session';
import { Icon } from '../../components/Icon';

/** One image shown by the previewer. */
interface PreviewImage {
  /** URL of the image, served from `public/`. */
  src: string;
  /** File name, used for the caption and window title. */
  name: string;
}

/** Persisted previewer state (survives page reload). */
type PhotosPreviewState = {
  images: PreviewImage[];
  index: number;
  zoom: number;
  rotation: number;
};

/** Props for the Photos previewer window. */
interface PhotosWindowProps {
  /** Program context (used to close the window and update its title). */
  ctx: ProgramContext;
  /** Images for a fresh open; omitted on session restore. */
  initialImages?: PreviewImage[];
  /** Starting index for a fresh open. */
  initialStartIndex?: number;
}

/** Build initial preview state from open props when no session snapshot exists. */
function createInitialPreviewState(
  initialImages?: PreviewImage[],
  initialStartIndex = 0
): PhotosPreviewState {
  const images = initialImages ?? [];
  const index = Math.min(Math.max(initialStartIndex, 0), Math.max(images.length - 1, 0));
  return { images, index, zoom: 1, rotation: 0 };
}

/** Zoom limits and step for the zoom in / zoom out buttons. */
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

/** Each rotate button turns the image a quarter turn. */
const ROTATE_STEP = 90;

/** Round to avoid floating-point drift like 1.7500000000000002. */
const roundZoom = (value: number) => Math.round(value * 100) / 100;

/** Normalise a running rotation total to 0..359 degrees. */
const normalizeAngle = (deg: number) => ((deg % 360) + 360) % 360;

/**
 * Image previewer: shows one image fit to the window, with zoom and 90° rotate
 * controls. If more than one image was selected it becomes a carousel —
 * on-screen arrows or the Left/Right keys step through that selection only.
 * A single selected image has no arrows. Escape closes the window. Keyboard
 * events are handled by the focused window only, so several previewers open at
 * once don't move, zoom, rotate or close together.
 */
export function PhotosWindow({ ctx, initialImages, initialStartIndex }: PhotosWindowProps) {
  const windowId = useWindowId();
  const isActive = useKernel((state) => state.activeWindowId === windowId);

  const [preview, setPreview] = useWindowSessionState('preview', () =>
    createInitialPreviewState(initialImages, initialStartIndex)
  );
  const { images, index, zoom, rotation } = preview;
  const current = images[index] ?? images[0];

  // Restore without preview payload (or empty open) — nothing to show.
  useEffect(() => {
    if (!current) ctx.window.close(windowId);
  }, [ctx, windowId, current]);

  const goPrev = useCallback(
    () =>
      setPreview((p) => {
        if (p.images.length === 0) return p;
        return {
          ...p,
          index: (p.index - 1 + p.images.length) % p.images.length,
          zoom: 1,
          rotation: 0,
        };
      }),
    [setPreview]
  );
  const goNext = useCallback(
    () =>
      setPreview((p) => {
        if (p.images.length === 0) return p;
        return {
          ...p,
          index: (p.index + 1) % p.images.length,
          zoom: 1,
          rotation: 0,
        };
      }),
    [setPreview]
  );

  const zoomIn = useCallback(
    () =>
      setPreview((p) => ({
        ...p,
        zoom: roundZoom(Math.min(p.zoom + ZOOM_STEP, ZOOM_MAX)),
      })),
    [setPreview]
  );
  const zoomOut = useCallback(
    () =>
      setPreview((p) => ({
        ...p,
        zoom: roundZoom(Math.max(p.zoom - ZOOM_STEP, ZOOM_MIN)),
      })),
    [setPreview]
  );
  const rotateLeft = useCallback(
    () => setPreview((p) => ({ ...p, rotation: p.rotation - ROTATE_STEP })),
    [setPreview]
  );
  const rotateRight = useCallback(
    () => setPreview((p) => ({ ...p, rotation: p.rotation + ROTATE_STEP })),
    [setPreview]
  );

  // Back to fitted size and upright.
  const resetView = useCallback(
    () => setPreview((p) => ({ ...p, zoom: 1, rotation: 0 })),
    [setPreview]
  );

  // Keep the window title in sync with the visible image.
  useEffect(() => {
    if (!current) return;
    ctx.window.setTitle(windowId, current.name);
  }, [ctx, windowId, current]);

  const canNavigate = images.length > 1;
  const canZoomIn = zoom < ZOOM_MAX;
  const canZoomOut = zoom > ZOOM_MIN;
  const angle = normalizeAngle(rotation);
  const isPristine = zoom === 1 && angle === 0;

  // Keyboard (focused window only): Left/Right navigate, +/- zoom, [ ] rotate,
  // 0 resets, Escape closes.
  useEffect(() => {
    if (!isActive || !current) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        ctx.window.close(windowId);
      } else if (canNavigate && e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (canNavigate && e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '[') {
        e.preventDefault();
        rotateLeft();
      } else if (e.key === ']') {
        e.preventDefault();
        rotateRight();
      } else if (e.key === '0') {
        e.preventDefault();
        resetView();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isActive,
    current,
    ctx,
    windowId,
    canNavigate,
    goPrev,
    goNext,
    zoomIn,
    zoomOut,
    rotateLeft,
    rotateRight,
    resetView,
  ]);

  if (!current) return null;

  return (
    <div className="photos-viewer">
      <div className="photos-viewer-stage">
        {canNavigate && (
          <button
            className="photos-nav photos-nav-prev"
            onClick={goPrev}
            title="Previous (Left arrow)"
            aria-label="Previous image"
          >
            <Icon name="arrow-left" size={24} />
          </button>
        )}

        <img
          className="photos-viewer-image"
          src={current.src}
          alt={current.name}
          draggable={false}
          style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
        />

        {canNavigate && (
          <button
            className="photos-nav photos-nav-next"
            onClick={goNext}
            title="Next (Right arrow)"
            aria-label="Next image"
          >
            <Icon name="arrow-right" size={24} />
          </button>
        )}

        <div className="photos-tools photos-tools-left">
          <button
            className="photos-tool-btn"
            onClick={rotateLeft}
            title="Rotate left 90° ([)"
            aria-label="Rotate left 90 degrees"
          >
            <Icon name="rotate-left" size={20} />
          </button>
          <button
            className="photos-tool-btn"
            onClick={rotateRight}
            title="Rotate right 90° (])"
            aria-label="Rotate right 90 degrees"
          >
            <Icon name="rotate-right" size={20} />
          </button>
        </div>

        <div className="photos-tools photos-tools-right">
          <button
            className="photos-tool-btn"
            onClick={zoomOut}
            disabled={!canZoomOut}
            title="Zoom out (-)"
            aria-label="Zoom out"
          >
            <Icon name="zoom-out" size={20} />
          </button>
          <button
            className="photos-tool-btn photos-tool-reset"
            onClick={resetView}
            disabled={isPristine}
            title="Reset zoom and rotation (0)"
            aria-label="Reset zoom and rotation"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="photos-tool-btn"
            onClick={zoomIn}
            disabled={!canZoomIn}
            title="Zoom in (+)"
            aria-label="Zoom in"
          >
            <Icon name="zoom-in" size={20} />
          </button>
        </div>
      </div>

      <div className="photos-viewer-caption">
        {current.name}
        {canNavigate ? ` · ${index + 1} / ${images.length}` : ''}
        {zoom !== 1 ? ` · ${Math.round(zoom * 100)}%` : ''}
        {angle !== 0 ? ` · ${angle}°` : ''}
      </div>
    </div>
  );
}
