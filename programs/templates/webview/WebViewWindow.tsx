import { useState, useCallback, type FormEvent } from 'react';
import type { ProgramContext } from '@core/context';

interface WebViewWindowProps {
  ctx: ProgramContext;
  defaultUrl?: string;
}

/** WebView window template with toolbar navigation and sandboxed iframe. */
export function WebViewWindow({
  ctx: _ctx,
  defaultUrl = 'https://example.com',
}: WebViewWindowProps) {
  const [url, setUrl] = useState(defaultUrl);
  const [inputUrl, setInputUrl] = useState(defaultUrl);
  const [canGoBack, _setCanGoBack] = useState(false);
  const [canGoForward, _setCanGoForward] = useState(false);

  const handleNavigate = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      let newUrl = inputUrl.trim();
      if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
        newUrl = 'https://' + newUrl;
      }
      setUrl(newUrl);
    },
    [inputUrl]
  );

  const handleRefresh = useCallback(() => {
    setUrl((current) => current + '');
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          padding: 'var(--space-sm)',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg-tertiary)',
        }}
      >
        <button
          onClick={() => window.history.back()}
          disabled={!canGoBack}
          style={{
            padding: '4px 8px',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-primary)',
            cursor: canGoBack ? 'pointer' : 'not-allowed',
            opacity: canGoBack ? 1 : 0.5,
          }}
        >
          ←
        </button>
        <button
          onClick={() => window.history.forward()}
          disabled={!canGoForward}
          style={{
            padding: '4px 8px',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-primary)',
            cursor: canGoForward ? 'pointer' : 'not-allowed',
            opacity: canGoForward ? 1 : 0.5,
          }}
        >
          →
        </button>
        <button
          onClick={handleRefresh}
          style={{
            padding: '4px 8px',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-primary)',
            cursor: 'pointer',
          }}
        >
          ↻
        </button>

        <form onSubmit={handleNavigate} style={{ flex: 1 }}>
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 12px',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg-primary)',
              color: 'var(--color-text-primary)',
              fontSize: '13px',
              outline: 'none',
            }}
          />
        </form>
      </div>

      {/* WebView Content */}
      <iframe
        src={url}
        style={{
          flex: 1,
          border: 'none',
          background: 'white',
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title="WebView"
      />
    </div>
  );
}
