// Notification service for user alerts and confirmations

import { Notification, NotificationSettings } from './types';
import { NotificationModel } from './models';
import { generateId, formatDateForStorage, sanitizeString } from './utils';
import { dynamoDocClient } from './aws-clients';
import { PutCommand, QueryCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { config } from './config';

export interface SendNotificationParams {
  userId: string;
  type: Notification['type'];
  title: string;
  message: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
}

export interface NotificationDeliveryResult {
  notification: Notification;
  emailSent: boolean;
  inAppStored: boolean;
  skippedByPreference: boolean;
}

export interface InactivityCheckResult {
  isInactive: boolean;
  lastActivityDate: Date | null;
  daysSinceActivity: number;
}

export interface UpcomingEvent {
  eventId: string;
  title: string;
  dateTime: Date;
}

export class NotificationService {
  /**
   * Send a notification respecting user preferences
   */
  static async sendNotification(params: SendNotificationParams): Promise<NotificationDeliveryResult> {
    const { userId, type, title, message, relatedEntityId, relatedEntityType } = params;

    // Get user preferences
    const preferences = await this.getNotificationPreferences(userId);

    // Check if notification should be sent based on preferences
    if (this.shouldSkipNotification(type, preferences)) {
      // Create the notification but mark it as skipped
      const notification = NotificationModel.create({
        userId,
        type,
        title: sanitizeString(title),
        message: sanitizeString(message),
        relatedEntityId,
        relatedEntityType,
        read: true // Mark as read since user doesn't want these
      });

      return {
        notification,
        emailSent: false,
        inAppStored: false,
        skippedByPreference: true
      };
    }

    // Create the notification
    const notification = NotificationModel.create({
      userId,
      type,
      title: sanitizeString(title),
      message: sanitizeString(message),
      relatedEntityId,
      relatedEntityType
    });

    let emailSent = false;
    let inAppStored = false;

    // Store in-app notification
    if (preferences.inApp) {
      await this.storeNotification(notification);
      inAppStored = true;
    }

    // Send email notification
    if (preferences.email) {
      emailSent = await this.sendEmailNotification(notification);
    }

    return {
      notification,
      emailSent,
      inAppStored,
      skippedByPreference: false
    };
  }

  /**
   * Send a success notification for completed automated actions (Req 6.1)
   */
  static async sendSuccessNotification(
    userId: string,
    title: string,
    message: string,
    relatedEntityId?: string,
    relatedEntityType?: string
  ): Promise<NotificationDeliveryResult> {
    return this.sendNotification({
      userId,
      type: 'success',
      title,
      message,
      relatedEntityId,
      relatedEntityType
    });
  }

  /**
   * Send an error notification with actionable information (Req 6.2)
   */
  static async sendErrorNotification(
    userId: string,
    title: string,
    message: string,
    relatedEntityId?: string,
    relatedEntityType?: string
  ): Promise<NotificationDeliveryResult> {
    return this.sendNotification({
      userId,
      type: 'error',
      title,
      message,
      relatedEntityId,
      relatedEntityType
    });
  }

  /**
   * Send a priority notification for manual interventions (Req 6.3)
   */
  static async sendPriorityNotification(
    userId: string,
    title: string,
    message: string,
    relatedEntityId?: string,
    relatedEntityType?: string
  ): Promise<NotificationDeliveryResult> {
    return this.sendNotification({
      userId,
      type: 'warning',
      title,
      message,
      relatedEntityId,
      relatedEntityType
    });
  }

  /**
   * Update notification preferences for a user (Req 6.4)
   */
  static async updateNotificationPreferences(
    userId: string,
    preferences: NotificationSettings
  ): Promise<NotificationSettings> {
    await dynamoDocClient.send(new UpdateCommand({
      TableName: config.tables.users,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE'
      },
      UpdateExpression: 'SET notificationPreferences = :prefs, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':prefs': preferences,
        ':updatedAt': formatDateForStorage(new Date())
      }
    }));

    return preferences;
  }

  /**
   * Get notification preferences for a user
   */
  static async getNotificationPreferences(userId: string): Promise<NotificationSettings> {
    try {
      const result = await dynamoDocClient.send(new GetCommand({
        TableName: config.tables.users,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE'
        }
      }));

      if (result.Item && result.Item.notificationPreferences) {
        return result.Item.notificationPreferences as NotificationSettings;
      }
    } catch (error) {
      // Fall through to defaults
    }

    // Return default preferences
    return {
      email: true,
      inApp: true,
      successNotifications: true,
      errorNotifications: true,
      reminderNotifications: true
    };
  }

  /**
   * Check if a user is inactive (Req 6.5)
   */
  static async checkInactivity(userId: string, thresholdDays: number): Promise<InactivityCheckResult> {
    try {
      const result = await dynamoDocClient.send(new GetCommand({
        TableName: config.tables.users,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE'
        }
      }));

      if (!result.Item) {
        return {
          isInactive: true,
          lastActivityDate: null,
          daysSinceActivity: Infinity
        };
      }

      const lastActivity = result.Item.lastActivityDate
        ? new Date(result.Item.lastActivityDate)
        : result.Item.lastSyncTime
          ? new Date(result.Item.lastSyncTime)
          : null;

      if (!lastActivity) {
        return {
          isInactive: true,
          lastActivityDate: null,
          daysSinceActivity: Infinity
        };
      }

      const now = new Date();
      const daysSinceActivity = Math.floor(
        (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        isInactive: daysSinceActivity >= thresholdDays,
        lastActivityDate: lastActivity,
        daysSinceActivity
      };
    } catch (error) {
      return {
        isInactive: false,
        lastActivityDate: null,
        daysSinceActivity: 0
      };
    }
  }

  /**
   * Send inactivity reminder about upcoming events (Req 6.5)
   */
  static async sendInactivityReminder(
    userId: string,
    upcomingEvents: UpcomingEvent[]
  ): Promise<NotificationDeliveryResult | null> {
    if (upcomingEvents.length === 0) {
      return null;
    }

    const eventList = upcomingEvents
      .map(e => `- ${e.title} on ${e.dateTime.toLocaleDateString()}`)
      .join('\n');

    const title = 'Upcoming Events Require Your Attention';
    const message = `You have ${upcomingEvents.length} upcoming event(s) that may need your attention:\n${eventList}`;

    return this.sendNotification({
      userId,
      type: 'info',
      title,
      message
    });
  }

  /**
   * Get notifications for a user
   */
  static async getNotifications(userId: string): Promise<Notification[]> {
    const result = await dynamoDocClient.send(new QueryCommand({
      TableName: config.tables.notifications,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'NOTIFICATION#'
      },
      ScanIndexForward: false // Most recent first
    }));

    if (!result.Items) {
      return [];
    }

    return result.Items.map(item => {
      const { PK, SK, ...notificationData } = item;
      return NotificationModel.deserialize(notificationData);
    });
  }

  /**
   * Mark a notification as read
   */
  static async markAsRead(userId: string, notificationId: string): Promise<void> {
    await dynamoDocClient.send(new UpdateCommand({
      TableName: config.tables.notifications,
      Key: {
        PK: `USER#${userId}`,
        SK: `NOTIFICATION#${notificationId}`
      },
      UpdateExpression: 'SET #read = :read',
      ExpressionAttributeNames: {
        '#read': 'read'
      },
      ExpressionAttributeValues: {
        ':read': true
      }
    }));
  }

  /**
   * Check if a notification should be skipped based on user preferences
   */
  static shouldSkipNotification(
    type: Notification['type'],
    preferences: NotificationSettings
  ): boolean {
    switch (type) {
      case 'success':
        return !preferences.successNotifications;
      case 'error':
        return !preferences.errorNotifications;
      case 'info':
        return !preferences.reminderNotifications;
      case 'warning':
        // Priority/warning notifications are always delivered
        return false;
      default:
        return false;
    }
  }

  /**
   * Store notification in DynamoDB
   */
  private static async storeNotification(notification: Notification): Promise<void> {
    const serialized = NotificationModel.serialize(notification);

    await dynamoDocClient.send(new PutCommand({
      TableName: config.tables.notifications,
      Item: {
        PK: `USER#${notification.userId}`,
        SK: `NOTIFICATION#${notification.notificationId}`,
        ...serialized
      }
    }));
  }

  /**
   * Send email notification (simulated via SES)
   */
  private static async sendEmailNotification(notification: Notification): Promise<boolean> {
    try {
      // In production, this would use SES to send the email
      // For now, we log and simulate success
      console.log(`[Email] Sending notification to user ${notification.userId}: ${notification.title}`);
      return true;
    } catch (error) {
      console.error(`Failed to send email notification: ${error}`);
      return false;
    }
  }
}
