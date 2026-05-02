// Integration tests for API endpoints
// Tests complete request/response cycles, authentication, authorization, error handling, and validation
// Validates: All API-related requirements

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import jwt from 'jsonwebtoken';
import { config } from '../src/shared/config';

// ============================================================
// Mock Setup
// ============================================================

// Mock AWS clients before any imports that use them
jest.mock('../src/shared/aws-clients', () => ({
  dynamoDocClient: {
    send: jest.fn(),
  },
  cognitoClient: {
    send: jest.fn(),
  },
  sqsClient: {
    send: jest.fn(),
  },
  eventBridgeClient: {
    send: jest.fn(),
  },
  clientConfig: { region: 'us-east-1', maxAttempts: 3 },
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn() },
  GetCommand: jest.fn(),
  PutCommand: jest.fn(),
  UpdateCommand: jest.fn(),
  DeleteCommand: jest.fn(),
  QueryCommand: jest.fn(),
  ScanCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(),
}));

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(),
  GetUserCommand: jest.fn(),
  AdminGetUserCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn(),
  SendMessageCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-eventbridge', () => ({
  EventBridgeClient: jest.fn(),
  PutEventsCommand: jest.fn(),
}));

// ============================================================
// Helpers
// ============================================================

const TEST_USER_ID = 'test-user-123';
const TEST_EMAIL = 'test@example.com';
const TEST_NAME = 'Test User';

function createValidToken(): string {
  const payload = {
    sub: TEST_USER_ID,
    email: TEST_EMAIL,
    name: TEST_NAME,
    'cognito:username': 'testuser',
    aud: config.cognito.userPoolClientId || 'test-client-id',
    iss: 'https://cognito-idp.us-east-1.amazonaws.com/test',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000) - 60,
  };
  return jwt.sign(payload, 'mock-secret');
}

function createBaseEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    resource: '/',
    path: '/',
    headers: {
      Authorization: `Bearer ${createValidToken()}`,
    },
    queryStringParameters: null,
    pathParameters: null,
    body: null,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    ...overrides,
  };
}

function createUnauthenticatedEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return createBaseEvent({
    headers: {},
    ...overrides,
  });
}

function parseBody(result: APIGatewayProxyResult): any {
  return JSON.parse(result.body);
}

