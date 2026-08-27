import { useState, useRef, useCallback, type ChangeEvent } from 'react';
import type { ProgramContext } from '@core/context';

interface MediaWindowProps {
  ctx: ProgramContext;
}

export function MediaWindow({ ctx }: MediaWindowProps) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'audio' | 'video' | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setMediaUrl(url);

    if (file.type.startsWith('audio/')) {
      setMediaType('audio');
    } else if (file.type.startsWith('video/')) {
      setMediaType('video');
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;

    if (media.paused) {
      media.play();
      setIsPlaying(true);
    } else {
      media.pause();
      setIsPlaying(false);
    }
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 'var(--space-lg)',
        gap: 'var(--space-md)',
      }}
    >
      {!mediaUrl && (
        <>
          <span style={{ fontSize: '48px' }}>🎵</span>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
            Select an audio or video file to play
          </p>
          <label
            style={{
              padding: 'var(--space-sm) var(--space-lg)',
              background: 'var(--color-accent)',
              color: 'white',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              transition: 'background var(--transition-fast)',
            }}
          >
            Choose File
            <input
              type="file"
              accept="audio/*,video/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </label>
        </>
      )}

      {mediaUrl && mediaType === 'video' && (
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={mediaUrl}
          controls
          style={{ maxWidth: '100%', maxHeight: 'calc(100% - 60px)', borderRadius: 'var(--radius-md)' }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      )}

      {mediaUrl && mediaType === 'audio' && (
        <div style={{ textAlign: 'center', width: '100%' }}>
          <span style={{ fontSize: '64px', display: 'block', marginBottom: 'var(--space-lg)' }}>
            {isPlaying ? '🎶' : '🎵'}
          </span>
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={mediaUrl}
            controls
            style={{ width: '100%' }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        </div>
      )}

      {mediaUrl && (
        <button
          onClick={() => {
            setMediaUrl(null);
            setMediaType(null);
            setIsPlaying(false);
          }}
          style={{
            padding: 'var(--space-xs) var(--space-md)',
            background: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-secondary)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Choose Another File
        </button>
      )}
    </div>
  );
}
