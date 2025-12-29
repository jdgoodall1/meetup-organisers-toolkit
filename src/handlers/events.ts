// Events Lambda handler

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createResponse, handleError, parseJSON } from '../shared/utils';
import { validateConfig } from '../shared/config';
import { EventService, CreateEventRequest } from '../shared/event-service';
import { EventModel } from '../shared/models';
import { MeetupClient } from '../shared/meetup-client';
import { getUserFromEvent } from '../shared/auth';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Always add CORS headers to every response
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Max-Age': '86400'
  };

  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: ''
      };
    }

    // Validate configuration on cold start
    validateConfig();

    const { httpMethod, pathParameters, body } = event;
    const eventId = pathParameters?.eventId;

    // Get user from JWT token
    const user = await getUserFromEvent(event);
    if (!user) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    // Initialize services
    let meetupClient: MeetupClient | undefined;
    if (user.meetupCredentials) {
      meetupClient = new MeetupClient(user.meetupCredentials);
    }
    const eventService = new EventService(meetupClient);

    switch (httpMethod) {
      case 'GET':
        if (eventId) {
          // Get single event
          const eventRecord = await EventModel.get(user.userId, eventId);
          if (!eventRecord) {
            return {
              statusCode: 404,
              headers: corsHeaders,
              body: JSON.stringify({ error: 'Event not found' })
            };
          }
          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(eventRecord)
          };
        } else {
          // Get all events for user
          const events = await EventModel.getByUserId(user.userId);
          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(events)
          };
        }

      case 'POST':
        if (pathParameters?.action === 'sync') {
          // Trigger manual synchronization
          // TODO: Implement sync functionality
          return createResponse(200, { message: 'Sync triggered' });
        } else if (eventId && pathParameters?.action === 'confirm') {
          // Confirm draft event
          const eventRecord = await EventModel.get(user.userId, eventId);
          if (!eventRecord) {
            return createResponse(404, { error: 'Event not found' });
          }

          const requestData = parseJSON<{ groupId?: string }>(body) || {};
          const result = await eventService.confirmEvent(eventRecord, requestData.groupId);
          await EventModel.update(result.event);

          return createResponse(200, {
            event: result.event,
            meetupEvent: result.meetupEvent,
            errors: result.errors
          });
        } else {
          // Create new event
          const requestData = parseJSON<CreateEventRequest>(body);
          if (!requestData) {
            return createResponse(400, { error: 'Invalid request body' });
          }

          // Validate required fields
          if (!requestData.title || !requestData.description || !requestData.dateTime || !requestData.location) {
            return createResponse(400, { error: 'Missing required fields' });
          }

          const result = await eventService.createEvent(
            user.userId,
            user,
            {
              ...requestData,
              dateTime: new Date(requestData.dateTime),
              groupId: requestData.groupId // Pass groupId from request if provided
            }
          );

          // Save event to database
          await EventModel.create(result.event);

          return createResponse(201, {
            event: result.event,
            meetupEvent: result.meetupEvent,
            errors: result.errors
          });
        }

      case 'PUT':
        if (!eventId) {
          return createResponse(400, { error: 'Event ID required' });
        }

        const eventRecord = await EventModel.get(user.userId, eventId);
        if (!eventRecord) {
          return createResponse(404, { error: 'Event not found' });
        }

        const updateData = parseJSON<Partial<CreateEventRequest>>(body);
        if (!updateData) {
          return createResponse(400, { error: 'Invalid request body' });
        }

        const updateResult = await eventService.updateEvent(
          eventRecord,
          {
            ...updateData,
            dateTime: updateData.dateTime ? new Date(updateData.dateTime) : undefined
          },
          updateData.groupId
        );

        await EventModel.update(updateResult.event);

        return createResponse(200, {
          event: updateResult.event,
          meetupEvent: updateResult.meetupEvent,
          errors: updateResult.errors
        });

      case 'DELETE':
        if (!eventId) {
          return createResponse(400, { error: 'Event ID required' });
        }

        const eventToCancel = await EventModel.get(user.userId, eventId);
        if (!eventToCancel) {
          return createResponse(404, { error: 'Event not found' });
        }

        const cancelResult = await eventService.cancelEvent(
          eventToCancel,
          // For now, we'll handle groupId in the service or get it from the event
          undefined
        );

        await EventModel.update(cancelResult.event);

        return createResponse(200, {
          event: cancelResult.event,
          meetupEvent: cancelResult.meetupEvent,
          errors: cancelResult.errors
        });

      default:
        return createResponse(405, { error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in events handler:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};