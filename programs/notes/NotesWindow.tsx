import { useState, useEffect, useCallback } from 'react';
import type { ProgramContext } from '@core/context';
import { useWindowSessionState } from '@core/window-session';

/** Single note document stored by the Notes program. */
interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

/** Props for the Notes program window. */
interface NotesWindowProps {
  /** Program context (storage + events) */
  ctx: ProgramContext;
}

/** Notes app UI: list, editor, and cross-window sync via program events. */
export function NotesWindow({ ctx }: NotesWindowProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useWindowSessionState<string | null>(
    'selectedNoteId',
    null
  );

  // Load notes from storage on mount
  useEffect(() => {
    const savedNotes = ctx.storage.getItem<Note[]>('notes');
    if (savedNotes && savedNotes.length > 0) {
      setNotes(savedNotes);
      setSelectedNoteId((current) =>
        current && savedNotes.some((note) => note.id === current) ? current : savedNotes[0].id
      );
    }
  }, [ctx.storage, setSelectedNoteId]);

  // Save notes to storage whenever they change
  useEffect(() => {
    if (notes.length > 0) {
      ctx.storage.setItem('notes', notes);
    }
  }, [notes, ctx.storage]);

  const selectedNote = notes.find((n) => n.id === selectedNoteId);

  const createNote = useCallback(() => {
    const newNote: Note = {
      id: `note-${Date.now()}`,
      title: 'Untitled Note',
      content: '',
      updatedAt: Date.now(),
    };
    setNotes((prev) => [newNote, ...prev]);
    setSelectedNoteId(newNote.id);

    // Emit event for other windows to sync
    ctx.events.emit('note:created', newNote);
  }, [ctx.events, setSelectedNoteId]);

  const updateNote = useCallback(
    (id: string, updates: Partial<Note>) => {
      setNotes((prev) =>
        prev.map((note) => (note.id === id ? { ...note, ...updates, updatedAt: Date.now() } : note))
      );

      // Emit event for sync
      ctx.events.emit('note:updated', { id, updates });
    },
    [ctx.events]
  );

  const deleteNote = useCallback(
    (id: string) => {
      setNotes((prev) => {
        const newNotes = prev.filter((n) => n.id !== id);
        if (selectedNoteId === id) {
          setSelectedNoteId(newNotes.length > 0 ? newNotes[0].id : null);
        }
        return newNotes;
      });

      ctx.events.emit('note:deleted', { id });
    },
    [selectedNoteId, ctx.events]
  );

  // Listen for events from other windows
  useEffect(() => {
    const unsubCreated = ctx.events.on<Note>('note:created', (note) => {
      if (note) {
        setNotes((prev) => {
          if (prev.some((n) => n.id === note.id)) return prev;
          return [note, ...prev];
        });
      }
    });

    const unsubUpdated = ctx.events.on<{ id: string; updates: Partial<Note> }>(
      'note:updated',
      (data) => {
        if (data) {
          setNotes((prev) =>
            prev.map((note) => (note.id === data.id ? { ...note, ...data.updates } : note))
          );
        }
      }
    );

    const unsubDeleted = ctx.events.on<{ id: string }>('note:deleted', (data) => {
      if (data) {
        setNotes((prev) => prev.filter((n) => n.id !== data.id));
      }
    });

    return () => {
      unsubCreated();
      unsubUpdated();
      unsubDeleted();
    };
  }, [ctx.events]);

  return (
    <div className="notes-container">
      {/* Sidebar */}
      <div className="notes-sidebar">
        <div className="notes-list">
          {notes.map((note) => (
            <button
              key={note.id}
              className={`notes-item ${note.id === selectedNoteId ? 'active' : ''}`}
              onClick={() => setSelectedNoteId(note.id)}
            >
              <div className="notes-item-title">{note.title || 'Untitled'}</div>
              <div className="notes-item-preview">{note.content.slice(0, 50) || 'No content'}</div>
            </button>
          ))}

          {notes.length === 0 && (
            <div
              style={{
                padding: 'var(--space-md)',
                color: 'var(--color-text-muted)',
                textAlign: 'center',
                fontSize: '13px',
              }}
            >
              No notes yet
            </div>
          )}
        </div>

        <button className="notes-new-btn" onClick={createNote}>
          + New Note
        </button>
      </div>

      {/* Editor */}
      <div className="notes-editor">
        {selectedNote ? (
          <>
            <input
              type="text"
              className="notes-editor-title"
              value={selectedNote.title}
              onChange={(e) => updateNote(selectedNote.id, { title: e.target.value })}
              placeholder="Note title..."
            />
            <textarea
              className="notes-editor-content"
              value={selectedNote.content}
              onChange={(e) => updateNote(selectedNote.id, { content: e.target.value })}
              placeholder="Start writing..."
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-sm) var(--space-md)',
                borderTop: '1px solid var(--color-border)',
                fontSize: '11px',
                color: 'var(--color-text-muted)',
              }}
            >
              <span>Last updated: {new Date(selectedNote.updatedAt).toLocaleString()}</span>
              <button
                onClick={() => deleteNote(selectedNote.id)}
                style={{
                  padding: '4px 12px',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-error)',
                  color: 'white',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </>
        ) : (
          <div className="notes-empty">Select a note or create a new one</div>
        )}
      </div>
    </div>
  );
}
