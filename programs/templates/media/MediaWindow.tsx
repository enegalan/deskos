import { useState, useRef, useCallback, type ChangeEvent } from 'react';
import type { ProgramContext } from '@core/context';
import { Icon } from '../../../components/Icon';

interface MediaWindowProps {
  ctx: ProgramContext;
}

export function MediaWindow({ ctx: _ctx }: MediaWindowProps) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'audio' | 'video' | null>(null);
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
          <Icon name="music" size={48} color="var(--color-text-secondary)" />
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
        />
      )}

      {mediaUrl && mediaType === 'audio' && (
        <div style={{ textAlign: 'center', width: '100%' }}>
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <Icon name="music" size={64} color="var(--color-text-secondary)" />
          </div>
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={mediaUrl}
            controls
            style={{ width: '100%' }}
          />
        </div>
      )}

      {mediaUrl && (
        <button
          onClick={() => {
            setMediaUrl(null);
            setMediaType(null);
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
