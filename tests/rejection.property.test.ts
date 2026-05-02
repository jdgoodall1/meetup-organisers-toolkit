// Property-based tests for draft event rejection cleanup

import * as fc from 'fast-check';
import { EventService } from '../src/shared/event-service';
import { MeetupClient, MeetupEvent } from '../src/shared/meetup-client';
import { LinkedInClient, LinkedInEvent } from '../src/shared/linkedin-client';
import { SocialMediaService } from '../src/shared/social-media-service';
import { MessagingService } from '../src/shared/messaging-service';
import { NotificationService } from '../src/shared/notification-service';
import { EncryptedCredentials, Event } from '../src/shared/types';

// Mock axios for testing
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

describe('Draft Event Rejection Property Tests', () => {
  let eventService: EventService;
  let mockMeetupClient: jest.Mocked<MeetupClient>;
  let mockLinkedInClient: jest.Mocked<LinkedInClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock clients
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
  });

  /**
   * **Feature: logimeet, Property 23: Draft event rejection cleanup**
   * For any rejected draft event, the system should cancel all associated scheduled posts and messages.
   * **Validates: Requirements 10.5**
   */
  test('Property 23: Draft event rejection cleanup', async () => {
    await fc.assert(fc.asyncProperty(
      // Generate a draft event with varying properties
      fc.record({
        eventId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        description: fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().length > 0),
        dateTime: fc.date({ min: new Date(Date.now() + 86400000) }),
        location: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
        meetupEventId: fc.option(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)).map(v => v ?? undefined),
        meetupEventStatus: fc.constant('draft' as const),
        linkedinEventId: fc.option(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)).map(v => v ?? undefined),
        linkedinEventStatus: fc.constant('draft' as const),
        platformStatus: fc.constant('pending_confirmation' as const),
        source: fc.constant('platform' as const),
        requiresConfirmation: fc.constant(true),
        publishToMeetup: fc.constant(true),
        publishToLinkedIn: fc.boolean(),
        socialPostsScheduled: fc.boolean(),
        messagesScheduled: fc.boolean(),
        lastSyncTime: fc.date(),
        externallyModified: fc.constant(false),
        createdAt: fc.date(),
        updatedAt: fc.date()
      }),
      fc.option(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)).map(v => v ?? undefined), // groupId
      async (draftEvent: Event, groupId: string | undefined) => {
        // Reset mocks for this iteration
        jest.clearAllMocks();

        // Mock MeetupClient.cancelEvent to return a cancelled event
        const cancelledMeetupEvent: MeetupEvent = {
          id: draftEvent.meetupEventId,
          name: draftEvent.title,
          description: draftEvent.description,
          time: draftEvent.dateTime.getTime(),
          status: 'cancelled',
          venue: { name: draftEvent.location }
        };
        mockMeetupClient.cancelEvent.mockResolvedValue(cancelledMeetupEvent);

        // Mock LinkedInClient.cancelEvent to return a cancelled event
        const cancelledLinkedInEvent: LinkedInEvent = {
          id: draftEvent.linkedinEventId,
          name: draftEvent.title,
          description: draftEvent.description,
          startDateTime: draftEvent.dateTime.toISOString(),
          status: 'cancelled'
        };
        mockLinkedInClient.cancelEvent.mockResolvedValue(cancelledLinkedInEvent);

        // Perform rejection
        const result = await eventService.rejectEvent(draftEvent, groupId);

        // 1. Verify the event's platformStatus is set to 'cancelled'
        expect(result.event.platformStatus).toBe('cancelled');

        // 2. Verify SocialMediaService.cancelPostsForEvent is called with the event's eventId
        expect(SocialMediaService.cancelPostsForEvent).toHaveBeenCalledWith(draftEvent.eventId);
        expect(SocialMediaService.cancelPostsForEvent).toHaveBeenCalledTimes(1);

        // 3. Verify MessagingService.cancelMessagesForEvent is called with the event's eventId
        expect(MessagingService.cancelMessagesForEvent).toHaveBeenCalledWith(draftEvent.eventId);
        expect(MessagingService.cancelMessagesForEvent).toHaveBeenCalledTimes(1);

        // 4. Verify NotificationService.sendNotification is called with a rejection notification
        expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
        expect(NotificationService.sendNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: draftEvent.userId,
            type: 'info',
            relatedEntityId: draftEvent.eventId,
            relatedEntityType: 'event'
          })
        );

        // 5. If the event has a meetupEventId, the MeetupClient's cancelEvent is called
        if (draftEvent.meetupEventId && groupId) {
          expect(mockMeetupClient.cancelEvent).toHaveBeenCalledWith(groupId, draftEvent.meetupEventId);
          expect(result.event.meetupEventStatus).toBe('cancelled');
        } else if (!draftEvent.meetupEventId) {
          expect(mockMeetupClient.cancelEvent).not.toHaveBeenCalled();
        }

        // 6. If the event has a linkedinEventId, the LinkedInClient's cancelEvent is called
        if (draftEvent.linkedinEventId) {
          expect(mockLinkedInClient.cancelEvent).toHaveBeenCalledWith(draftEvent.linkedinEventId);
          expect(result.event.linkedinEventStatus).toBe('cancelled');
        } else {
          expect(mockLinkedInClient.cancelEvent).not.toHaveBeenCalled();
        }

        // Verify updatedAt is set
        expect(result.event.updatedAt).toBeInstanceOf(Date);

        // Verify no errors for successful rejection
        expect(result.errors).toHaveLength(0);
      }
    ), { numRuns: 100 });
  });
});
