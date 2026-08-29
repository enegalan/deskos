import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProgramContext } from '@core/context';
import { useKernel } from '@core/kernel';
import { flushSessionPersist, getWindowSessionState, setWindowSessionState } from '@core/session';
import { useWindowId, useWindowSessionState } from '@core/window-session';
import { Icon } from '../../components/Icon';

/** One track shown by the player. */
interface PreviewTrack {
  /** URL of the audio, served from `public/`. */
  src: string;
  /** File name, used for the caption and window title. */
  name: string;
}

/** Persisted player state (survives page reload). */
type MusicPreviewState = {
  tracks: PreviewTrack[];
  index: number;
  muted: boolean;
  /** Playback volume from 0 (silent) to 1 (full). */
  volume: number;
  /** Playback position in seconds for the current playlist index. */
  currentTime: number;
};

/** Props for the Music player window. */
interface MusicWindowProps {
  /** Program context (used to close the window and update its title). */
  ctx: ProgramContext;
  /** Tracks for a fresh open; omitted on session restore. */
  initialTracks?: PreviewTrack[];
  /** Starting index for a fresh open. */
  initialStartIndex?: number;
}

/** Clamp volume to the 0..1 range. */
const clampVolume = (value: number) => Math.min(Math.max(value, 0), 1);

/** Keyboard / button step for volume up / down. */
const VOLUME_STEP = 0.05;

/** How often to write playback position into the session while playing. */
const POSITION_PERSIST_MS = 1000;

/** Build initial player state from open props when no session snapshot exists. */
function createInitialPreviewState(
  initialTracks?: PreviewTrack[],
  initialStartIndex = 0
): MusicPreviewState {
  const tracks = initialTracks ?? [];
  const index = Math.min(Math.max(initialStartIndex, 0), Math.max(tracks.length - 1, 0));
  return { tracks, index, muted: false, volume: 1, currentTime: 0 };
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
 * Music player: plays one track with play/pause, volume, mute, and seek
 * controls. Chrome stays visible. If more than one track was selected it
 * becomes a playlist — on-screen arrows or the Left/Right keys step through
 * that selection only. Escape closes the window. Keyboard events are handled
 * by the focused window only.
 */
export function MusicWindow({ ctx, initialTracks, initialStartIndex }: MusicWindowProps) {
  const windowId = useWindowId();
  const isActive = useKernel((state) => state.activeWindowId === windowId);
  const audioRef = useRef<HTMLAudioElement>(null);
  /** Last time playback position was written to session state. */
  const lastPositionPersistRef = useRef(0);
  /** Position to seek to once metadata is ready (session restore / after seek). */
  const restoreTimeRef = useRef(0);

  const [preview, setPreview] = useWindowSessionState('preview', () =>
    createInitialPreviewState(initialTracks, initialStartIndex)
  );
  const { tracks, index, muted, volume, currentTime: savedTime } = preview;
  const current = tracks[index] ?? tracks[0];
  // Older session snapshots may omit volume / currentTime.
  const safeVolume = clampVolume(typeof volume === 'number' ? volume : 1);
  const safeSavedTime = typeof savedTime === 'number' && savedTime > 0 ? savedTime : 0;

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(safeSavedTime);
  const [duration, setDuration] = useState(0);

  // Keep restore target in sync after commit (playlist change → 0; reload keeps saved).
  useEffect(() => {
    restoreTimeRef.current = safeSavedTime;
  }, [safeSavedTime]);

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
    const el = audioRef.current;
    if (!el) return;
    const time = el.currentTime;
    setCurrentTime(time);
    const saved = getWindowSessionState(windowId, 'preview');
    if (saved && typeof saved === 'object') {
      setWindowSessionState(windowId, 'preview', {
        ...(saved as MusicPreviewState),
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

  // Restore without preview payload (or empty open) — nothing to show.
  useEffect(() => {
    if (!current) ctx.window.close(windowId);
  }, [ctx, windowId, current]);

  // Keep the <audio> element volume in sync with persisted state.
  useEffect(() => {
    const el = audioRef.current;
    if (el) el.volume = safeVolume;
  }, [safeVolume]);

  const goPrev = useCallback(
    () =>
      setPreview((p) => {
        if (p.tracks.length === 0) return p;
        return {
          ...p,
          index: (p.index - 1 + p.tracks.length) % p.tracks.length,
          currentTime: 0,
        };
      }),
    [setPreview]
  );
  const goNext = useCallback(
    () =>
      setPreview((p) => {
        if (p.tracks.length === 0) return p;
        return {
          ...p,
          index: (p.index + 1) % p.tracks.length,
          currentTime: 0,
        };
      }),
    [setPreview]
  );

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
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
      const el = audioRef.current;
      if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
      const time = Math.min(Math.max(ratio, 0), 1) * el.duration;
      el.currentTime = time;
      setCurrentTime(time);
      persistPosition(time, true);
    },
    [persistPosition]
  );

  // Keep the window title in sync with the visible track.
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
    const el = audioRef.current;
    if (!el || !currentSrc) return;
    el.load();
    void el.play().catch(() => {
      // Autoplay may be blocked until the user interacts.
    });
  }, [currentSrc]);

  const canNavigate = tracks.length > 1;
  const progress = duration > 0 ? currentTime / duration : 0;

  // Keyboard (focused window only): Left/Right navigate, Space play/pause,
  // M mute, Up/Down volume, Escape closes.
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
  ]);

  const isSilent = muted || safeVolume === 0;

  if (!current) return null;

  return (
    <div className="music-viewer">
      <div className="music-viewer-stage">
        {canNavigate && (
          <button
            className="music-nav music-nav-prev"
            onClick={goPrev}
            title="Previous (Left arrow)"
            aria-label="Previous track"
          >
            <Icon name="arrow-left" size={24} />
          </button>
        )}

        <div className="music-viewer-art" onClick={togglePlay} role="presentation">
          <Icon name="music" size={48} />
          <audio
            ref={audioRef}
            className="music-viewer-audio"
            src={current.src}
            muted={muted}
            onPlay={() => setPlaying(true)}
            onPause={() => {
              setPlaying(false);
              const el = audioRef.current;
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
        </div>

        {canNavigate && (
          <button
            className="music-nav music-nav-next"
            onClick={goNext}
            title="Next (Right arrow)"
            aria-label="Next track"
          >
            <Icon name="arrow-right" size={24} />
          </button>
        )}

        <div className="music-tools">
          <button
            className="music-tool-btn"
            onClick={togglePlay}
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            <Icon name={playing ? 'pause' : 'play'} size={20} />
          </button>

          <button
            className="music-tool-btn"
            onClick={toggleMute}
            title={isSilent ? 'Unmute (M)' : 'Mute (M)'}
            aria-label={isSilent ? 'Unmute' : 'Mute'}
          >
            <Icon name={isSilent ? 'volume-mute' : 'volume'} size={20} />
          </button>

          <input
            className="music-volume-range"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isSilent ? 0 : safeVolume}
            aria-label="Volume"
            title={`Volume ${Math.round((isSilent ? 0 : safeVolume) * 100)}%`}
            onChange={(e) => setVolume(Number(e.target.value))}
          />

          <div className="music-seek">
            <span className="music-time">{formatTime(currentTime)}</span>
            <input
              className="music-seek-range"
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={progress}
              aria-label="Seek"
              onChange={(e) => seekTo(Number(e.target.value))}
            />
            <span className="music-time">{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      <div className="music-viewer-caption">
        {current.name}
        {canNavigate ? ` · ${index + 1} / ${tracks.length}` : ''}
      </div>
    </div>
  );
}
