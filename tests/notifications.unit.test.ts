// Unit tests for notification service
// Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5

import { NotificationSettings } from '../src/shared/types';

// Mock AWS clients before importing service
jest.mock('../src/shared/aws-clients');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const awsClients = require('../src/shared/aws-clients');
const mockSend = jest.fn();
awsClients.dynamoDocClient = { send: mockSend };

// Import service after mock setup
import { NotificationService } from '../src/shared/notification-service';

describe('Notification Service Unit Tests', () => {
  const defaultPreferences: NotificationSettings = {
    email: true,
    inApp: true,
    successNotifications: true,
    errorNotifications: true,
    reminderNotifications: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({
      Item: {
        notificationPreferences: defaultPreferences
      }
    });
  });

  // --- Notification Formatting and Delivery (Req 6.1, 6.2, 6.3) ---

  describe('Notification formatting and delivery', () => {
    it('should send a success notification with correct format', async () => {
      const result = await NotificationService.sendSuccessNotification(
        'user-1',
        'Event Created',
        'Your event "Tech Meetup" was created successfully on Meetup.com',
        'event-123',
        'event'
      );

      expect(result.notification.type).toBe('success');
      expect(result.notification.userId).toBe('user-1');
      expect(result.notification.title).toBe('Event Created');
      expect(result.notification.message).toContain('Tech Meetup');
      expect(result.notification.relatedEntityId).toBe('event-123');
      expect(result.notification.relatedEntityType).toBe('event');
      expect(result.notification.read).toBe(false);
      expect(result.emailSent).toBe(true);
      expect(result.inAppStored).toBe(true);
      expect(result.skippedByPreference).toBe(false);
    });

    it('should send an error notification with actionable information', async () => {
      const result = await NotificationService.sendErrorNotification(
        'user-1',
        'Event Creation Failed',
        'Failed to create event on Meetup.com: API rate limit exceeded. Please try again in 15 minutes.',
        'event-456',
        'event'
      );

      expect(result.notification.type).toBe('error');
      expect(result.notification.message).toContain('rate limit');
      expect(result.notification.message).toContain('try again');
      expect(result.notification.relatedEntityId).toBe('event-456');
    });

    it('should send a priority notification for manual intervention', async () => {
      const result = await NotificationService.sendPriorityNotification(
        'user-1',
        'Manual Intervention Required',
        'Synchronization conflict detected for event "Tech Meetup". Please review and resolve.',
        'conflict-789',
        'sync_conflict'
      );

      expect(result.notification.type).toBe('warning');
      expect(result.notification.title).toContain('Manual Intervention');
      expect(result.notification.relatedEntityId).toBe('conflict-789');
      expect(result.notification.relatedEntityType).toBe('sync_conflict');
    });

    it('should sanitize notification title and message', async () => {
      const result = await NotificationService.sendSuccessNotification(
        'user-1',
        'Title with <script>alert("xss")</script>',
        'Message with <b>html</b> tags'
      );

      expect(result.notification.title).not.toContain('<script>');
      expect(result.notification.title).not.toContain('</script>');
      expect(result.notification.message).not.toContain('<b>');
    });

    it('should store notification in DynamoDB when inApp is enabled', async () => {
      await NotificationService.sendSuccessNotification(
        'user-1',
        'Test',
        'Test message'
      );

      // Should have called send at least twice: once for GetCommand (prefs), once for PutCommand (store)
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  // --- Preference Filtering (Req 6.4) ---

  describe('Preference filtering', () => {
    it('should skip success notifications when successNotifications is disabled', async () => {
      mockSend.mockResolvedValue({
        Item: {
          notificationPreferences: {
            ...defaultPreferences,
            successNotifications: false
          }
        }
      });

      const result = await NotificationService.sendSuccessNotification(
        'user-1',
        'Event Created',
        'Your event was created'
      );

      expect(result.skippedByPreference).toBe(true);
      expect(result.emailSent).toBe(false);
      expect(result.inAppStored).toBe(false);
    });

    it('should skip error notifications when errorNotifications is disabled', async () => {
      mockSend.mockResolvedValue({
        Item: {
          notificationPreferences: {
            ...defaultPreferences,
            errorNotifications: false
          }
        }
      });

      const result = await NotificationService.sendErrorNotification(
        'user-1',
        'Error',
        'Something failed'
      );

      expect(result.skippedByPreference).toBe(true);
    });

    it('should skip reminder notifications when reminderNotifications is disabled', async () => {
      mockSend.mockResolvedValue({
        Item: {
          notificationPreferences: {
            ...defaultPreferences,
            reminderNotifications: false
          }
        }
      });

      const result = await NotificationService.sendNotification({
        userId: 'user-1',
        type: 'info',
        title: 'Reminder',
        message: 'You have upcoming events'
      });

      expect(result.skippedByPreference).toBe(true);
    });

    it('should never skip priority/warning notifications', async () => {
      mockSend.mockResolvedValue({
        Item: {
          notificationPreferences: {
            email: true,
            inApp: true,
            successNotifications: false,
            errorNotifications: false,
            reminderNotifications: false
          }
        }
      });

      const result = await NotificationService.sendPriorityNotification(
        'user-1',
        'Urgent',
        'Manual intervention required'
      );

      expect(result.skippedByPreference).toBe(false);
      expect(result.notification.type).toBe('warning');
    });

    it('should not send email when email preference is disabled', async () => {
      mockSend.mockResolvedValue({
        Item: {
          notificationPreferences: {
            ...defaultPreferences,
            email: false
          }
        }
      });

      const result = await NotificationService.sendSuccessNotification(
        'user-1',
        'Test',
        'Test message'
      );

      expect(result.emailSent).toBe(false);
      expect(result.inAppStored).toBe(true);
    });

    it('should not store in-app when inApp preference is disabled', async () => {
      mockSend.mockResolvedValue({
        Item: {
          notificationPreferences: {
            ...defaultPreferences,
            inApp: false
          }
        }
      });

      const result = await NotificationService.sendSuccessNotification(
        'user-1',
        'Test',
        'Test message'
      );

      expect(result.emailSent).toBe(true);
      expect(result.inAppStored).toBe(false);
    });

    it('should update notification preferences', async () => {
      mockSend.mockResolvedValue({});

      const newPrefs: NotificationSettings = {
        email: false,
        inApp: true,
        successNotifications: false,
        errorNotifications: true,
        reminderNotifications: false
      };

      const result = await NotificationService.updateNotificationPreferences('user-1', newPrefs);
      expect(result).toEqual(newPrefs);
      expect(mockSend).toHaveBeenCalled();
    });

    it('should return default preferences when user has none set', async () => {
      mockSend.mockResolvedValue({ Item: null });

      const prefs = await NotificationService.getNotificationPreferences('user-1');
      expect(prefs.email).toBe(true);
      expect(prefs.inApp).toBe(true);
      expect(prefs.successNotifications).toBe(true);
      expect(prefs.errorNotifications).toBe(true);
      expect(prefs.reminderNotifications).toBe(true);
    });
  });

  // --- Priority Handling (Req 6.3) ---

  describe('Priority handling', () => {
    it('should deliver priority notifications even with all type preferences disabled', async () => {
      mockSend.mockResolvedValue({
        Item: {
          notificationPreferences: {
            email: true,
            inApp: true,
            successNotifications: false,
            errorNotifications: false,
            reminderNotifications: false
          }
        }
      });

      const result = await NotificationService.sendPriorityNotification(
        'user-1',
        'Sync Conflict',
        'A synchronization conflict needs your attention'
      );

      expect(result.skippedByPreference).toBe(false);
      expect(result.inAppStored).toBe(true);
      expect(result.emailSent).toBe(true);
    });

    it('should set correct type for priority notifications', async () => {
      const result = await NotificationService.sendPriorityNotification(
        'user-1',
        'Action Required',
        'Please review the pending draft event'
      );

      expect(result.notification.type).toBe('warning');
    });
  });

  // --- Inactivity Detection and Reminders (Req 6.5) ---

  describe('Inactivity detection and reminders', () => {
    it('should detect inactive user when last activity exceeds threshold', async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
      mockSend.mockResolvedValue({
        Item: {
          lastActivityDate: thirtyDaysAgo.toISOString()
        }
      });

      const result = await NotificationService.checkInactivity('user-1', 7);
      expect(result.isInactive).toBe(true);
      expect(result.daysSinceActivity).toBeGreaterThanOrEqual(7);
    });

    it('should detect active user when last activity is within threshold', async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
      mockSend.mockResolvedValue({
        Item: {
          lastActivityDate: twoDaysAgo.toISOString()
        }
      });

      const result = await NotificationService.checkInactivity('user-1', 7);
      expect(result.isInactive).toBe(false);
      expect(result.daysSinceActivity).toBeLessThan(7);
    });

    it('should treat missing user as inactive', async () => {
      mockSend.mockResolvedValue({ Item: undefined });

      const result = await NotificationService.checkInactivity('user-1', 7);
      expect(result.isInactive).toBe(true);
      expect(result.lastActivityDate).toBeNull();
    });

    it('should fall back to lastSyncTime when lastActivityDate is missing', async () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 86400000);
      mockSend.mockResolvedValue({
        Item: {
          lastSyncTime: fiveDaysAgo.toISOString()
        }
      });

      const result = await NotificationService.checkInactivity('user-1', 7);
      expect(result.isInactive).toBe(false);
      expect(result.lastActivityDate).toBeDefined();
    });

    it('should send inactivity reminder with upcoming events', async () => {
      const upcomingEvents = [
        { eventId: 'e1', title: 'Tech Meetup', dateTime: new Date(Date.now() + 3 * 86400000) },
        { eventId: 'e2', title: 'Design Workshop', dateTime: new Date(Date.now() + 7 * 86400000) }
      ];

      const result = await NotificationService.sendInactivityReminder('user-1', upcomingEvents);

      expect(result).not.toBeNull();
      expect(result!.notification.type).toBe('info');
      expect(result!.notification.title).toContain('Attention');
      expect(result!.notification.message).toContain('2');
      expect(result!.notification.message).toContain('Tech Meetup');
      expect(result!.notification.message).toContain('Design Workshop');
    });

    it('should return null when no upcoming events for reminder', async () => {
      const result = await NotificationService.sendInactivityReminder('user-1', []);
      expect(result).toBeNull();
    });
  });

  // --- Get and Mark Notifications ---

  describe('Notification retrieval and management', () => {
    it('should get notifications for a user', async () => {
      mockSend.mockResolvedValue({
        Items: [
          {
            PK: 'USER#user-1',
            SK: 'NOTIFICATION#notif-1',
            notificationId: 'notif-1',
            userId: 'user-1',
            type: 'success',
            title: 'Event Created',
            message: 'Your event was created',
            read: false,
            createdAt: new Date().toISOString()
          }
        ]
      });

      const notifications = await NotificationService.getNotifications('user-1');
      expect(notifications).toHaveLength(1);
      expect(notifications[0].notificationId).toBe('notif-1');
      expect(notifications[0].type).toBe('success');
    });

    it('should return empty array when no notifications exist', async () => {
      mockSend.mockResolvedValue({ Items: undefined });

      const notifications = await NotificationService.getNotifications('user-1');
      expect(notifications).toEqual([]);
    });

    it('should mark a notification as read', async () => {
      mockSend.mockResolvedValue({});

      await NotificationService.markAsRead('user-1', 'notif-1');
      expect(mockSend).toHaveBeenCalled();
    });
  });

  // --- shouldSkipNotification logic ---

  describe('shouldSkipNotification', () => {
    it('should skip success when successNotifications is false', () => {
      const prefs: NotificationSettings = {
        ...defaultPreferences,
        successNotifications: false
      };
      expect(NotificationService.shouldSkipNotification('success', prefs)).toBe(true);
    });

    it('should not skip success when successNotifications is true', () => {
      expect(NotificationService.shouldSkipNotification('success', defaultPreferences)).toBe(false);
    });

    it('should skip error when errorNotifications is false', () => {
      const prefs: NotificationSettings = {
        ...defaultPreferences,
        errorNotifications: false
      };
      expect(NotificationService.shouldSkipNotification('error', prefs)).toBe(true);
    });

    it('should skip info when reminderNotifications is false', () => {
      const prefs: NotificationSettings = {
        ...defaultPreferences,
        reminderNotifications: false
      };
      expect(NotificationService.shouldSkipNotification('info', prefs)).toBe(true);
    });

    it('should never skip warning notifications', () => {
      const prefs: NotificationSettings = {
        email: false,
        inApp: false,
        successNotifications: false,
        errorNotifications: false,
        reminderNotifications: false
      };
      expect(NotificationService.shouldSkipNotification('warning', prefs)).toBe(false);
    });
  });
});
