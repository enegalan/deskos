import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { dialog, type DialogRequest } from '@core/dialog';

/** Host for the shared system alert / confirm / prompt dialog. */
export function DialogContainer() {
  const [current, setCurrent] = useState<DialogRequest | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [promptError, setPromptError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return dialog.subscribe((next) => {
      setCurrent(next);
      setPromptValue(next?.defaultValue ?? '');
      setPromptError('');
    });
  }, []);

  useEffect(() => {
    if (!current) return;
    if (current.kind === 'prompt') {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [current]);

  useEffect(() => {
    if (!current) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && current.kind !== 'alert') {
        e.preventDefault();
        dialog.close(current.id, current.kind === 'confirm' ? false : null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current]);

  if (!current) return null;

  const closeAlert = () => dialog.close(current.id, undefined);
  const closeConfirm = (ok: boolean) => dialog.close(current.id, ok);
  const closePrompt = (value: string | null) => dialog.close(current.id, value);

  const trySubmitPrompt = () => {
    if (current.required && !promptValue.trim()) {
      setPromptError('A value is required');
      inputRef.current?.focus();
      return;
    }
    closePrompt(promptValue);
  };

  const handlePromptSubmit = (e: FormEvent) => {
    e.preventDefault();
    trySubmitPrompt();
  };

  const handlePromptKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      trySubmitPrompt();
    }
  };

  return (
    <div
      className="system-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && current.kind !== 'alert') {
          dialog.close(current.id, current.kind === 'confirm' ? false : null);
        }
      }}
    >
      <div
        className="system-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-dialog-title"
        aria-describedby="system-dialog-message"
      >
        <h2 id="system-dialog-title" className="system-dialog-title">
          {current.title}
        </h2>
        <p id="system-dialog-message" className="system-dialog-message">
          {current.message}
        </p>

        {current.kind === 'prompt' && (
          <form className="system-dialog-form" onSubmit={handlePromptSubmit}>
            <input
              ref={inputRef}
              className={`system-dialog-input${promptError ? ' system-dialog-input-error' : ''}`}
              type="text"
              value={promptValue}
              aria-label={current.title}
              aria-invalid={promptError ? true : undefined}
              aria-required={current.required || undefined}
              aria-describedby={promptError ? 'system-dialog-prompt-error' : undefined}
              onChange={(e) => {
                setPromptValue(e.target.value);
                if (promptError) setPromptError('');
              }}
              onKeyDown={handlePromptKeyDown}
            />
            {promptError && (
              <p id="system-dialog-prompt-error" className="system-dialog-error">
                {promptError}
              </p>
            )}
          </form>
        )}

        <div className="system-dialog-actions">
          {current.kind !== 'alert' && (
            <button
              type="button"
              className="system-dialog-btn"
              onClick={() => (current.kind === 'confirm' ? closeConfirm(false) : closePrompt(null))}
            >
              {current.cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={`system-dialog-btn system-dialog-btn-primary${
              current.danger ? ' system-dialog-btn-danger' : ''
            }`}
            onClick={() => {
              if (current.kind === 'alert') closeAlert();
              else if (current.kind === 'confirm') closeConfirm(true);
              else trySubmitPrompt();
            }}
          >
            {current.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
