import React, { useState, useEffect } from 'react';
import { Notification } from '../types';
import { mockNotifications } from '../services/mockData';

const NotificationCenter: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setNotifications(mockNotifications);
      setLoading(false);
    }, 500);
  }, []);

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

  const markAsRead = (notificationId: string) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.notificationId === notificationId 
          ? { ...notification, read: true }
          : notification
      )
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => 
      prev.map(notification => ({ ...notification, read: true }))
    );
  };

  if (loading) {
    return <div className="loading">Loading notifications...</div>;
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
            <input type="checkbox" defaultChecked />
            <span>Email notifications</span>
          </label>
          <label className="preference-item">
            <input type="checkbox" defaultChecked />
            <span>Success notifications</span>
          </label>
          <label className="preference-item">
            <input type="checkbox" defaultChecked />
            <span>Error notifications</span>
          </label>
          <label className="preference-item">
            <input type="checkbox" defaultChecked />
            <span>Reminder notifications</span>
          </label>
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;