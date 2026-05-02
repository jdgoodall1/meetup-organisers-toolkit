// Notifications Lambda handler

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createResponse, handleError, parseJSON } from '../shared/utils';
import { validateConfig } from '../shared/config';
import { NotificationService } from '../shared/notification-service';
import { NotificationSettings } from '../shared/types';
import { getUserFromEvent } from '../shared/auth';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    validateConfig();

    const { httpMethod, resource, pathParameters } = event;

    // Get authenticated user using shared auth utility
    const user = await getUserFromEvent(event);
    if (!user) {
      return createResponse(401, { error: 'Unauthorized' });
    }
    const userId = user.userId;

    switch (`${httpMethod} ${resource}`) {
      case 'GET /notifications': {
        const notifications = await NotificationService.getNotifications(userId);
        return createResponse(200, { notifications });
      }

      case 'GET /notifications/preferences': {
        const preferences = await NotificationService.getNotificationPreferences(userId);
        return createResponse(200, { preferences });
      }

      case 'PUT /notifications/preferences': {
        if (!event.body) {
          return createResponse(400, { error: 'Request body is required' });
        }

        const body = parseJSON<Partial<NotificationSettings>>(event.body);
        if (!body) {
          return createResponse(400, { error: 'Invalid JSON in request body' });
        }

        const preferences: NotificationSettings = {
          email: typeof body.email === 'boolean' ? body.email : true,
          inApp: typeof body.inApp === 'boolean' ? body.inApp : true,
          successNotifications: typeof body.successNotifications === 'boolean' ? body.successNotifications : true,
          errorNotifications: typeof body.errorNotifications === 'boolean' ? body.errorNotifications : true,
          reminderNotifications: typeof body.reminderNotifications === 'boolean' ? body.reminderNotifications : true
        };

        const updated = await NotificationService.updateNotificationPreferences(userId, preferences);
        return createResponse(200, { preferences: updated });
      }

      case 'PUT /notifications/{id}/read': {
        const notificationId = pathParameters?.id;
        if (!notificationId) {
          return createResponse(400, { error: 'Notification ID is required' });
        }

        await NotificationService.markAsRead(userId, notificationId);
        return createResponse(200, { message: 'Notification marked as read' });
      }

      default:
        return createResponse(405, { error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in notifications handler:', error);
    return handleError(error);
  }
};
