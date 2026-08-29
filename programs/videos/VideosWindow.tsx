import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProgramContext } from '@core/context';
import { useKernel } from '@core/kernel';
import { flushSessionPersist, getWindowSessionState, setWindowSessionState } from '@core/session';
import { useWindowId, useWindowSessionState } from '@core/window-session';
import { Icon } from '../../components/Icon';

/** One video shown by the player. */
interface PreviewVideo {
  /** URL of the video, served from `public/`. */
  src: string;
  /** File name, used for the caption and window title. */
  name: string;
}

/** Persisted player state (survives page reload). */
type VideosPreviewState = {
  videos: PreviewVideo[];
  index: number;
  muted: boolean;
  /** Playback volume from 0 (silent) to 1 (full). */
  volume: number;
  /** Playback position in seconds for the current playlist index. */
  currentTime: number;
};

/** Props for the Videos player window. */
interface VideosWindowProps {
  /** Program context (used to close the window and update its title). */
  ctx: ProgramContext;
  /** Videos for a fresh open; omitted on session restore. */
  initialVideos?: PreviewVideo[];
  /** Starting index for a fresh open. */
  initialStartIndex?: number;
}

/** Clamp volume to the 0..1 range. */
const clampVolume = (value: number) => Math.min(Math.max(value, 0), 1);

/** Keyboard / button step for volume up / down. */
const VOLUME_STEP = 0.05;

/** Hide chrome after this many ms of mouse inactivity while playing. */
const CONTROLS_HIDE_MS = 1000;

/** How often to write playback position into the session while playing. */
const POSITION_PERSIST_MS = 1000;

/** Build initial player state from open props when no session snapshot exists. */
function createInitialPreviewState(
  initialVideos?: PreviewVideo[],
  initialStartIndex = 0
): VideosPreviewState {
  const videos = initialVideos ?? [];
  const index = Math.min(Math.max(initialStartIndex, 0), Math.max(videos.length - 1, 0));
  return { videos, index, muted: false, volume: 1, currentTime: 0 };
}

/** Format seconds as m:ss or h:mm:ss. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Video player: shows one video fit to the window, with play/pause, volume,
 * mute, and seek controls. Chrome auto-hides after mouse inactivity while
 * playing so the frame stays clear. If more than one video was selected it
 * becomes a playlist — on-screen arrows or the Left/Right keys step through
 * that selection only. Escape closes the window. Keyboard events are handled
 * by the focused window only.
 */
