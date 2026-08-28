/**
 * Toast notification system for DeskOS
 */

/** Toast severity / styling variant. */
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

/** Toast notification payload. */
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
  timestamp: number;
}

/** In-memory toast queue with subscriber notifications. */
class NotificationManager {
  private notifications: Notification[] = [];
  private listeners: Set<(notifications: Notification[]) => void> = new Set();
  private defaultDuration = 3000;

  subscribe(listener: (notifications: Notification[]) => void): () => void {
    this.listeners.add(listener);
    listener([...this.notifications]);
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      listener([...this.notifications]);
    });
  }

  show(
    type: NotificationType,
    title: string,
    message?: string,
    duration?: number
  ): string {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const notificationDuration = duration ?? this.defaultDuration;
    const notification: Notification = {
      id,
      type,
      title,
      message,
      duration: notificationDuration,
      timestamp: Date.now(),
    };

    this.notifications.push(notification);
    this.notify();

    // Auto-dismiss after duration
    if (notificationDuration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, notificationDuration);
    }

    return id;
  }

  dismiss(id: string): void {
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.notify();
  }

  dismissAll(): void {
    this.notifications = [];
    this.notify();
  }

  getNotifications(): Notification[] {
    return [...this.notifications];
  }

  // Convenience methods
  info(title: string, message?: string, duration?: number): string {
    return this.show('info', title, message, duration);
  }

  success(title: string, message?: string, duration?: number): string {
    return this.show('success', title, message, duration);
  }

  warning(title: string, message?: string, duration?: number): string {
    return this.show('warning', title, message, duration);
  }

  error(title: string, message?: string, duration?: number): string {
    return this.show('error', title, message, duration);
  }
}

/** Global toast notification manager singleton. */
export const notificationManager = new NotificationManager();
