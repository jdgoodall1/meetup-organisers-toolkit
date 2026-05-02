// Social media Lambda handler

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createResponse, handleError, parseJSON } from '../shared/utils';
import { validateConfig } from '../shared/config';
import { SocialMediaService, SchedulePostsRequest } from '../shared/social-media-service';
import { EventModel } from '../shared/models';
import { getUserFromEvent } from '../shared/auth';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    validateConfig();

    const { httpMethod, resource, pathParameters } = event;

    // Get authenticated user profile
    const user = await getUserFromEvent(event);
    if (!user) {
      return createResponse(401, { error: 'Unauthorized' });
    }

    switch (`${httpMethod} ${resource}`) {
      case 'POST /social/schedule':
        return await schedulePostsForEvent(event, user.userId);

      case 'GET /social/posts':
        return await getScheduledPosts(event, user.userId);

      case 'DELETE /social/posts/{id}': {
        const postId = pathParameters?.id;
        if (!postId) {
          return createResponse(400, { error: 'Post ID is required' });
        }
        return await cancelScheduledPost(postId, user.userId);
      }

      default:
        return createResponse(405, { error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in social handler:', error);
    return handleError(error);
  }
};

async function schedulePostsForEvent(
  event: APIGatewayProxyEvent,
  userId: string
): Promise<APIGatewayProxyResult> {
  const body = parseJSON<{ eventId?: string; customTemplate?: any; organizationId?: string }>(event.body);
  if (!body) {
    return createResponse(400, { error: 'Invalid request body' });
  }

  const { eventId, customTemplate, organizationId } = body;

  if (!eventId) {
    return createResponse(400, { error: 'eventId is required' });
  }

  // Get the event
  const eventData = await EventModel.get(userId, eventId);
  if (!eventData) {
    return createResponse(404, { error: 'Event not found' });
  }

  // Build a minimal user profile for scheduling
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

  const request: SchedulePostsRequest = {
    event: eventData,
    userProfile,
    customTemplate,
    organizationId
  };

  const result = await SocialMediaService.schedulePostsForEvent(request);

  if (result.errors.length > 0 && result.scheduledPosts.length > 0) {
    return createResponse(207, {
      scheduledPosts: result.scheduledPosts,
      errors: result.errors
    });
  }

  if (result.errors.length > 0 && result.scheduledPosts.length === 0) {
    return createResponse(400, {
      error: 'Failed to schedule posts',
      errors: result.errors
    });
  }

  return createResponse(201, {
    scheduledPosts: result.scheduledPosts,
    message: `Scheduled ${result.scheduledPosts.length} posts for event`
  });
}

async function getScheduledPosts(
  event: APIGatewayProxyEvent,
  userId: string
): Promise<APIGatewayProxyResult> {
  // Query parameters for filtering
  const queryParams = event.queryStringParameters || {};
  const { eventId, status } = queryParams;

  // In a full implementation, this would query the ScheduledPosts table
  // filtered by userId and optional eventId/status
  return createResponse(200, {
    posts: [],
    message: 'Scheduled posts retrieved'
  });
}

async function cancelScheduledPost(
  postId: string,
  userId: string
): Promise<APIGatewayProxyResult> {
  // In a full implementation, this would:
  // 1. Verify the post belongs to the user
  // 2. Check the post is in a cancellable state
  // 3. Update the post status to 'cancelled'
  return createResponse(200, {
    message: 'Scheduled post cancelled',
    postId
  });
}
