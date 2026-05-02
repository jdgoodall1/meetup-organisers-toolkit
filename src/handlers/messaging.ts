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

    const { httpMethod, resource, pathParameters, body } = event;

    // Get authenticated user
    const user = await getUserFromEvent(event);
    if (!user) {
      return createResponse(401, { error: 'Unauthorized' });
    }

    switch (`${httpMethod} ${resource}`) {
      case 'POST /messages/schedule':
        return await scheduleMessage(body, user.userId);

      case 'GET /messages':
        return await getMessages(user.userId);

      case 'PUT /messages/templates':
        return await updateMessageTemplates(body, user.userId);

      case 'DELETE /messages/{id}': {
        const messageId = pathParameters?.id;
        if (!messageId) {
          return createResponse(400, { error: 'Message ID is required' });
        }
        return await cancelMessage(messageId, user.userId);
      }

      default:
        return createResponse(405, { error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in messaging handler:', error);
    return handleError(error);
  }
};

async function scheduleMessage(body: string | null, userId: string): Promise<APIGatewayProxyResult> {
  if (!body) {
    return createResponse(400, { error: 'Request body is required' });
  }

  const data = parseJSON<{
    eventId?: string;
    recipientType?: string;
    scheduledTime?: string;
    customTemplate?: MessageTemplate;
  }>(body);

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

  // Get event details
  const event = await EventModel.get(userId, eventId);
  if (!event) {
    return createResponse(404, { error: 'Event not found' });
  }

  // Build user profile for scheduling
  const userProfile = {
    userId,
    email: '',
    name: '',
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
    recipientType: recipientType as 'attendees' | 'non_rsvp_members',
    scheduledTime: new Date(scheduledTime),
    customTemplate
  };

  const result = await MessagingService.scheduleMessage(request);

  if (result.error) {
    return createResponse(400, { error: result.error });
  }

  return createResponse(201, { message: result.message });
}

async function getMessages(userId: string): Promise<APIGatewayProxyResult> {
  // In a full implementation, this would query the Messages table by userId
  return createResponse(200, { messages: [] });
}

async function updateMessageTemplates(body: string | null, userId: string): Promise<APIGatewayProxyResult> {
  if (!body) {
    return createResponse(400, { error: 'Request body is required' });
  }

  const template = parseJSON<MessageTemplate>(body);
  if (!template) {
    return createResponse(400, { error: 'Invalid JSON in request body' });
  }

  await MessagingService.updateMessageTemplate(userId, template);
  return createResponse(200, { message: 'Templates updated successfully' });
}

async function cancelMessage(messageId: string, userId: string): Promise<APIGatewayProxyResult> {
  // In a full implementation, this would:
  // 1. Verify the message belongs to the user
  // 2. Check the message is in a cancellable state
  // 3. Update the message status to 'cancelled'
  return createResponse(200, { message: 'Message cancelled', messageId });
}
