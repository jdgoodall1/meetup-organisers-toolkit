// Social media Lambda handler

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createResponse, handleError, getUserIdFromEvent } from '../shared/utils';
import { validateConfig } from '../shared/config';
import { SocialMediaService, SchedulePostsRequest } from '../shared/social-media-service';
import { EventModel, UserProfileModel } from '../shared/models';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    validateConfig();

    const method = event.httpMethod;
    const path = event.path;

    // Get user ID from the authenticated request
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return createResponse(401, { error: 'Unauthorized' });
    }

    if (method === 'POST' && path === '/social/schedule') {
      return await schedulePostsForEvent(event, userId);
    }

    if (method === 'GET' && path === '/social/posts') {
      return await getScheduledPosts(event, userId);
    }

    if (method === 'DELETE' && path.startsWith('/social/posts/')) {
      const postId = path.split('/').pop();
      if (!postId) {
        return createResponse(400, { error: 'Post ID is required' });
      }
      return await cancelScheduledPost(postId, userId);
    }

    return createResponse(404, { error: 'Not found' });
  } catch (error) {
    return handleError(error);
  }
};

async function schedulePostsForEvent(
  event: APIGatewayProxyEvent, 
  userId: string
): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { eventId, customTemplate, organizationId } = body;

    if (!eventId) {
      return createResponse(400, { error: 'Event ID is required' });
    }

    // Get the event
    const eventData = await EventModel.get(userId, eventId);
    if (!eventData) {
      return createResponse(404, { error: 'Event not found' });
    }

    // Get user profile
    const userProfile = await UserProfileModel.get(userId);
    if (!userProfile) {
      return createResponse(404, { error: 'User profile not found' });
    }

    // Schedule posts for the event
    const request: SchedulePostsRequest = {
      event: eventData,
      userProfile,
      customTemplate,
      organizationId
    };

    const result = await SocialMediaService.schedulePostsForEvent(request);

    if (result.errors.length > 0) {
      return createResponse(207, { // Multi-status
        scheduledPosts: result.scheduledPosts,
        errors: result.errors
      });
    }

    return createResponse(201, {
      scheduledPosts: result.scheduledPosts,
      message: `Scheduled ${result.scheduledPosts.length} posts for event`
    });

  } catch (error) {
    console.error('Error scheduling posts:', error);
    return handleError(error);
  }
}

async function getScheduledPosts(
  event: APIGatewayProxyEvent, 
  userId: string
): Promise<APIGatewayProxyResult> {
  try {
    const queryParams = event.queryStringParameters || {};
    const { eventId, status } = queryParams;

    // This would need to be implemented in SocialMediaService
    // For now, return a placeholder response
    return createResponse(200, {
      posts: [],
      message: 'Get scheduled posts functionality to be implemented'
    });

  } catch (error) {
    console.error('Error getting scheduled posts:', error);
    return handleError(error);
  }
}

async function cancelScheduledPost(
  postId: string, 
  userId: string
): Promise<APIGatewayProxyResult> {
  try {
    // This would need to be implemented in SocialMediaService
    // For now, return a placeholder response
    return createResponse(200, {
      message: 'Cancel scheduled post functionality to be implemented'
    });

  } catch (error) {
    console.error('Error canceling scheduled post:', error);
    return handleError(error);
  }
}