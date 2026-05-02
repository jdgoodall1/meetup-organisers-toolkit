// Unit tests for draft event rejection functionality
// Validates: Requirements 10.5

import { EventService } from '../src/shared/event-service';
import { MeetupClient, MeetupApiError } from '../src/shared/meetup-client';
import { LinkedInClient, LinkedInApiError } from '../src/shared/linkedin-client';
import { SocialMediaService } from '../src/shared/social-media-service';
import { MessagingService } from '../src/shared/messaging-service';
import { NotificationService } from '../src/shared/notification-service';
import { Event, UserProfile } from '../src/shared/types';
import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock axios
jest.mock('axios');

// Mock SocialMediaService static methods
jest.mock('../src/shared/social-media-service', () => ({
  SocialMediaService: {
    cancelPostsForEvent: jest.fn().mockResolvedValue(undefined),
    schedulePostsForEvent: jest.fn(),
    executeScheduledPost: jest.fn(),
    updatePostsForEvent: jest.fn(),
    confirmPostsForEvent: jest.fn(),
    getPostsReadyForExecution: jest.fn()
  }
}));

// Mock MessagingService static methods
jest.mock('../src/shared/messaging-service', () => ({
  MessagingService: {
    cancelMessagesForEvent: jest.fn().mockResolvedValue(undefined),
    scheduleMessage: jest.fn(),
    sendMessage: jest.fn(),
    sendMessages: jest.fn(),
    confirmMessagesForEvent: jest.fn(),
    updateMessageTemplate: jest.fn()
  }
}));

// Mock NotificationService static methods
jest.mock('../src/shared/notification-service', () => ({
  NotificationService: {
    sendNotification: jest.fn().mockResolvedValue({
      notification: {
        notificationId: 'mock-notification-id',
        userId: 'mock-user',
        type: 'info',
        title: 'Draft Event Rejected',
        message: 'mock message',
        read: false,
        createdAt: new Date()
      },
      emailSent: true,
      inAppStored: true,
      skippedByPreference: false
    }),
    sendSuccessNotification: jest.fn(),
    sendErrorNotification: jest.fn(),
    sendPriorityNotification: jest.fn(),
    updateNotificationPreferences: jest.fn(),
    getNotificationPreferences: jest.fn(),
    checkInactivity: jest.fn(),
    sendInactivityReminder: jest.fn(),
    getNotifications: jest.fn(),
    markAsRead: jest.fn(),
    shouldSkipNotification: jest.fn()
  }
}));

// Mock EventModel for handler tests
jest.mock('../src/shared/models', () => {
  const original = jest.requireActual('../src/shared/models');
  return {
    ...original,
    EventModel: {
      ...original.EventModel,
      get: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(),
      getByUserId: jest.fn(),
      delete: jest.fn()
    }
  };
});

// Mock auth module for handler tests
jest.mock('../src/shared/auth', () => ({
  getUserFromEvent: jest.fn(),
  validateToken: jest.fn(),
  extractAuthFromEvent: jest.fn(),
  createOrUpdateUserProfile: jest.fn(),
  getUserProfile: jest.fn(),
  authenticateRequest: jest.fn(),
  invalidateSession: jest.fn()
}));

