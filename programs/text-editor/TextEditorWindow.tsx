import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProgramContext } from '@core/context';
import { useWindowId, useWindowSessionState } from '@core/window-session';
import { getFileById, updateFileContent } from '@core/desktop-shortcuts';

/** Debounce interval for persisting edits to VFS. */
const SAVE_DEBOUNCE_MS = 300;

/** Props for the Text Editor window. */
interface TextEditorWindowProps {
  /** Program context (window title updates). */
  ctx: ProgramContext;
  /** VFS file id when opened from the desktop / folder; omitted for blank buffer. */
  fileId?: string;
}

/** Simple full-window textarea editor for user-created files. */
export function TextEditorWindow({ ctx, fileId: initialFileId }: TextEditorWindowProps) {
  const windowId = useWindowId();
  const [fileId] = useWindowSessionState<string | undefined>('fileId', initialFileId);
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('Untitled');
  const saveTimerRef = useRef<number | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    if (!fileId) {
      setContent('');
      setFileName('Untitled');
      ctx.window.setTitle(windowId, 'Untitled');
      return;
    }

    const file = getFileById(fileId);
    if (!file) {
      setContent('');
      setFileName('Untitled');
      ctx.window.setTitle(windowId, 'Untitled');
      return;
    }

    setContent(file.content);
    setFileName(file.name);
    ctx.window.setTitle(windowId, file.name);
  }, [fileId, ctx.window, windowId]);

  // Keep title in sync if the file is renamed elsewhere.
  useEffect(() => {
    if (!fileId) return;
    const sync = () => {
      const file = getFileById(fileId);
      if (!file) return;
      setFileName(file.name);
      ctx.window.setTitle(windowId, file.name);
    };
    window.addEventListener('desktop-shortcuts-updated', sync);
    return () => window.removeEventListener('desktop-shortcuts-updated', sync);
  }, [fileId, ctx.window, windowId]);

  const persist = useCallback(
    (next: string) => {
      if (!fileId) return;
      updateFileContent(fileId, next);
    },
    [fileId]
  );

  const handleChange = useCallback(
    (value: string) => {
      setContent(value);
      if (!fileId) return;
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        persist(value);
      }, SAVE_DEBOUNCE_MS);
    },
    [fileId, persist]
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        if (fileId) persist(contentRef.current);
      }
    };
  }, [fileId, persist]);

  return (
    <div className="text-editor-window">
      <textarea
        className="text-editor-textarea"
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        spellCheck={false}
        aria-label={fileName}
        placeholder={fileId ? '' : 'Start typing…'}
      />
    </div>
  );
}
