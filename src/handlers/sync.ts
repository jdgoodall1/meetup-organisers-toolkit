// Synchronization Lambda handler

import { APIGatewayProxyEvent, APIGatewayProxyResult, EventBridgeEvent } from 'aws-lambda';
import { createResponse, handleError, parseJSON } from '../shared/utils';
import { validateConfig } from '../shared/config';
import { SyncService, ConflictResolution } from '../shared/sync-service';
import { getUserFromEvent, getUserProfile } from '../shared/auth';
import { MeetupClient } from '../shared/meetup-client';
import { LinkedInClient } from '../shared/linkedin-client';

type SyncEvent = APIGatewayProxyEvent | EventBridgeEvent<string, any>;

function isApiGatewayEvent(event: SyncEvent): event is APIGatewayProxyEvent {
  return 'httpMethod' in event && 'resource' in event;
}

export const handler = async (
  event: SyncEvent
): Promise<APIGatewayProxyResult | void> => {
  try {
    validateConfig();

    // Handle API Gateway events (REST API requests)
    if (isApiGatewayEvent(event)) {
      return await handleApiRequest(event);
    }

    // Handle EventBridge events (periodic sync triggers)
    await handleEventBridgeEvent(event as EventBridgeEvent<string, any>);
  } catch (error) {
    console.error('Sync handler error:', error);
    if (isApiGatewayEvent(event)) {
      return handleError(error);
    }
    throw error;
  }
};

async function handleApiRequest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { httpMethod, resource } = event;

  // Get authenticated user
  const user = await getUserFromEvent(event);
  if (!user) {
    return createResponse(401, { error: 'Unauthorized' });
  }

  // Initialize sync service with available clients
  let meetupClient: MeetupClient | undefined;
  let linkedinClient: LinkedInClient | undefined;

  if (user.meetupCredentials) {
    meetupClient = new MeetupClient(user.meetupCredentials);
  }
  if (user.linkedinCredentials) {
    linkedinClient = new LinkedInClient(user.linkedinCredentials);
  }

  const syncService = new SyncService(meetupClient, linkedinClient);

  switch (`${httpMethod} ${resource}`) {
    case 'POST /events/sync': {
      // Trigger manual synchronization
      const result = await syncService.performPeriodicSync(user.userId, user);

      return createResponse(200, {
        message: 'Synchronization completed',
        meetupSync: result.meetupSync ? {
          status: result.meetupSync.syncRecord.status,
          eventsImported: result.meetupSync.syncRecord.eventsImported,
          eventsUpdated: result.meetupSync.syncRecord.eventsUpdated,
          conflictsDetected: result.meetupSync.syncRecord.conflictsDetected
        } : null,
        linkedinSync: result.linkedinSync ? {
          status: result.linkedinSync.syncRecord.status,
          eventsImported: result.linkedinSync.syncRecord.eventsImported,
          eventsUpdated: result.linkedinSync.syncRecord.eventsUpdated,
          conflictsDetected: result.linkedinSync.syncRecord.conflictsDetected
        } : null,
        errors: result.errors
      });
    }

    case 'GET /sync/status': {
      // Return sync status for the user
      // In a full implementation, this would query the SyncRecords table
      return createResponse(200, {
        userId: user.userId,
        lastSyncTime: user.lastSyncTime,
        status: 'idle',
        message: 'Sync status retrieved'
      });
    }

    case 'POST /sync/resolve-conflict': {
      if (!event.body) {
        return createResponse(400, { error: 'Request body is required' });
      }

      const body = parseJSON<{ resolutions?: ConflictResolution[] }>(event.body);
      if (!body || !body.resolutions || !Array.isArray(body.resolutions)) {
        return createResponse(400, { error: 'resolutions array is required' });
      }

      // Validate each resolution
      for (const resolution of body.resolutions) {
        if (!resolution.conflictId || !resolution.resolution) {
          return createResponse(400, { error: 'Each resolution must have conflictId and resolution' });
        }
        if (!['local', 'external'].includes(resolution.resolution)) {
          return createResponse(400, { error: 'resolution must be either "local" or "external"' });
        }
      }

      const result = await syncService.resolveConflicts(body.resolutions);

      return createResponse(200, {
        resolved: result.resolved,
        errors: result.errors
      });
    }

    default:
      return createResponse(405, { error: 'Method not allowed' });
  }
}

async function handleEventBridgeEvent(event: EventBridgeEvent<string, any>): Promise<void> {
  console.log('Sync handler triggered by EventBridge:', event.source, event['detail-type']);

  // Periodic sync is handled by EventBridge - in production this would
  // iterate over all users and sync their events
  console.log('Periodic sync triggered - would sync all users');
}
