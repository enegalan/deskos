/**
 * Shared system dialog (alert / confirm / prompt) for DeskOS apps and menus.
 */

/** Dialog variant shown by the system host. */
export type DialogKind = 'alert' | 'confirm' | 'prompt';

/** Options for confirm dialogs. */
export interface ConfirmDialogOptions {
  danger?: boolean;
}

/** Options for prompt dialogs. */
export interface PromptDialogOptions {
  /** Block OK while the trimmed value is empty. */
  required?: boolean;
}

/** Active or queued dialog request. */
export interface DialogRequest {
  id: string;
  kind: DialogKind;
  title: string;
  message: string;
  defaultValue?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  required: boolean;
  resolve: (value: unknown) => void;
}

type DialogListener = (dialog: DialogRequest | null) => void;

/** Queue one dialog at a time; callers await until the user closes it. */
class DialogManager {
  private current: DialogRequest | null = null;
  private queue: DialogRequest[] = [];
  private listeners: Set<DialogListener> = new Set();

  subscribe(listener: DialogListener): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getCurrent(): DialogRequest | null {
    return this.current;
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this.current));
  }

  private enqueue(request: Omit<DialogRequest, 'id' | 'resolve'>): Promise<unknown> {
    return new Promise((resolve) => {
      const entry: DialogRequest = {
        ...request,
        id: `dialog-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        resolve,
      };
      this.queue.push(entry);
      this.pump();
    });
  }

  private pump(): void {
    if (this.current || this.queue.length === 0) return;
    this.current = this.queue.shift() || null;
    this.notify();
  }

  /** Resolve the active dialog and show the next queued one. */
  close(id: string, value: unknown): void {
    if (!this.current || this.current.id !== id) return;
    const { resolve } = this.current;
    this.current = null;
    this.notify();
    resolve(value);
    this.pump();
  }

  alert(message: string, title = 'Alert'): Promise<void> {
    return this.enqueue({
      kind: 'alert',
      title,
      message,
      confirmLabel: 'OK',
      cancelLabel: 'Cancel',
      danger: false,
      required: false,
    }) as Promise<void>;
  }

  confirm(message: string, title = 'Confirm', options?: ConfirmDialogOptions): Promise<boolean> {
    return this.enqueue({
      kind: 'confirm',
      title,
      message,
      confirmLabel: 'OK',
      cancelLabel: 'Cancel',
      danger: options?.danger === true,
      required: false,
    }) as Promise<boolean>;
  }

  prompt(
    message: string,
    defaultValue = '',
    title = 'Prompt',
    options?: PromptDialogOptions
  ): Promise<string | null> {
    return this.enqueue({
      kind: 'prompt',
      title,
      message,
      defaultValue,
      confirmLabel: 'OK',
      cancelLabel: 'Cancel',
      danger: false,
      required: options?.required === true,
    }) as Promise<string | null>;
  }
}

/** Global system dialog manager. */
export const dialog = new DialogManager();