describe('Rejection Functionality Unit Tests', () => {
  let eventService: EventService;
  let mockMeetupClient: jest.Mocked<MeetupClient>;
  let mockLinkedInClient: jest.Mocked<LinkedInClient>;
  let baseDraftEvent: Event;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMeetupClient = {
      createEvent: jest.fn(),
      publishDraftEvent: jest.fn(),
      updateEvent: jest.fn(),
      cancelEvent: jest.fn(),
      getEvent: jest.fn(),
      getGroupEvents: jest.fn(),
      getGroupMembers: jest.fn(),
      getEventAttendees: jest.fn(),
      getManagedGroups: jest.fn(),
      sendMessage: jest.fn()
    } as any;

    mockLinkedInClient = {
      getProfile: jest.fn(),
      getOrganizations: jest.fn(),
      getOrganizationEvents: jest.fn(),
      createEvent: jest.fn(),
      createPost: jest.fn(),
      schedulePost: jest.fn(),
      updateEvent: jest.fn(),
      cancelEvent: jest.fn(),
      getEvent: jest.fn()
    } as any;

    eventService = new EventService(mockMeetupClient, mockLinkedInClient);

    baseDraftEvent = {
      eventId: 'event-123',
      userId: 'user-123',
      title: 'Draft Tech Meetup',
      description: 'A draft event for testing',
      dateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      location: 'Test Venue',
      meetupEventId: 'meetup-draft-123',
      meetupEventStatus: 'draft',
      linkedinEventId: undefined,
      linkedinEventStatus: 'draft',
      platformStatus: 'pending_confirmation',
      source: 'platform',
      requiresConfirmation: true,
      publishToMeetup: true,
      publishToLinkedIn: false,
      socialPostsScheduled: true,
      messagesScheduled: true,
      lastSyncTime: new Date(),
      externallyModified: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  });

  // --- Rejection Workflow ---

  describe('Rejection workflow', () => {
    test('should successfully reject a draft event and set platformStatus to cancelled', async () => {
      mockMeetupClient.cancelEvent.mockResolvedValue({
        id: 'meetup-draft-123',
        name: 'Draft Tech Meetup',
        description: 'A draft event for testing',
        time: baseDraftEvent.dateTime.getTime(),
        status: 'cancelled'
      });

      const result = await eventService.rejectEvent(baseDraftEvent, 'group-123');

      expect(result.event.platformStatus).toBe('cancelled');
      expect(result.event.updatedAt).toBeInstanceOf(Date);
    });

    test('should cancel Meetup draft when event has meetupEventId', async () => {
      mockMeetupClient.cancelEvent.mockResolvedValue({
        id: 'meetup-draft-123',
        name: 'Draft Tech Meetup',
        description: 'A draft event for testing',
        time: baseDraftEvent.dateTime.getTime(),
        status: 'cancelled'
      });

      const result = await eventService.rejectEvent(baseDraftEvent, 'group-123');

      expect(mockMeetupClient.cancelEvent).toHaveBeenCalledWith('group-123', 'meetup-draft-123');
      expect(result.event.meetupEventStatus).toBe('cancelled');
      expect(result.errors).toHaveLength(0);
    });

    test('should cancel LinkedIn draft when event has linkedinEventId', async () => {
      const eventWithLinkedIn: Event = {
        ...baseDraftEvent,
        linkedinEventId: 'linkedin-draft-456',
        linkedinEventStatus: 'draft',
        publishToLinkedIn: true
      };

      mockMeetupClient.cancelEvent.mockResolvedValue({
        id: 'meetup-draft-123',
        name: 'Draft Tech Meetup',
        description: 'A draft event for testing',
        time: baseDraftEvent.dateTime.getTime(),
        status: 'cancelled'
      });

      mockLinkedInClient.cancelEvent.mockResolvedValue({
        id: 'linkedin-draft-456',
        name: 'Draft Tech Meetup',
        description: 'A draft event for testing',
        startDateTime: baseDraftEvent.dateTime.toISOString(),
        status: 'cancelled'
      });

      const result = await eventService.rejectEvent(eventWithLinkedIn, 'group-123');

      expect(mockLinkedInClient.cancelEvent).toHaveBeenCalledWith('linkedin-draft-456');
      expect(result.event.linkedinEventStatus).toBe('cancelled');
      expect(result.errors).toHaveLength(0);
    });

    test('should cancel both Meetup and LinkedIn drafts when both exist', async () => {
      const eventWithBoth: Event = {
        ...baseDraftEvent,
        linkedinEventId: 'linkedin-draft-456',
        linkedinEventStatus: 'draft',
        publishToLinkedIn: true
      };

      mockMeetupClient.cancelEvent.mockResolvedValue({
        id: 'meetup-draft-123',
        name: 'Draft Tech Meetup',
        description: 'A draft event for testing',
        time: baseDraftEvent.dateTime.getTime(),
        status: 'cancelled'
      });

      mockLinkedInClient.cancelEvent.mockResolvedValue({
        id: 'linkedin-draft-456',
        name: 'Draft Tech Meetup',
        description: 'A draft event for testing',
        startDateTime: baseDraftEvent.dateTime.toISOString(),
        status: 'cancelled'
      });

      const result = await eventService.rejectEvent(eventWithBoth, 'group-123');

      expect(mockMeetupClient.cancelEvent).toHaveBeenCalledWith('group-123', 'meetup-draft-123');
      expect(mockLinkedInClient.cancelEvent).toHaveBeenCalledWith('linkedin-draft-456');
      expect(result.event.meetupEventStatus).toBe('cancelled');
      expect(result.event.linkedinEventStatus).toBe('cancelled');
      expect(result.event.platformStatus).toBe('cancelled');
    });

    test('should handle local-only draft with no external platform IDs', async () => {
      const localOnlyEvent: Event = {
        ...baseDraftEvent,
        meetupEventId: undefined,
        meetupEventStatus: 'draft',
        linkedinEventId: undefined,
        linkedinEventStatus: 'draft'
      };

      const result = await eventService.rejectEvent(localOnlyEvent);

      expect(mockMeetupClient.cancelEvent).not.toHaveBeenCalled();
      expect(mockLinkedInClient.cancelEvent).not.toHaveBeenCalled();
      expect(result.event.platformStatus).toBe('cancelled');
      expect(result.event.linkedinEventStatus).toBe('cancelled');
      // SocialMediaService and MessagingService cleanup should still be called
      expect(SocialMediaService.cancelPostsForEvent).toHaveBeenCalledWith(localOnlyEvent.eventId);
      expect(MessagingService.cancelMessagesForEvent).toHaveBeenCalledWith(localOnlyEvent.eventId);
    });

    test('should mark meetupEventStatus as cancelled locally when meetupEventId exists but no groupId', async () => {
      const result = await eventService.rejectEvent(baseDraftEvent); // no groupId

      expect(mockMeetupClient.cancelEvent).not.toHaveBeenCalled();
      expect(result.event.meetupEventStatus).toBe('cancelled');
      expect(result.event.platformStatus).toBe('cancelled');
    });
  });

  // --- Cleanup Operations ---

  describe('Cleanup operations', () => {
    test('should call SocialMediaService.cancelPostsForEvent on rejection', async () => {
      mockMeetupClient.cancelEvent.mockResolvedValue({
        id: 'meetup-draft-123',
        name: 'Draft Tech Meetup',
        description: 'A draft event for testing',
        time: baseDraftEvent.dateTime.getTime(),
        status: 'cancelled'
      });

      await eventService.rejectEvent(baseDraftEvent, 'group-123');

      expect(SocialMediaService.cancelPostsForEvent).toHaveBeenCalledWith('event-123');
      expect(SocialMediaService.cancelPostsForEvent).toHaveBeenCalledTimes(1);
    });

    test('should call MessagingService.cancelMessagesForEvent on rejection', async () => {
      mockMeetupClient.cancelEvent.mockResolvedValue({
        id: 'meetup-draft-123',
        name: 'Draft Tech Meetup',
        description: 'A draft event for testing',
        time: baseDraftEvent.dateTime.getTime(),
        status: 'cancelled'
      });

      await eventService.rejectEvent(baseDraftEvent, 'group-123');

      expect(MessagingService.cancelMessagesForEvent).toHaveBeenCalledWith('event-123');
      expect(MessagingService.cancelMessagesForEvent).toHaveBeenCalledTimes(1);
    });

    test('should continue cleanup even if SocialMediaService fails (error isolation)', async () => {
      mockMeetupClient.cancelEvent.mockResolvedValue({
        id: 'meetup-draft-123',
        name: 'Draft Tech Meetup',
        description: 'A draft event for testing',
        time: baseDraftEvent.dateTime.getTime(),
        status: 'cancelled'
      });

      (SocialMediaService.cancelPostsForEvent as jest.Mock).mockRejectedValueOnce(
        new Error('Social media cleanup failed')
      );

      const result = await eventService.rejectEvent(baseDraftEvent, 'group-123');

      // Should still call messaging cleanup
      expect(MessagingService.cancelMessagesForEvent).toHaveBeenCalledWith('event-123');
      // Should still send notification
      expect(NotificationService.sendNotification).toHaveBeenCalled();
      // Error should be collected
      expect(result.errors).toContainEqual(
        expect.stringContaining('Failed to cancel scheduled posts')
      );
    });

    test('should continue cleanup even if MessagingService fails (error isolation)', async () => {
      mockMeetupClient.cancelEvent.mockResolvedValue({
        id: 'meetup-draft-123',
        name: 'Draft Tech Meetup',
        description: 'A draft event for testing',
        time: baseDraftEvent.dateTime.getTime(),
        status: 'cancelled'
      });

      (MessagingService.cancelMessagesForEvent as jest.Mock).mockRejectedValueOnce(
        new Error('Messaging cleanup failed')
      );

      const result = await eventService.rejectEvent(baseDraftEvent, 'group-123');

      // Should still have called social media cleanup
      expect(SocialMediaService.cancelPostsForEvent).toHaveBeenCalledWith('event-123');
      // Should still send notification
      expect(NotificationService.sendNotification).toHaveBeenCalled();
      // Error should be collected
      expect(result.errors).toContainEqual(
        expect.stringContaining('Failed to cancel scheduled messages')
      );
    });

    test('should collect errors from multiple failing cleanup services', async () => {
      mockMeetupClient.cancelEvent.mockResolvedValue({
        id: 'meetup-draft-123',
        name: 'Draft Tech Meetup',
        description: 'A draft event for testing',
        time: baseDraftEvent.dateTime.getTime(),
        status: 'cancelled'
      });

      (SocialMediaService.cancelPostsForEvent as jest.Mock).mockRejectedValueOnce(
        new Error('Social media cleanup failed')
      );
      (MessagingService.cancelMessagesForEvent as jest.Mock).mockRejectedValueOnce(
        new Error('Messaging cleanup failed')
      );

      const result = await eventService.rejectEvent(baseDraftEvent, 'group-123');

      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Failed to cancel scheduled posts')
      );
      expect(result.errors).toContainEqual(
        expect.stringContaining('Failed to cancel scheduled messages')
      );
      // Event should still be cancelled despite cleanup errors
      expect(result.event.platformStatus).toBe('cancelled');
    });
  });

  // --- Notification Delivery ---

  describe('Notification delivery', () => {
    test('should call NotificationService.sendNotification with correct params', async () => {
      mockMeetupClient.cancelEvent.mockResolvedValue({
        id: 'meetup-draft-123',
        name: 'Draft Tech Meetup',
        description: 'A draft event for testing',
        time: baseDraftEvent.dateTime.getTime(),
        status: 'cancelled'
      });

      await eventService.rejectEvent(baseDraftEvent, 'group-123');

      expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
      expect(NotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          type: 'info',
          relatedEntityId: 'event-123',
          relatedEntityType: 'event'
        })
      );
    });

    test('should include event title in notification message', async () => {
      mockMeetupClient.cancelEvent.mockResolvedValue({
        id: 'meetup-draft-123',
        name: 'Draft Tech Meetup',
        description: 'A draft event for testing',
        time: baseDraftEvent.dateTime.getTime(),
        status: 'cancelled'
      });

      await eventService.rejectEvent(baseDraftEvent, 'group-123');

      const notificationCall = (NotificationService.sendNotification as jest.Mock).mock.calls[0][0];
      expect(notificationCall.message).toContain('Draft Tech Meetup');
    });

    test('should include eventId in notification relatedEntityId', async () => {
      mockMeetupClient.cancelEvent.mockResolvedValue({
        id: 'meetup-draft-123',
        name: 'Draft Tech Meetup',
        description: 'A draft event for testing',
        time: baseDraftEvent.dateTime.getTime(),
        status: 'cancelled'
      });

      await eventService.rejectEvent(baseDraftEvent, 'group-123');

      const notificationCall = (NotificationService.sendNotification as jest.Mock).mock.calls[0][0];
      expect(notificationCall.relatedEntityId).toBe('event-123');
    });

    test('should not prevent rejection from completing when notification fails', async () => {
      mockMeetupClient.cancelEvent.mockResolvedValue({
        id: 'meetup-draft-123',
        name: 'Draft Tech Meetup',
        description: 'A draft event for testing',
        time: baseDraftEvent.dateTime.getTime(),
        status: 'cancelled'
      });

      (NotificationService.sendNotification as jest.Mock).mockRejectedValueOnce(
        new Error('Notification delivery failed')
      );

      const result = await eventService.rejectEvent(baseDraftEvent, 'group-123');

      // Rejection should still succeed
      expect(result.event.platformStatus).toBe('cancelled');
      // Error should be collected
      expect(result.errors).toContainEqual(
        expect.stringContaining('Failed to send rejection notification')
      );
    });
  });

  // --- API Endpoint (Handler) Tests ---

  describe('API endpoint handler tests', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getUserFromEvent } = require('../src/shared/auth');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EventModel } = require('../src/shared/models');

    let mockUserProfile: UserProfile;

    beforeEach(() => {
      mockUserProfile = {
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
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
    });

    function createApiEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
      return {
        httpMethod: 'POST',
        resource: '/events/{id}/reject',
        pathParameters: { id: 'event-123' },
        body: null,
        headers: { Authorization: 'Bearer valid-token' },
        multiValueHeaders: {},
        isBase64Encoded: false,
        path: '/events/event-123/reject',
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        ...overrides
      };
    }

    test('POST /events/{id}/reject should return 200 on success', async () => {
      getUserFromEvent.mockResolvedValue(mockUserProfile);
      EventModel.get.mockResolvedValue({
        ...baseDraftEvent,
        platformStatus: 'pending_confirmation'
      });
      EventModel.update.mockResolvedValue(undefined);

      const { handler } = require('../src/handlers/events');
      const event = createApiEvent();

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.event.platformStatus).toBe('cancelled');
    });

    test('POST /events/{id}/reject should return 404 when event not found', async () => {
      getUserFromEvent.mockResolvedValue(mockUserProfile);
      EventModel.get.mockResolvedValue(null);

      const { handler } = require('../src/handlers/events');
      const event = createApiEvent();

      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.data.error).toContain('not found');
    });

    test('POST /events/{id}/reject should return 400 when event is not in pending_confirmation status', async () => {
      getUserFromEvent.mockResolvedValue(mockUserProfile);
      EventModel.get.mockResolvedValue({
        ...baseDraftEvent,
        platformStatus: 'confirmed'
      });

      const { handler } = require('../src/handlers/events');
      const event = createApiEvent();

      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.data.error).toContain('not in pending confirmation');
    });

    test('POST /events/{id}/reject should return 401 for unauthenticated request', async () => {
      getUserFromEvent.mockResolvedValue(null);

      const { handler } = require('../src/handlers/events');
      const event = createApiEvent();

      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.data.error).toContain('Unauthorized');
    });
  });
});
