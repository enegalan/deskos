/**
 * Sandbox utilities for iframe-based program isolation
 * Note: Full iframe sandboxing would require program architecture changes.
 * This module provides the foundation for future iframe-based isolation.
 */

export interface SandboxConfig {
  programId: string;
  allowedOrigins?: string[];
  sandboxAttributes?: string[];
}

/**
 * Create sandbox iframe for program execution
 * This is a placeholder for future iframe-based sandboxing
 */
export function createSandboxIframe(config: SandboxConfig): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.id = `sandbox-${config.programId}`;
  iframe.style.display = 'none';

  // Restrictive sandbox attributes
  const sandboxAttrs = config.sandboxAttributes || [
    'allow-scripts',
    'allow-same-origin',
    'allow-forms',
  ];

  iframe.setAttribute('sandbox', sandboxAttrs.join(' '));

  // Content Security Policy would be set via meta tag in iframe content
  // This is handled by the program loader, not here

  return iframe;
}

/**
 * Setup IPC communication channel with sandbox
 */
export function setupSandboxIPC(
  iframe: HTMLIFrameElement,
  programId: string,
  messageHandler: (message: unknown) => void
): () => void {
  const handleMessage = (event: MessageEvent) => {
    // Validate origin (in production, check against allowed origins)
    if (event.data && typeof event.data === 'object') {
      const data = event.data as Record<string, unknown>;
      if (data.programId === programId) {
        messageHandler(event.data);
      }
    }
  };

  window.addEventListener('message', handleMessage);

  // Return cleanup function
  return () => {
    window.removeEventListener('message', handleMessage);
  };
}

/**
 * Send message to sandbox
 */
export function sendToSandbox(iframe: HTMLIFrameElement, message: unknown): void {
  if (iframe.contentWindow) {
    iframe.contentWindow.postMessage(message, '*'); // In production, use specific origin
  }
}

/**
 * Validate sandbox message origin
 */
export function validateSandboxOrigin(event: MessageEvent, allowedOrigins: string[]): boolean {
  if (allowedOrigins.length === 0) {
    // Allow same origin only
    return event.origin === window.location.origin;
  }
  return allowedOrigins.includes(event.origin);
}

/**
 * Check if iframe sandboxing is supported
 */
export function isSandboxSupported(): boolean {
  return 'sandbox' in document.createElement('iframe');
}
