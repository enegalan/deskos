import { useCallback, useEffect, useState } from 'react';
import type { ProgramContext } from '@core/context';
import { useKernel } from '@core/kernel';
import { useWindowId } from '@core/window-session';
import { Icon } from '../../components/Icon';

/** One image shown by the previewer. */
interface PreviewImage {
  /** URL of the image, served from `public/`. */
  src: string;
  /** File name, used for the caption and window title. */
  name: string;
}

/** Props for the Photos previewer window. */
interface PhotosWindowProps {
  /** Program context (used to close the window and update its title). */
  ctx: ProgramContext;
  /** The images to browse — only what the user selected before previewing. */
  images: PreviewImage[];
  /** Index of the image to show first. */
  startIndex: number;
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
export function PhotosWindow({ ctx, images, startIndex }: PhotosWindowProps) {
  const windowId = useWindowId();
  const isActive = useKernel((state) => state.activeWindowId === windowId);

  const [index, setIndex] = useState(() =>
    Math.min(Math.max(startIndex, 0), Math.max(images.length - 1, 0))
  );
  const [zoom, setZoom] = useState(1);
  // Running total in degrees; can go negative or past 360 as the user rotates.
  const [rotation, setRotation] = useState(0);

  const current = images[index] ?? images[0];
  const canNavigate = images.length > 1;
  const canZoomIn = zoom < ZOOM_MAX;
  const canZoomOut = zoom > ZOOM_MIN;
  const angle = normalizeAngle(rotation);
  const isPristine = zoom === 1 && angle === 0;

  const goPrev = useCallback(
    () => setIndex((i) => (i - 1 + images.length) % images.length),
    [images.length]
  );
  const goNext = useCallback(() => setIndex((i) => (i + 1) % images.length), [images.length]);

  const zoomIn = useCallback(
    () => setZoom((z) => roundZoom(Math.min(z + ZOOM_STEP, ZOOM_MAX))),
    []
  );
  const zoomOut = useCallback(
    () => setZoom((z) => roundZoom(Math.max(z - ZOOM_STEP, ZOOM_MIN))),
    []
  );
  const rotateLeft = useCallback(() => setRotation((r) => r - ROTATE_STEP), []);
  const rotateRight = useCallback(() => setRotation((r) => r + ROTATE_STEP), []);

  // Back to fitted size and upright.
  const resetView = useCallback(() => {
    setZoom(1);
    setRotation(0);
  }, []);

  // A new image always starts fitted and upright.
  useEffect(() => {
    resetView();
  }, [index, resetView]);

  // Keep the window title in sync with the visible image.
  useEffect(() => {
    ctx.window.setTitle(windowId, current.name);
  }, [ctx, windowId, current.name]);

  // Keyboard (focused window only): Left/Right navigate, +/- zoom, [ ] rotate,
  // 0 resets, Escape closes.
  useEffect(() => {
    if (!isActive) return;
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
