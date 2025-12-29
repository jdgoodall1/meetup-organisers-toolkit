// Messaging Lambda handler

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createResponse, handleError, parseJSON } from '../shared/utils';
import { validateConfig } from '../shared/config';
import { MessagingService, ScheduleMessageRequest, MessageTemplate } from '../shared/messaging-service';
import { getUserFromEvent } from '../shared/auth';
import { EventModel } from '../shared/models';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    validateConfig();

    const { httpMethod, pathParameters, body } = event;
    const path = event.resource;

    // Get authenticated user
    const user = await getUserFromEvent(event);
    if (!user) {
      return createResponse(401, { error: 'Unauthorized' });
    }

    switch (httpMethod) {
      case 'POST':
        if (path === '/messages/schedule') {
          return await scheduleMessage(body, user.userId);
        }
        break;

      case 'GET':
        if (path === '/messages') {
          return await getMessages(user.userId);
        }
        break;

      case 'PUT':
        if (path === '/messages/templates') {
          return await updateMessageTemplates(body, user.userId);
        }
        if (pathParameters?.messageId && path.includes('/confirm')) {
          return await confirmMessage(pathParameters.messageId, user.userId);
        }
        break;

      case 'DELETE':
        if (pathParameters?.messageId) {
          return await cancelMessage(pathParameters.messageId, user.userId);
        }
        break;

      default:
        return createResponse(405, { error: 'Method not allowed' });
    }

    return createResponse(404, { error: 'Not found' });
  } catch (error) {
    return handleError(error);
  }
};

async function scheduleMessage(body: string | null, userId: string): Promise<APIGatewayProxyResult> {
  if (!body) {
    return createResponse(400, { error: 'Request body is required' });
  }

  const data = parseJSON(body);
  if (!data) {
    return createResponse(400, { error: 'Invalid JSON in request body' });
  }

  const { eventId, recipientType, scheduledTime, customTemplate } = data;

  if (!eventId || !recipientType || !scheduledTime) {
    return createResponse(400, { 
      error: 'eventId, recipientType, and scheduledTime are required' 
    });
  }

  if (!['attendees', 'non_rsvp_members'].includes(recipientType)) {
    return createResponse(400, { 
      error: 'recipientType must be either "attendees" or "non_rsvp_members"' 
    });
  }

  try {
    // Get event details
    const event = await EventModel.get(userId, eventId);
    if (!event) {
      return createResponse(404, { error: 'Event not found' });
    }

    // Get user profile (simplified - in real implementation would get from database)
    const userProfile = {
      userId,
      email: 'user@example.com', // Would be retrieved from database
      name: 'User Name',
      manualConfirmationEnabled: false,
      notificationPreferences: {
        email: true,
        inApp: true,
        successNotifications: true,
        errorNotifications: true,
        reminderNotifications: true
      },
      lastSyncTime: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const request: ScheduleMessageRequest = {
      event,
      userProfile,
      recipientType,
      scheduledTime: new Date(scheduledTime),
      customTemplate
    };

    const result = await MessagingService.scheduleMessage(request);

    if (result.error) {
      return createResponse(400, { error: result.error });
    }

    return createResponse(201, { message: result.message });
  } catch (error) {
    throw error;
  }
}

async function getMessages(userId: string): Promise<APIGatewayProxyResult> {
  try {
    // This would typically get messages from database
    // For now, return empty array
    return createResponse(200, { messages: [] });
  } catch (error) {
    throw error;
  }
}

async function updateMessageTemplates(body: string | null, userId: string): Promise<APIGatewayProxyResult> {
  if (!body) {
    return createResponse(400, { error: 'Request body is required' });
  }

  const template = parseJSON(body) as MessageTemplate;
  if (!template) {
    return createResponse(400, { error: 'Invalid JSON in request body' });
  }

  try {
    await MessagingService.updateMessageTemplate(userId, template);
    return createResponse(200, { message: 'Templates updated successfully' });
  } catch (error) {
    throw error;
  }
}

async function confirmMessage(messageId: string, userId: string): Promise<APIGatewayProxyResult> {
  try {
    // This would typically confirm a specific message
    // For now, return success
    return createResponse(200, { message: 'Message confirmed' });
  } catch (error) {
    throw error;
  }
}

async function cancelMessage(messageId: string, userId: string): Promise<APIGatewayProxyResult> {
  try {
    // This would typically cancel a specific message
    // For now, return success
    return createResponse(200, { message: 'Message cancelled' });
  } catch (error) {
    throw error;
  }
}