import React, { useState, useEffect, useCallback } from 'react';
import { Notification, NotificationSettings } from '../types';
import { apiService } from '../services/api';

const POLLING_INTERVAL_MS = 30000; // 30 seconds

const NotificationCenter: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Notification preferences state
  const [preferences, setPreferences] = useState<NotificationSettings>({
    email: true,
    inApp: true,
    successNotifications: true,
    errorNotifications: true,
    reminderNotifications: true,
  });
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferencesSaved, setPreferencesSaved] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await apiService.getNotifications();
      const data = (response as any).notifications || response;
      setNotifications(Array.isArray(data) ? data as Notification[] : []);
    } catch (err) {
      console.error('Failed to load notifications:', err);
      throw err;
    }
  }, []);

  const loadPreferences = useCallback(async () => {
    try {
      const response = await apiService.getNotificationPreferences();
      const data = (response as any).preferences || response;
      if (data && typeof data === 'object') {
        setPreferences(data as NotificationSettings);
      }
    } catch (err) {
      console.error('Failed to load notification preferences:', err);
      throw err;
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([loadNotifications(), loadPreferences()]);
    } catch (err) {
      console.error('Failed to load notification data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notification data');
    } finally {
      setLoading(false);
    }
  }, [loadNotifications, loadPreferences]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Polling for real-time updates
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await loadNotifications();
      } catch {
        // Silently fail on polling errors to avoid disrupting the UI
      }
    }, POLLING_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [loadNotifications]);

  const filteredNotifications = notifications.filter(notification =>
    filter === 'all' || !notification.read
  );

  const unreadCount = notifications.filter(n => !n.read).length;

  const formatDate = (date: Date) => {
    const now = new Date();
    const notificationDate = new Date(date);
    const diffInHours = Math.floor((now.getTime() - notificationDate.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    } else {
      return notificationDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
    };
    return icons[type];
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await apiService.markNotificationAsRead(notificationId);
      setNotifications(prev =>
        prev.map(notification =>
          notification.notificationId === notificationId
            ? { ...notification, read: true }
            : notification
        )
      );
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
      setError(err instanceof Error ? err.message : 'Failed to mark notification as read');
    }
  };

  const markAllAsRead = async () => {
    try {
      await apiService.markAllNotificationsAsRead();
      setNotifications(prev =>
        prev.map(notification => ({ ...notification, read: true }))
      );
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
      setError(err instanceof Error ? err.message : 'Failed to mark all as read');
    }
  };

  const handlePreferenceChange = (key: keyof NotificationSettings) => {
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
    setPreferencesSaved(false);
  };

  const savePreferences = async () => {
    try {
      setSavingPreferences(true);
      setError(null);
      await apiService.updateNotificationPreferences(preferences);
      setPreferencesSaved(true);
      // Auto-hide the saved message after 3 seconds
      setTimeout(() => setPreferencesSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save notification preferences:', err);
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSavingPreferences(false);
    }
  };

  if (loading) {
    return <div className="loading" role="status">Loading notifications...</div>;
  }

  if (error && notifications.length === 0) {
    return (
      <div className="error-state">
        <p>Error: {error}</p>
        <button onClick={loadData} className="btn-secondary">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="notification-center">
      <div className="notification-header">
        <h2>Notifications</h2>
        <div className="notification-actions">
          {unreadCount > 0 && (
            <button onClick={markAllAsRead} className="btn-secondary">
              Mark All Read ({unreadCount})
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <p>Error: {error}</p>
          <button onClick={() => setError(null)} className="btn-secondary">
            Dismiss
          </button>
        </div>
      )}

      <div className="notification-filters">
        <button
          className={`filter-button ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({notifications.length})
        </button>
        <button
          className={`filter-button ${filter === 'unread' ? 'active' : ''}`}
          onClick={() => setFilter('unread')}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {filteredNotifications.length === 0 ? (
        <div className="empty-state">
          <p>
            {filter === 'unread'
              ? 'No unread notifications. You\'re all caught up!'
              : 'No notifications found.'
            }
          </p>
        </div>
      ) : (
        <div className="notifications-list">
          {filteredNotifications.map((notification) => (
            <div
              key={notification.notificationId}
              className={`notification-card ${notification.read ? 'read' : 'unread'} ${notification.type}`}
              onClick={() => !notification.read && markAsRead(notification.notificationId)}
            >
              <div className="notification-icon">
                {getNotificationIcon(notification.type)}
              </div>

              <div className="notification-content">
                <div className="notification-title">
                  {notification.title}
                  {!notification.read && <span className="unread-indicator"></span>}
                </div>
                <div className="notification-message">
                  {notification.message}
                </div>
                <div className="notification-time">
                  {formatDate(notification.createdAt)}
                </div>
              </div>

              {notification.relatedEntityId && (
                <div className="notification-action">
                  <button className="btn-link">
                    View Details
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="notification-preferences">
        <h3>Notification Preferences</h3>
        <div className="preferences-grid">
          <label className="preference-item">
            <input
              type="checkbox"
              checked={preferences.email}
              onChange={() => handlePreferenceChange('email')}
            />
            <span>Email notifications</span>
          </label>
          <label className="preference-item">
            <input
              type="checkbox"
              checked={preferences.inApp}
              onChange={() => handlePreferenceChange('inApp')}
            />
            <span>In-app notifications</span>
          </label>
          <label className="preference-item">
            <input
              type="checkbox"
              checked={preferences.successNotifications}
              onChange={() => handlePreferenceChange('successNotifications')}
            />
            <span>Success notifications</span>
          </label>
          <label className="preference-item">
            <input
              type="checkbox"
              checked={preferences.errorNotifications}
              onChange={() => handlePreferenceChange('errorNotifications')}
            />
            <span>Error notifications</span>
          </label>
          <label className="preference-item">
            <input
              type="checkbox"
              checked={preferences.reminderNotifications}
              onChange={() => handlePreferenceChange('reminderNotifications')}
            />
            <span>Reminder notifications</span>
          </label>
        </div>
        <div className="preferences-actions">
          <button
            onClick={savePreferences}
            className="btn-primary"
            disabled={savingPreferences}
          >
            {savingPreferences ? 'Saving...' : 'Save Preferences'}
          </button>
          {preferencesSaved && (
            <span className="save-confirmation">Preferences saved successfully!</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;
