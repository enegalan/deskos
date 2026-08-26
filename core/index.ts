// Core module exports
export { useKernel } from './kernel';
export { createProgramContext, launchOrFocusProgram } from './context';
export { createScopedStorage, createSecureScopedStorage } from './storage';
export { eventBus, createScopedEventBus, SystemEvents } from './event-bus';
export { defineProgram } from './program';
export { useSelection, registerSelectAllHandler, unregisterSelectAllHandler } from './selection';
export { copy, cut, paste, getClipboard, clearClipboard, hasClipboardData, registerCopyHandler, registerCutHandler, registerPasteHandler, unregisterCopyHandler, unregisterCutHandler, unregisterPasteHandler, type ClipboardItem, type ClipboardData, type ClipboardOperation } from './clipboard';
export type {
  WindowState,
  WindowCreateOptions,
  StorageAPI,
  EventBusAPI,
  EventHandler,
  WindowAPI,
  SystemAPI,
  ProgramContext,
  ProgramDefinition,
  SystemSettings,
  KernelState,
} from './types';
