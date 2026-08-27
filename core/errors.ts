/**
 * Centralized error handling system for DeskOS
 */

export enum ErrorCode {
  WINDOW_NOT_FOUND = 'WINDOW_NOT_FOUND',
  STORAGE_ERROR = 'STORAGE_ERROR',
  OPERATION_FAILED = 'OPERATION_FAILED',
}

export interface DeskOSError extends Error {
  code: ErrorCode;
  context?: Record<string, unknown>;
  recoverable?: boolean;
}

export class WindowNotFoundError extends Error implements DeskOSError {
  code = ErrorCode.WINDOW_NOT_FOUND;
  context?: Record<string, unknown>;
  recoverable = false;

  constructor(windowId: string) {
    super(`Window not found: ${windowId}`);
    this.name = 'WindowNotFoundError';
    this.context = { windowId };
  }
}

export class StorageError extends Error implements DeskOSError {
  code = ErrorCode.STORAGE_ERROR;
  context?: Record<string, unknown>;
  recoverable = true;

  constructor(message: string, context?: Record<string, unknown>) {
    super(`Storage error: ${message}`);
    this.name = 'StorageError';
    this.context = context;
  }
}

/**
 * Error logger
 */
class ErrorLogger {
  private errors: Array<{ error: DeskOSError; timestamp: number }> = [];
  private maxErrors = 100;

  log(error: DeskOSError): void {
    this.errors.push({ error, timestamp: Date.now() });
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Log to console in development
    if (typeof window !== 'undefined' && (window as any).__DEV__ !== false) {
      console.error(`[DeskOS Error] ${error.name}:`, error.message, error.context);
    }
  }

  getRecentErrors(count: number = 10): DeskOSError[] {
    return this.errors.slice(-count).map((e) => e.error);
  }

  clear(): void {
    this.errors = [];
  }
}

export const errorLogger = new ErrorLogger();

/**
 * Error handler wrapper
 */
export function handleError(error: unknown, context?: Record<string, unknown>): DeskOSError {
  let deskOSError: DeskOSError;

  if (error instanceof Error) {
    if ('code' in error && Object.values(ErrorCode).includes(error.code as ErrorCode)) {
      deskOSError = error as DeskOSError;
    } else {
      deskOSError = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: ErrorCode.OPERATION_FAILED,
        context,
      } as DeskOSError;
    }
  } else {
    deskOSError = {
      name: 'UnknownError',
      message: String(error),
      code: ErrorCode.OPERATION_FAILED,
      context,
    } as DeskOSError;
  }

  errorLogger.log(deskOSError);
  return deskOSError;
}

/**
 * Safe sync wrapper
 */
export function safeSync<T>(
  fn: () => T,
  context?: Record<string, unknown>
): [T | null, DeskOSError | null] {
  try {
    const result = fn();
    return [result, null];
  } catch (error) {
    const deskOSError = handleError(error, context);
    return [null, deskOSError];
  }
}