const mockUserProfile = {
  userId: TEST_USER_ID,
  email: TEST_EMAIL,
  name: TEST_NAME,
  manualConfirmationEnabled: false,
  notificationPreferences: {
    email: true,
    inApp: true,
    successNotifications: true,
    errorNotifications: true,
    reminderNotifications: true,
  },
  lastSyncTime: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ============================================================
// Mock auth module to control authentication
// ============================================================

// We mock getUserFromEvent and authenticateRequest at the auth module level
jest.mock('../src/shared/auth', () => {
  const original = jest.requireActual('../src/shared/auth');
  return {
    ...original,
    getUserFromEvent: jest.fn(),
    authenticateRequest: jest.fn(),
    getUserProfile: jest.fn(),
    createOrUpdateUserProfile: jest.fn(),
    invalidateSession: jest.fn().mockResolvedValue(undefined),
  };
});

// Import after mocks are set up
import { getUserFromEvent, authenticateRequest, invalidateSession } from '../src/shared/auth';
import { handler as eventsHandler } from '../src/handlers/events';
import { handler as socialHandler } from '../src/handlers/social';
import { handler as messagingHandler } from '../src/handlers/messaging';
import { handler as notificationsHandler } from '../src/handlers/notifications';
import { handler as syncHandler } from '../src/handlers/sync';
import { handler as authHandler } from '../src/handlers/auth';
import { dynamoDocClient } from '../src/shared/aws-clients';

const mockGetUserFromEvent = getUserFromEvent as jest.MockedFunction<typeof getUserFromEvent>;
const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;
const mockInvalidateSession = invalidateSession as jest.MockedFunction<typeof invalidateSession>;
const mockDynamoSend = (dynamoDocClient as any).send as jest.Mock;

// ============================================================
// Tests
// ============================================================

describe('API Endpoints Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: authenticated user
    mockGetUserFromEvent.mockResolvedValue(mockUserProfile as any);
    mockAuthenticateRequest.mockResolvedValue({
      user: { userId: TEST_USER_ID, email: TEST_EMAIL, name: TEST_NAME },
      profile: mockUserProfile as any,
    });
    mockDynamoSend.mockResolvedValue({ Item: null, Items: [] });
  });

  // ============================================================
  // Events Handler Tests
  // ============================================================

  describe('Events Handler', () => {
    describe('GET /events', () => {
      it('should return 200 with events list for authenticated user', async () => {
        mockDynamoSend.mockResolvedValueOnce({ Items: [] }); // getByUserId query

        const event = createBaseEvent({
          httpMethod: 'GET',
          resource: '/events',
        });

        const result = await eventsHandler(event);
        expect(result.statusCode).toBe(200);
        const body = parseBody(result);
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('events');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'GET',
          resource: '/events',
        });

        const result = await eventsHandler(event);
        expect(result.statusCode).toBe(401);
        const body = parseBody(result);
        expect(body.data.error).toBe('Unauthorized');
      });
    });

    describe('GET /events/{id}', () => {
      it('should return 200 with event details when found', async () => {
        const mockEvent = {
          eventId: 'evt-1',
          userId: TEST_USER_ID,
          title: 'Test Event',
          description: 'Test',
          dateTime: new Date().toISOString(),
          location: 'Test Location',
          meetupEventStatus: 'published',
          platformStatus: 'confirmed',
          source: 'platform',
          requiresConfirmation: false,
          publishToMeetup: true,
          publishToLinkedIn: false,
          socialPostsScheduled: false,
          messagesScheduled: false,
          lastSyncTime: new Date().toISOString(),
          externallyModified: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        mockDynamoSend.mockResolvedValueOnce({ Item: { PK: `USER#${TEST_USER_ID}`, SK: 'EVENT#evt-1', ...mockEvent } });

        const event = createBaseEvent({
          httpMethod: 'GET',
          resource: '/events/{id}',
          pathParameters: { id: 'evt-1' },
        });

        const result = await eventsHandler(event);
        expect(result.statusCode).toBe(200);
        const body = parseBody(result);
        expect(body.data.event).toBeDefined();
        expect(body.data.event.eventId).toBe('evt-1');
      });

      it('should return 404 when event not found', async () => {
        mockDynamoSend.mockResolvedValueOnce({ Item: null });

        const event = createBaseEvent({
          httpMethod: 'GET',
          resource: '/events/{id}',
          pathParameters: { id: 'nonexistent' },
        });

        const result = await eventsHandler(event);
        expect(result.statusCode).toBe(404);
        const body = parseBody(result);
        expect(body.data.error).toBe('Event not found');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'GET',
          resource: '/events/{id}',
          pathParameters: { id: 'evt-1' },
        });

        const result = await eventsHandler(event);
        expect(result.statusCode).toBe(401);
      });
    });

    describe('POST /events', () => {
      it('should return 400 when body is missing or invalid', async () => {
        const event = createBaseEvent({
          httpMethod: 'POST',
          resource: '/events',
          body: null,
        });

        const result = await eventsHandler(event);
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('Invalid request body');
      });

      it('should return 400 when required fields are missing', async () => {
        const event = createBaseEvent({
          httpMethod: 'POST',
          resource: '/events',
          body: JSON.stringify({ title: 'Test' }), // missing description, dateTime, location
        });

        const result = await eventsHandler(event);
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('Missing required fields');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'POST',
          resource: '/events',
          body: JSON.stringify({
            title: 'Test',
            description: 'Desc',
            dateTime: new Date(Date.now() + 86400000).toISOString(),
            location: 'Loc',
          }),
        });

        const result = await eventsHandler(event);
        expect(result.statusCode).toBe(401);
      });
    });

    describe('DELETE /events/{id}', () => {
      it('should return 404 when event to delete is not found', async () => {
        mockDynamoSend.mockResolvedValueOnce({ Item: null });

        const event = createBaseEvent({
          httpMethod: 'DELETE',
          resource: '/events/{id}',
          pathParameters: { id: 'nonexistent' },
        });

        const result = await eventsHandler(event);
        expect(result.statusCode).toBe(404);
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'DELETE',
          resource: '/events/{id}',
          pathParameters: { id: 'evt-1' },
        });

        const result = await eventsHandler(event);
        expect(result.statusCode).toBe(401);
      });
    });

    describe('Unsupported method', () => {
      it('should return 405 for unsupported HTTP method', async () => {
        const event = createBaseEvent({
          httpMethod: 'PATCH',
          resource: '/events',
        });

        const result = await eventsHandler(event);
        expect(result.statusCode).toBe(405);
        const body = parseBody(result);
        expect(body.data.error).toBe('Method not allowed');
      });
    });
  });

  // ============================================================
  // Social Handler Tests
  // ============================================================

  describe('Social Handler', () => {
    describe('POST /social/schedule', () => {
      it('should return 400 when body is invalid', async () => {
        const event = createBaseEvent({
          httpMethod: 'POST',
          resource: '/social/schedule',
          body: 'not-json{{{',
        });

        const result = await socialHandler(event);
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('Invalid request body');
      });

      it('should return 400 when eventId is missing', async () => {
        const event = createBaseEvent({
          httpMethod: 'POST',
          resource: '/social/schedule',
          body: JSON.stringify({}),
        });

        const result = await socialHandler(event);
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('eventId is required');
      });

      it('should return 404 when event not found for scheduling', async () => {
        mockDynamoSend.mockResolvedValueOnce({ Item: null });

        const event = createBaseEvent({
          httpMethod: 'POST',
          resource: '/social/schedule',
          body: JSON.stringify({ eventId: 'nonexistent' }),
        });

        const result = await socialHandler(event);
        expect(result.statusCode).toBe(404);
        const body = parseBody(result);
        expect(body.data.error).toBe('Event not found');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'POST',
          resource: '/social/schedule',
          body: JSON.stringify({ eventId: 'evt-1' }),
        });

        const result = await socialHandler(event);
        expect(result.statusCode).toBe(401);
      });
    });

    describe('GET /social/posts', () => {
      it('should return 200 with posts list', async () => {
        const event = createBaseEvent({
          httpMethod: 'GET',
          resource: '/social/posts',
        });

        const result = await socialHandler(event);
        expect(result.statusCode).toBe(200);
        const body = parseBody(result);
        expect(body.data).toHaveProperty('posts');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'GET',
          resource: '/social/posts',
        });

        const result = await socialHandler(event);
        expect(result.statusCode).toBe(401);
      });
    });

    describe('DELETE /social/posts/{id}', () => {
      it('should return 200 when cancelling a post', async () => {
        const event = createBaseEvent({
          httpMethod: 'DELETE',
          resource: '/social/posts/{id}',
          pathParameters: { id: 'post-1' },
        });

        const result = await socialHandler(event);
        expect(result.statusCode).toBe(200);
        const body = parseBody(result);
        expect(body.data.postId).toBe('post-1');
      });

      it('should return 400 when post ID is missing', async () => {
        const event = createBaseEvent({
          httpMethod: 'DELETE',
          resource: '/social/posts/{id}',
          pathParameters: null,
        });

        const result = await socialHandler(event);
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('Post ID is required');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'DELETE',
          resource: '/social/posts/{id}',
          pathParameters: { id: 'post-1' },
        });

        const result = await socialHandler(event);
        expect(result.statusCode).toBe(401);
      });
    });

    describe('Unsupported method', () => {
      it('should return 405 for unsupported HTTP method', async () => {
        const event = createBaseEvent({
          httpMethod: 'PATCH',
          resource: '/social/posts',
        });

        const result = await socialHandler(event);
        expect(result.statusCode).toBe(405);
        const body = parseBody(result);
        expect(body.data.error).toBe('Method not allowed');
      });
    });
  });

  // ============================================================
  // Messaging Handler Tests
  // ============================================================

  describe('Messaging Handler', () => {
    describe('POST /messages/schedule', () => {
      it('should return 400 when body is missing', async () => {
        const event = createBaseEvent({
          httpMethod: 'POST',
          resource: '/messages/schedule',
          body: null,
        });

        const result = await messagingHandler(event);
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('Request body is required');
      });

      it('should return 400 when required fields are missing', async () => {
        const event = createBaseEvent({
          httpMethod: 'POST',
          resource: '/messages/schedule',
          body: JSON.stringify({ eventId: 'evt-1' }), // missing recipientType, scheduledTime
        });

        const result = await messagingHandler(event);
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('required');
      });

      it('should return 400 for invalid recipientType', async () => {
        const event = createBaseEvent({
          httpMethod: 'POST',
          resource: '/messages/schedule',
          body: JSON.stringify({
            eventId: 'evt-1',
            recipientType: 'invalid_type',
            scheduledTime: new Date(Date.now() + 86400000).toISOString(),
          }),
        });

        const result = await messagingHandler(event);
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('recipientType');
      });

      it('should return 404 when event not found', async () => {
        mockDynamoSend.mockResolvedValueOnce({ Item: null });

        const event = createBaseEvent({
          httpMethod: 'POST',
          resource: '/messages/schedule',
          body: JSON.stringify({
            eventId: 'nonexistent',
            recipientType: 'attendees',
            scheduledTime: new Date(Date.now() + 86400000).toISOString(),
          }),
        });

        const result = await messagingHandler(event);
        expect(result.statusCode).toBe(404);
        const body = parseBody(result);
        expect(body.data.error).toBe('Event not found');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'POST',
          resource: '/messages/schedule',
          body: JSON.stringify({
            eventId: 'evt-1',
            recipientType: 'attendees',
            scheduledTime: new Date(Date.now() + 86400000).toISOString(),
          }),
        });

        const result = await messagingHandler(event);
        expect(result.statusCode).toBe(401);
      });

      it('should return 400 for invalid JSON body', async () => {
        const event = createBaseEvent({
          httpMethod: 'POST',
          resource: '/messages/schedule',
          body: '{invalid-json',
        });

        const result = await messagingHandler(event);
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('Invalid JSON');
      });
    });

    describe('GET /messages', () => {
      it('should return 200 with messages list', async () => {
        const event = createBaseEvent({
          httpMethod: 'GET',
          resource: '/messages',
        });

        const result = await messagingHandler(event);
        expect(result.statusCode).toBe(200);
        const body = parseBody(result);
        expect(body.data).toHaveProperty('messages');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'GET',
          resource: '/messages',
        });

        const result = await messagingHandler(event);
        expect(result.statusCode).toBe(401);
      });
    });

    describe('PUT /messages/templates', () => {
      it('should return 400 when body is missing', async () => {
        const event = createBaseEvent({
          httpMethod: 'PUT',
          resource: '/messages/templates',
          body: null,
        });

        const result = await messagingHandler(event);
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('Request body is required');
      });

      it('should return 400 for invalid JSON body', async () => {
        const event = createBaseEvent({
          httpMethod: 'PUT',
          resource: '/messages/templates',
          body: 'not-json',
        });

        const result = await messagingHandler(event);
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('Invalid JSON');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'PUT',
          resource: '/messages/templates',
          body: JSON.stringify({ attendees: 'Hello {title}' }),
        });

        const result = await messagingHandler(event);
        expect(result.statusCode).toBe(401);
      });
    });

    describe('DELETE /messages/{id}', () => {
      it('should return 200 when cancelling a message', async () => {
        const event = createBaseEvent({
          httpMethod: 'DELETE',
          resource: '/messages/{id}',
          pathParameters: { id: 'msg-1' },
        });

        const result = await messagingHandler(event);
        expect(result.statusCode).toBe(200);
        const body = parseBody(result);
        expect(body.data.messageId).toBe('msg-1');
      });

      it('should return 400 when message ID is missing', async () => {
        const event = createBaseEvent({
          httpMethod: 'DELETE',
          resource: '/messages/{id}',
          pathParameters: null,
        });

        const result = await messagingHandler(event);
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('Message ID is required');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'DELETE',
          resource: '/messages/{id}',
          pathParameters: { id: 'msg-1' },
        });

        const result = await messagingHandler(event);
        expect(result.statusCode).toBe(401);
      });
    });

    describe('Unsupported method', () => {
      it('should return 405 for unsupported HTTP method', async () => {
        const event = createBaseEvent({
          httpMethod: 'PATCH',
          resource: '/messages',
        });

        const result = await messagingHandler(event);
        expect(result.statusCode).toBe(405);
        const body = parseBody(result);
        expect(body.data.error).toBe('Method not allowed');
      });
    });
  });

  // ============================================================
  // Notifications Handler Tests
  // ============================================================

  describe('Notifications Handler', () => {
    describe('GET /notifications', () => {
      it('should return 200 with notifications list', async () => {
        // Mock NotificationService.getNotifications
        mockDynamoSend.mockResolvedValueOnce({ Items: [] });

        const event = createBaseEvent({
          httpMethod: 'GET',
          resource: '/notifications',
        });

        const result = await notificationsHandler(event);
        expect(result.statusCode).toBe(200);
        const body = parseBody(result);
        expect(body.data).toHaveProperty('notifications');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'GET',
          resource: '/notifications',
        });

        const result = await notificationsHandler(event);
        expect(result.statusCode).toBe(401);
      });
    });

    describe('GET /notifications/preferences', () => {
      it('should return 200 with preferences', async () => {
        mockDynamoSend.mockResolvedValueOnce({
          Item: {
            email: true,
            inApp: true,
            successNotifications: true,
            errorNotifications: true,
            reminderNotifications: true,
          },
        });

        const event = createBaseEvent({
          httpMethod: 'GET',
          resource: '/notifications/preferences',
        });

        const result = await notificationsHandler(event);
        expect(result.statusCode).toBe(200);
        const body = parseBody(result);
        expect(body.data).toHaveProperty('preferences');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'GET',
          resource: '/notifications/preferences',
        });

        const result = await notificationsHandler(event);
        expect(result.statusCode).toBe(401);
      });
    });

    describe('PUT /notifications/preferences', () => {
      it('should return 200 when updating preferences', async () => {
        mockDynamoSend.mockResolvedValue({}); // For put operations

        const event = createBaseEvent({
          httpMethod: 'PUT',
          resource: '/notifications/preferences',
          body: JSON.stringify({
            email: false,
            inApp: true,
            successNotifications: true,
            errorNotifications: true,
            reminderNotifications: false,
          }),
        });

        const result = await notificationsHandler(event);
        expect(result.statusCode).toBe(200);
        const body = parseBody(result);
        expect(body.data).toHaveProperty('preferences');
      });

      it('should return 400 when body is missing', async () => {
        const event = createBaseEvent({
          httpMethod: 'PUT',
          resource: '/notifications/preferences',
          body: null,
        });

        const result = await notificationsHandler(event);
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('Request body is required');
      });

      it('should return 400 for invalid JSON body', async () => {
        const event = createBaseEvent({
          httpMethod: 'PUT',
          resource: '/notifications/preferences',
          body: '{bad-json',
        });

        const result = await notificationsHandler(event);
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('Invalid JSON');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'PUT',
          resource: '/notifications/preferences',
          body: JSON.stringify({ email: false }),
        });

        const result = await notificationsHandler(event);
        expect(result.statusCode).toBe(401);
      });
    });

    describe('PUT /notifications/{id}/read', () => {
      it('should return 200 when marking notification as read', async () => {
        mockDynamoSend.mockResolvedValue({}); // For update operation

        const event = createBaseEvent({
          httpMethod: 'PUT',
          resource: '/notifications/{id}/read',
          pathParameters: { id: 'notif-1' },
        });

        const result = await notificationsHandler(event);
        expect(result.statusCode).toBe(200);
        const body = parseBody(result);
        expect(body.data.message).toContain('marked as read');
      });

      it('should return 400 when notification ID is missing', async () => {
        const event = createBaseEvent({
          httpMethod: 'PUT',
          resource: '/notifications/{id}/read',
          pathParameters: null,
        });

        const result = await notificationsHandler(event);
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('Notification ID is required');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'PUT',
          resource: '/notifications/{id}/read',
          pathParameters: { id: 'notif-1' },
        });

        const result = await notificationsHandler(event);
        expect(result.statusCode).toBe(401);
      });
    });

    describe('Unsupported method', () => {
      it('should return 405 for unsupported HTTP method', async () => {
        const event = createBaseEvent({
          httpMethod: 'PATCH',
          resource: '/notifications',
        });

        const result = await notificationsHandler(event);
        expect(result.statusCode).toBe(405);
        const body = parseBody(result);
        expect(body.data.error).toBe('Method not allowed');
      });
    });
  });

  // ============================================================
  // Sync Handler Tests
  // ============================================================

  describe('Sync Handler', () => {
    describe('POST /events/sync', () => {
      it('should return 200 on successful sync', async () => {
        // The sync handler creates a SyncService and calls performPeriodicSync
        // We need to mock the MeetupClient and LinkedInClient constructors
        // Since user has no credentials, sync will return null results
        const event = createBaseEvent({
          httpMethod: 'POST',
          resource: '/events/sync',
        });

        const result = await syncHandler(event) as APIGatewayProxyResult;
        expect(result.statusCode).toBe(200);
        const body = parseBody(result);
        expect(body.data).toHaveProperty('message');
        expect(body.data.message).toContain('Synchronization');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'POST',
          resource: '/events/sync',
        });

        const result = await syncHandler(event) as APIGatewayProxyResult;
        expect(result.statusCode).toBe(401);
      });
    });

    describe('GET /sync/status', () => {
      it('should return 200 with sync status', async () => {
        const event = createBaseEvent({
          httpMethod: 'GET',
          resource: '/sync/status',
        });

        const result = await syncHandler(event) as APIGatewayProxyResult;
        expect(result.statusCode).toBe(200);
        const body = parseBody(result);
        expect(body.data).toHaveProperty('userId');
        expect(body.data).toHaveProperty('status');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'GET',
          resource: '/sync/status',
        });

        const result = await syncHandler(event) as APIGatewayProxyResult;
        expect(result.statusCode).toBe(401);
      });
    });

    describe('POST /sync/resolve-conflict', () => {
      it('should return 400 when body is missing', async () => {
        const event = createBaseEvent({
          httpMethod: 'POST',
          resource: '/sync/resolve-conflict',
          body: null,
        });

        const result = await syncHandler(event) as APIGatewayProxyResult;
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('Request body is required');
      });

      it('should return 400 when resolutions array is missing', async () => {
        const event = createBaseEvent({
          httpMethod: 'POST',
          resource: '/sync/resolve-conflict',
          body: JSON.stringify({}),
        });

        const result = await syncHandler(event) as APIGatewayProxyResult;
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('resolutions array is required');
      });

      it('should return 400 when resolution is missing conflictId', async () => {
        const event = createBaseEvent({
          httpMethod: 'POST',
          resource: '/sync/resolve-conflict',
          body: JSON.stringify({
            resolutions: [{ resolution: 'local' }], // missing conflictId
          }),
        });

        const result = await syncHandler(event) as APIGatewayProxyResult;
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('conflictId and resolution');
      });

      it('should return 400 when resolution value is invalid', async () => {
        const event = createBaseEvent({
          httpMethod: 'POST',
          resource: '/sync/resolve-conflict',
          body: JSON.stringify({
            resolutions: [{ conflictId: 'c-1', resolution: 'invalid' }],
          }),
        });

        const result = await syncHandler(event) as APIGatewayProxyResult;
        expect(result.statusCode).toBe(400);
        const body = parseBody(result);
        expect(body.data.error).toContain('must be either "local" or "external"');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockGetUserFromEvent.mockResolvedValueOnce(null);

        const event = createUnauthenticatedEvent({
          httpMethod: 'POST',
          resource: '/sync/resolve-conflict',
          body: JSON.stringify({
            resolutions: [{ conflictId: 'c-1', resolution: 'local' }],
          }),
        });

        const result = await syncHandler(event) as APIGatewayProxyResult;
        expect(result.statusCode).toBe(401);
      });
    });

    describe('Unsupported method', () => {
      it('should return 405 for unsupported HTTP method', async () => {
        const event = createBaseEvent({
          httpMethod: 'PATCH',
          resource: '/sync/status',
        });

        const result = await syncHandler(event) as APIGatewayProxyResult;
        expect(result.statusCode).toBe(405);
        const body = parseBody(result);
        expect(body.data.error).toBe('Method not allowed');
      });
    });
  });

  // ============================================================
  // Auth Handler Tests
  // ============================================================

  describe('Auth Handler', () => {
    describe('GET /auth/profile', () => {
      it('should return 200 with user profile', async () => {
        const event = createBaseEvent({
          httpMethod: 'GET',
          resource: '/auth/profile',
        });

        const result = await authHandler(event);
        expect(result.statusCode).toBe(200);
        const body = parseBody(result);
        expect(body.success).toBe(true);
        // Auth handler wraps ApiResponse as data, so message is at body.data.message
        expect(body.data).toBeDefined();
        expect(body.data.message).toContain('Profile retrieved');
      });

      it('should return error for unauthenticated request', async () => {
        mockAuthenticateRequest.mockRejectedValueOnce(new Error('No authorization header provided'));

        const event = createUnauthenticatedEvent({
          httpMethod: 'GET',
          resource: '/auth/profile',
        });

        const result = await authHandler(event);
        // The auth handler uses withAuthAndCors which calls handleError
        expect(result.statusCode).toBeGreaterThanOrEqual(400);
      });
    });

    describe('PUT /auth/profile', () => {
      it('should return 200 when updating profile with valid fields', async () => {
        mockDynamoSend.mockResolvedValue({}); // For PutCommand

        const event = createBaseEvent({
          httpMethod: 'PUT',
          resource: '/auth/profile',
          body: JSON.stringify({ name: 'Updated Name' }),
        });

        const result = await authHandler(event);
        expect(result.statusCode).toBe(200);
        const body = parseBody(result);
        expect(body.success).toBe(true);
        // Auth handler wraps ApiResponse as data
        expect(body.data.message).toContain('Profile updated');
      });

      it('should return error when body is missing', async () => {
        const event = createBaseEvent({
          httpMethod: 'PUT',
          resource: '/auth/profile',
          body: null,
        });

        const result = await authHandler(event);
        // handleError will catch the thrown Error('Request body is required')
        // and since it contains 'required', it returns 400
        expect(result.statusCode).toBe(400);
      });

      it('should return error when no valid fields provided', async () => {
        const event = createBaseEvent({
          httpMethod: 'PUT',
          resource: '/auth/profile',
          body: JSON.stringify({ invalidField: 'value' }),
        });

        const result = await authHandler(event);
        // handleError catches Error('No valid fields to update')
        expect(result.statusCode).toBeGreaterThanOrEqual(400);
      });

      it('should return error for unauthenticated request', async () => {
        mockAuthenticateRequest.mockRejectedValueOnce(new Error('No authorization header provided'));

        const event = createUnauthenticatedEvent({
          httpMethod: 'PUT',
          resource: '/auth/profile',
          body: JSON.stringify({ name: 'Test' }),
        });

        const result = await authHandler(event);
        expect(result.statusCode).toBeGreaterThanOrEqual(400);
      });
    });

    describe('POST /auth/logout', () => {
      it('should return 200 on successful logout', async () => {
        const event = createBaseEvent({
          httpMethod: 'POST',
          resource: '/auth/logout',
        });

        const result = await authHandler(event);
        expect(result.statusCode).toBe(200);
        const body = parseBody(result);
        expect(body.success).toBe(true);
        // Auth handler wraps ApiResponse as data
        expect(body.data.message).toContain('Logged out');
      });

      it('should return error for unauthenticated request', async () => {
        mockAuthenticateRequest.mockRejectedValueOnce(new Error('No authorization header provided'));

        const event = createUnauthenticatedEvent({
          httpMethod: 'POST',
          resource: '/auth/logout',
        });

        const result = await authHandler(event);
        expect(result.statusCode).toBeGreaterThanOrEqual(400);
      });
    });

    describe('Unsupported route', () => {
      it('should return 404 for unsupported route', async () => {
        const event = createBaseEvent({
          httpMethod: 'DELETE',
          resource: '/auth/profile',
        });

        const result = await authHandler(event);
        expect(result.statusCode).toBe(404);
        const body = parseBody(result);
        expect(body.success).toBe(false);
        // Auth handler wraps the error object as data
        expect(body.data.error).toContain('Route not found');
      });
    });
  });

  // ============================================================
  // Cross-cutting Concerns
  // ============================================================

  describe('Cross-cutting: Response format', () => {
    it('should include CORS headers in all responses', async () => {
      const event = createBaseEvent({
        httpMethod: 'GET',
        resource: '/notifications',
      });

      mockDynamoSend.mockResolvedValueOnce({ Items: [] });

      const result = await notificationsHandler(event);
      expect(result.headers).toBeDefined();
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers!['Content-Type']).toBe('application/json');
    });

    it('should return valid JSON in all response bodies', async () => {
      const event = createBaseEvent({
        httpMethod: 'GET',
        resource: '/messages',
      });

      const result = await messagingHandler(event);
      expect(() => JSON.parse(result.body)).not.toThrow();
    });
  });
});
