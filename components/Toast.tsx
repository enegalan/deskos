import { useEffect, useState } from 'react';
import { notificationManager, type Notification } from '@core/notifications';
import { Icon } from './Icon';

export function ToastContainer() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const unsubscribe = notificationManager.subscribe((notifs) => {
      setNotifications(notifs);
    });

    return unsubscribe;
  }, []);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="toast-container">
      {notifications.map((notification) => (
        <Toast key={notification.id} notification={notification} />
      ))}
    </div>
  );
}

interface ToastProps {
  notification: Notification;
}

function Toast({ notification }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      notificationManager.dismiss(notification.id);
    }, 300);
  };

  useEffect(() => {
    if (notification.duration && notification.duration > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, notification.duration);

      return () => clearTimeout(timer);
    }
  }, [notification.duration, notification.id]);

  const getIconName = (): string => {
    switch (notification.type) {
      case 'success':
        return 'checkmark';
      case 'warning':
        return 'info';
      case 'error':
        return 'close';
      default:
        return 'info';
    }
  };

  return (
    <div
      className={`toast toast-${notification.type} ${isExiting ? 'toast-exiting' : ''}`}
      onClick={handleDismiss}
    >
      <div className="toast-icon">
        <Icon name={getIconName()} size={20} />
      </div>
      <div className="toast-content">
        <div className="toast-title">{notification.title}</div>
        {notification.message && (
          <div className="toast-message">{notification.message}</div>
        )}
      </div>
      <button className="toast-close" onClick={handleDismiss} aria-label="Close">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