export function VideosWindow({ ctx, initialVideos, initialStartIndex }: VideosWindowProps) {
  const windowId = useWindowId();
  const isActive = useKernel((state) => state.activeWindowId === windowId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True while the pointer is over nav/tools — keep chrome visible. */
  const pointerOnChromeRef = useRef(false);
  /** Last time playback position was written to session state. */
  const lastPositionPersistRef = useRef(0);
  /** Position to seek to once metadata is ready (session restore / after seek). */
  const restoreTimeRef = useRef(0);

  const [preview, setPreview] = useWindowSessionState('preview', () =>
    createInitialPreviewState(initialVideos, initialStartIndex)
  );
  const { videos, index, muted, volume, currentTime: savedTime } = preview;
  const current = videos[index] ?? videos[0];
  // Older session snapshots may omit volume / currentTime.
  const safeVolume = clampVolume(typeof volume === 'number' ? volume : 1);
  const safeSavedTime = typeof savedTime === 'number' && savedTime > 0 ? savedTime : 0;

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(safeSavedTime);
  const [duration, setDuration] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);

  // Keep restore target in sync (playlist change resets to 0; reload keeps saved).
  restoreTimeRef.current = safeSavedTime;

  /** Write playback position into session state (throttled or forced). */
  const persistPosition = useCallback(
    (time: number, force = false) => {
      const now = Date.now();
      if (!force && now - lastPositionPersistRef.current < POSITION_PERSIST_MS) return;
      lastPositionPersistRef.current = now;
      setPreview((p) => {
        const prev = typeof p.currentTime === 'number' ? p.currentTime : 0;
        if (Math.abs(prev - time) < 0.2) return p;
        return { ...p, currentTime: time };
      });
    },
    [setPreview]
  );

  /** Sync in-memory session + flush disk so a reload keeps the exact second. */
  const flushPositionNow = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const time = el.currentTime;
    setCurrentTime(time);
    const saved = getWindowSessionState(windowId, 'preview');
    if (saved && typeof saved === 'object') {
      setWindowSessionState(windowId, 'preview', {
        ...(saved as VideosPreviewState),
        currentTime: time,
      });
    }
    flushSessionPersist();
  }, [windowId]);

  useEffect(() => {
    window.addEventListener('pagehide', flushPositionNow);
    window.addEventListener('beforeunload', flushPositionNow);
    return () => {
      window.removeEventListener('pagehide', flushPositionNow);
      window.removeEventListener('beforeunload', flushPositionNow);
    };
  }, [flushPositionNow]);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  /** Show chrome and, while playing, schedule a hide after idle. */
  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    clearHideTimer();
    if (!playing || pointerOnChromeRef.current) return;
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      if (!pointerOnChromeRef.current) setControlsVisible(false);
    }, CONTROLS_HIDE_MS);
  }, [playing, clearHideTimer]);

  // Pause → always show chrome. Play → start the idle hide timer.
  useEffect(() => {
    if (!playing) {
      clearHideTimer();
      setControlsVisible(true);
      return;
    }
    bumpControls();
    return clearHideTimer;
  }, [playing, bumpControls, clearHideTimer]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  // Restore without preview payload (or empty open) — nothing to show.
  useEffect(() => {
    if (!current) ctx.window.close(windowId);
  }, [ctx, windowId, current]);

  // Keep the <video> element volume in sync with persisted state.
  useEffect(() => {
    const el = videoRef.current;
    if (el) el.volume = safeVolume;
  }, [safeVolume]);

  const goPrev = useCallback(
    () =>
      setPreview((p) => {
        if (p.videos.length === 0) return p;
        return {
          ...p,
          index: (p.index - 1 + p.videos.length) % p.videos.length,
          currentTime: 0,
        };
      }),
    [setPreview]
  );
  const goNext = useCallback(
    () =>
      setPreview((p) => {
        if (p.videos.length === 0) return p;
        return {
          ...p,
          index: (p.index + 1) % p.videos.length,
          currentTime: 0,
        };
      }),
    [setPreview]
  );

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  }, []);

  const toggleMute = useCallback(
    () => setPreview((p) => ({ ...p, muted: !p.muted })),
    [setPreview]
  );

  const setVolume = useCallback(
    (next: number) => {
      const clamped = clampVolume(next);
      setPreview((p) => ({
        ...p,
        volume: clamped,
        // Dragging to silence mutes; any audible level unmutes.
        muted: clamped === 0,
      }));
    },
    [setPreview]
  );

  const seekTo = useCallback(
    (ratio: number) => {
      const el = videoRef.current;
      if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
      const time = Math.min(Math.max(ratio, 0), 1) * el.duration;
      el.currentTime = time;
      setCurrentTime(time);
      persistPosition(time, true);
    },
    [persistPosition]
  );

  // Keep the window title in sync with the visible video.
  useEffect(() => {
    if (!current) return;
    ctx.window.setTitle(windowId, current.name);
  }, [ctx, windowId, current]);

  // Reload the element when the source changes; restore seek happens in
  // onLoadedMetadata from restoreTimeRef (session value or 0 after playlist step).
  const currentSrc = current?.src;
  useEffect(() => {
    setDuration(0);
    setPlaying(false);
    setCurrentTime(restoreTimeRef.current);
    lastPositionPersistRef.current = 0;
    const el = videoRef.current;
    if (!el || !currentSrc) return;
    el.load();
    void el.play().catch(() => {
      // Autoplay may be blocked until the user interacts.
    });
  }, [currentSrc]);

  const canNavigate = videos.length > 1;
  const progress = duration > 0 ? currentTime / duration : 0;

  // Keyboard (focused window only): Left/Right navigate, Space play/pause,
  // M mute, Up/Down volume, Escape closes. Any key also reveals chrome.
  useEffect(() => {
    if (!isActive || !current) return;
    const onKeyDown = (e: KeyboardEvent) => {
      bumpControls();
      if (e.key === 'Escape') {
        e.preventDefault();
        ctx.window.close(windowId);
      } else if (canNavigate && e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (canNavigate && e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setVolume(safeVolume + VOLUME_STEP);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setVolume(safeVolume - VOLUME_STEP);
      } else if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
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
    togglePlay,
    toggleMute,
    setVolume,
    safeVolume,
    bumpControls,
  ]);

  const isSilent = muted || safeVolume === 0;
  const chromeClass = controlsVisible ? '' : ' videos-chrome-hidden';

  if (!current) return null;

  return (
    <div className={`videos-viewer${chromeClass}`}>
      <div className="videos-viewer-stage" onMouseMove={bumpControls}>
        {canNavigate && (
          <button
            className="videos-nav videos-nav-prev"
            onClick={goPrev}
            onMouseEnter={() => {
              pointerOnChromeRef.current = true;
              bumpControls();
            }}
            onMouseLeave={() => {
              pointerOnChromeRef.current = false;
              bumpControls();
            }}
            title="Previous (Left arrow)"
            aria-label="Previous video"
          >
            <Icon name="arrow-left" size={24} />
          </button>
        )}

        <video
          ref={videoRef}
          className="videos-viewer-video"
          src={current.src}
          muted={muted}
          playsInline
          onClick={togglePlay}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            const el = videoRef.current;
            if (el) persistPosition(el.currentTime, true);
          }}
          onTimeUpdate={(e) => {
            const time = e.currentTarget.currentTime;
            setCurrentTime(time);
            persistPosition(time);
          }}
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            setDuration(el.duration);
            const target = restoreTimeRef.current;
            if (target > 0 && Number.isFinite(el.duration) && target < el.duration) {
              el.currentTime = target;
              setCurrentTime(target);
            }
          }}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => {
            if (canNavigate) goNext();
          }}
        />

        {canNavigate && (
          <button
            className="videos-nav videos-nav-next"
            onClick={goNext}
            onMouseEnter={() => {
              pointerOnChromeRef.current = true;
              bumpControls();
            }}
            onMouseLeave={() => {
              pointerOnChromeRef.current = false;
              bumpControls();
            }}
            title="Next (Right arrow)"
            aria-label="Next video"
          >
            <Icon name="arrow-right" size={24} />
          </button>
        )}

        <div
          className="videos-tools"
          onMouseEnter={() => {
            pointerOnChromeRef.current = true;
            bumpControls();
          }}
          onMouseLeave={() => {
            pointerOnChromeRef.current = false;
            bumpControls();
          }}
        >
          <button
            className="videos-tool-btn"
            onClick={togglePlay}
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            <Icon name={playing ? 'pause' : 'play'} size={20} />
          </button>

          <button
            className="videos-tool-btn"
            onClick={toggleMute}
            title={isSilent ? 'Unmute (M)' : 'Mute (M)'}
            aria-label={isSilent ? 'Unmute' : 'Mute'}
          >
            <Icon name={isSilent ? 'volume-mute' : 'volume'} size={20} />
          </button>

          <input
            className="videos-volume-range"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isSilent ? 0 : safeVolume}
            aria-label="Volume"
            title={`Volume ${Math.round((isSilent ? 0 : safeVolume) * 100)}%`}
            onChange={(e) => setVolume(Number(e.target.value))}
          />

          <div className="videos-seek">
            <span className="videos-time">{formatTime(currentTime)}</span>
            <input
              className="videos-seek-range"
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={progress}
              aria-label="Seek"
              onChange={(e) => seekTo(Number(e.target.value))}
            />
            <span className="videos-time">{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      <div className="videos-viewer-caption">
        {current.name}
        {canNavigate ? ` · ${index + 1} / ${videos.length}` : ''}
      </div>
    </div>
  );
}
