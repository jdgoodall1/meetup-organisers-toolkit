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
  try {
    validateConfig();

    const { httpMethod, resource, pathParameters, body } = event;
    const eventId = pathParameters?.id;

    // Get user from JWT token
    const user = await getUserFromEvent(event);
    if (!user) {
      return createResponse(401, { error: 'Unauthorized' });
    }

    // Initialize services
    let meetupClient: MeetupClient | undefined;
    if (user.meetupCredentials) {
      meetupClient = new MeetupClient(user.meetupCredentials);
    }
    const eventService = new EventService(meetupClient);

    // Route based on httpMethod + resource pattern
    switch (`${httpMethod} ${resource}`) {
      case 'GET /events': {
        const events = await EventModel.getByUserId(user.userId);
        return createResponse(200, { events });
      }

      case 'GET /events/{id}': {
        if (!eventId) {
          return createResponse(400, { error: 'Event ID is required' });
        }
        const eventRecord = await EventModel.get(user.userId, eventId);
        if (!eventRecord) {
          return createResponse(404, { error: 'Event not found' });
        }
        return createResponse(200, { event: eventRecord });
      }

      case 'POST /events': {
        const requestData = parseJSON<CreateEventRequest>(body);
        if (!requestData) {
          return createResponse(400, { error: 'Invalid request body' });
        }

        if (!requestData.title || !requestData.description || !requestData.dateTime || !requestData.location) {
          return createResponse(400, { error: 'Missing required fields: title, description, dateTime, and location are required' });
        }

        const result = await eventService.createEvent(
          user.userId,
          user,
          {
            ...requestData,
            dateTime: new Date(requestData.dateTime),
            groupId: requestData.groupId
          }
        );

        await EventModel.create(result.event);

        return createResponse(201, {
          event: result.event,
          meetupEvent: result.meetupEvent,
          errors: result.errors
        });
      }

      case 'POST /events/{id}/confirm': {
        if (!eventId) {
          return createResponse(400, { error: 'Event ID is required' });
        }
        const eventRecord = await EventModel.get(user.userId, eventId);
        if (!eventRecord) {
          return createResponse(404, { error: 'Event not found' });
        }

        if (eventRecord.platformStatus !== 'pending_confirmation') {
          return createResponse(400, { error: 'Event is not in pending confirmation status' });
        }

        const requestData = parseJSON<{ groupId?: string }>(body) || {};
        const result = await eventService.confirmEvent(eventRecord, requestData.groupId);
        await EventModel.update(result.event);

        return createResponse(200, {
          event: result.event,
          meetupEvent: result.meetupEvent,
          errors: result.errors
        });
      }

      case 'POST /events/{id}/reject': {
        if (!eventId) {
          return createResponse(400, { error: 'Event ID is required' });
        }
        const eventToReject = await EventModel.get(user.userId, eventId);
        if (!eventToReject) {
          return createResponse(404, { error: 'Event not found' });
        }

        if (eventToReject.platformStatus !== 'pending_confirmation') {
          return createResponse(400, { error: 'Event is not in pending confirmation status' });
        }

        const rejectResult = await eventService.rejectEvent(eventToReject);
        await EventModel.update(rejectResult.event);

        return createResponse(200, {
          event: rejectResult.event,
          errors: rejectResult.errors
        });
      }

      case 'PUT /events/{id}': {
        if (!eventId) {
          return createResponse(400, { error: 'Event ID is required' });
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
      }

      case 'DELETE /events/{id}': {
        if (!eventId) {
          return createResponse(400, { error: 'Event ID is required' });
        }

        const eventToCancel = await EventModel.get(user.userId, eventId);
        if (!eventToCancel) {
          return createResponse(404, { error: 'Event not found' });
        }

        const cancelResult = await eventService.cancelEvent(eventToCancel, undefined);
        await EventModel.update(cancelResult.event);

        return createResponse(200, {
          event: cancelResult.event,
          meetupEvent: cancelResult.meetupEvent,
          errors: cancelResult.errors
        });
      }

      default:
        return createResponse(405, { error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in events handler:', error);
    return handleError(error);
  }
};
