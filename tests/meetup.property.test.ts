// Property-based tests for Meetup.com API integration

import * as fc from 'fast-check';
import { EventService, CreateEventRequest } from '../src/shared/event-service';
import { MeetupClient, MeetupEvent, MeetupApiError } from '../src/shared/meetup-client';
import { UserProfile, EncryptedCredentials } from '../src/shared/types';
import { generateId } from '../src/shared/utils';

// Mock axios for testing
jest.mock('axios');

describe('Meetup.com Integration Property Tests', () => {
  let eventService: EventService;
  let mockMeetupClient: jest.Mocked<MeetupClient>;

  beforeEach(() => {
    // Create mock credentials
    const mockCredentials: EncryptedCredentials = {
      accessToken: 'mock-access-token',
      encryptedData: 'mock-encrypted-data'
    };

    // Create mock Meetup client
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

    eventService = new EventService(mockMeetupClient);
  });

  /**
   * **Feature: logimeet, Property 4: Event creation success handling**
   * For any successful event creation (Meetup.com or LinkedIn), the system should store the event reference and display confirmation
   * **Validates: Requirements 2.2**
   */
  test('Property 4: Event creation success handling', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        description: fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        dateTime: fc.date({ min: new Date(Date.now() + 86400000) }), // Future date
        location: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        publishToMeetup: fc.boolean(),
        publishToLinkedIn: fc.boolean(),
        requiresConfirmation: fc.boolean(),
        groupId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0)
      }),
      fc.record({
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        email: fc.emailAddress(),
        name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        manualConfirmationEnabled: fc.boolean(),
        notificationPreferences: fc.constant({
          email: true,
          inApp: true,
          successNotifications: true,
          errorNotifications: true,
          reminderNotifications: true
        }),
        lastSyncTime: fc.date(),
        createdAt: fc.date(),
        updatedAt: fc.date()
      }),
      async (createRequest: CreateEventRequest, userProfile: UserProfile) => {
        // Mock successful Meetup.com event creation
        const mockMeetupEvent: MeetupEvent = {
          id: generateId(),
          name: createRequest.title,
          description: createRequest.description,
          time: createRequest.dateTime.getTime(),
          status: createRequest.requiresConfirmation || userProfile.manualConfirmationEnabled ? 'draft' : 'published',
          venue: {
            name: createRequest.location
          }
        };

        mockMeetupClient.createEvent.mockResolvedValue(mockMeetupEvent);

        // Create the event
        const result = await eventService.createEvent(
          userProfile.userId,
          userProfile,
          createRequest
        );

        // Verify successful event creation
        expect(result.event).toBeDefined();
        expect(result.event.userId).toBe(userProfile.userId);
        
        // Account for sanitization in title, description, location
        expect(result.event.title).toBe(createRequest.title.trim().replace(/[<>]/g, ''));
        expect(result.event.description).toBe(createRequest.description.trim().replace(/[<>]/g, ''));
        expect(result.event.location).toBe(createRequest.location.trim().replace(/[<>]/g, ''));
        expect(result.event.dateTime).toEqual(createRequest.dateTime);
        expect(result.event.publishToMeetup).toBe(createRequest.publishToMeetup);
        expect(result.event.publishToLinkedIn).toBe(createRequest.publishToLinkedIn);

        // If Meetup.com creation was requested and successful
        if (createRequest.publishToMeetup && createRequest.groupId) {
          expect(result.meetupEvent).toBeDefined();
          expect(result.event.meetupEventId).toBe(mockMeetupEvent.id);
          expect(result.event.meetupEventStatus).toBe(mockMeetupEvent.status);
          expect(mockMeetupClient.createEvent).toHaveBeenCalledWith(
            createRequest.groupId,
            expect.objectContaining({
              name: createRequest.title,
              description: createRequest.description,
              time: createRequest.dateTime.getTime()
            }),
            createRequest.requiresConfirmation || userProfile.manualConfirmationEnabled
          );
        }

        // Verify confirmation status is set correctly
        const expectedStatus = (createRequest.requiresConfirmation || userProfile.manualConfirmationEnabled) 
          ? 'pending_confirmation' 
          : 'confirmed';
        expect(result.event.platformStatus).toBe(expectedStatus);

        // Verify no errors for successful creation
        expect(result.errors).toHaveLength(0);
      }
    ), { numRuns: 100 });
  });

  /**
   * **Feature: logimeet, Property 5: Event creation error handling**
   * For any failed event creation attempt, the system should display error messages, maintain input data, and continue with other tasks where applicable
   * **Validates: Requirements 2.3**
   */
  test('Property 5: Event creation error handling', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        description: fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        dateTime: fc.date({ min: new Date(Date.now() + 86400000) }), // Future date
        location: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        publishToMeetup: fc.constant(true), // Force Meetup creation to test error handling
        publishToLinkedIn: fc.boolean(),
        requiresConfirmation: fc.boolean(),
        groupId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0)
      }),
      fc.record({
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        email: fc.emailAddress(),
        name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        manualConfirmationEnabled: fc.boolean(),
        notificationPreferences: fc.constant({
          email: true,
          inApp: true,
          successNotifications: true,
          errorNotifications: true,
          reminderNotifications: true
        }),
        lastSyncTime: fc.date(),
        createdAt: fc.date(),
        updatedAt: fc.date()
      }),
      fc.string({ minLength: 1, maxLength: 200 }), // Error message
      async (createRequest: CreateEventRequest, userProfile: UserProfile, errorMessage: string) => {
        // Mock Meetup.com API error
        const meetupError = new MeetupApiError(errorMessage, 'API_ERROR', 400);
        mockMeetupClient.createEvent.mockRejectedValue(meetupError);

        // Create the event (should handle Meetup error gracefully)
        const result = await eventService.createEvent(
          userProfile.userId,
          userProfile,
          createRequest
        );

        // Verify that local event is still created despite Meetup error
        expect(result.event).toBeDefined();
        expect(result.event.userId).toBe(userProfile.userId);
        
        // Account for sanitization in title, description, location
        expect(result.event.title).toBe(createRequest.title.trim().replace(/[<>]/g, ''));
        expect(result.event.description).toBe(createRequest.description.trim().replace(/[<>]/g, ''));
        expect(result.event.location).toBe(createRequest.location.trim().replace(/[<>]/g, ''));
        expect(result.event.dateTime).toEqual(createRequest.dateTime);

        // Verify that input data is maintained in the local event
        expect(result.event.publishToMeetup).toBe(createRequest.publishToMeetup);
        expect(result.event.publishToLinkedIn).toBe(createRequest.publishToLinkedIn);

        // Verify that Meetup event creation failed but system continued
        expect(result.meetupEvent).toBeUndefined();
        expect(result.event.meetupEventId).toBeUndefined();

        // Verify that error is captured and reported
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Meetup.com error');
        expect(result.errors[0]).toContain(errorMessage);

        // Verify that the system continues with other tasks (local event creation)
        expect(result.event.eventId).toBeDefined();
        expect(result.event.createdAt).toBeDefined();
        expect(result.event.updatedAt).toBeDefined();
      }
    ), { numRuns: 100 });
  });

  /**
   * **Feature: logimeet, Property 6: Event modification propagation**
   * For any valid event modification, the system should update the corresponding external platform events and all related scheduled content
   * **Validates: Requirements 2.4**
   */
  test('Property 6: Event modification propagation', async () => {
    await fc.assert(fc.asyncProperty(
      // Original event data
      fc.record({
        eventId: fc.string({ minLength: 1, maxLength: 50 }),
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        description: fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().length > 0),
        dateTime: fc.date({ min: new Date(Date.now() + 86400000) }),
        location: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
        meetupEventId: fc.string({ minLength: 1, maxLength: 50 }),
        meetupEventStatus: fc.constantFrom('draft', 'published'),
        platformStatus: fc.constantFrom('pending_confirmation', 'confirmed'),
        source: fc.constant('platform'),
        publishToMeetup: fc.constant(true),
        publishToLinkedIn: fc.boolean(),
        requiresConfirmation: fc.boolean(),
        socialPostsScheduled: fc.boolean(),
        messagesScheduled: fc.boolean(),
        lastSyncTime: fc.date(),
        externallyModified: fc.constant(false),
        createdAt: fc.date(),
        updatedAt: fc.date()
      }),
      // Updates to apply
      fc.record({
        title: fc.option(fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0)),
        description: fc.option(fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0)),
        dateTime: fc.option(fc.date({ min: new Date(Date.now() + 86400000) })),
        location: fc.option(fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0)),
        publishToMeetup: fc.option(fc.boolean()),
        publishToLinkedIn: fc.option(fc.boolean())
      }),
      fc.string({ minLength: 1, maxLength: 50 }), // Group ID
      async (originalEvent: any, updates: any, groupId: string) => {
        // Mock successful Meetup.com event update
        const updatedMeetupEvent = {
          id: originalEvent.meetupEventId,
          name: updates.title || originalEvent.title,
          description: updates.description || originalEvent.description,
          time: updates.dateTime ? updates.dateTime.getTime() : originalEvent.dateTime.getTime(),
          venue: {
            name: updates.location || originalEvent.location
          },
          status: originalEvent.meetupEventStatus
        };

        mockMeetupClient.updateEvent.mockResolvedValue(updatedMeetupEvent);

        try {
          // Update the event
          const result = await eventService.updateEvent(
            originalEvent,
            updates,
            groupId
          );

          // Verify that local event is updated
          expect(result.event).toBeDefined();
          expect(result.event.eventId).toBe(originalEvent.eventId);
          expect(result.event.userId).toBe(originalEvent.userId);

          // Verify that updates are applied to local event
          if (updates.title) {
            expect(result.event.title).toBe(updates.title);
          }
          if (updates.description) {
            expect(result.event.description).toBe(updates.description);
          }
          if (updates.dateTime) {
            expect(result.event.dateTime).toEqual(updates.dateTime);
          }
          if (updates.location) {
            expect(result.event.location).toBe(updates.location);
          }
          if (updates.publishToMeetup !== undefined) {
            expect(result.event.publishToMeetup).toBe(updates.publishToMeetup);
          }
          if (updates.publishToLinkedIn !== undefined) {
            expect(result.event.publishToLinkedIn).toBe(updates.publishToLinkedIn);
          }

          // Verify that updatedAt timestamp is updated
          expect(result.event.updatedAt).toBeInstanceOf(Date);
          expect(result.event.updatedAt.getTime()).toBeGreaterThanOrEqual(originalEvent.updatedAt.getTime());

          // Verify that Meetup.com event is updated if there are relevant changes
          const hasRelevantUpdates = updates.title || updates.description || updates.dateTime || updates.location;
          if (hasRelevantUpdates) {
            expect(mockMeetupClient.updateEvent).toHaveBeenCalledWith(
              groupId,
              originalEvent.meetupEventId,
              expect.objectContaining({
                ...(updates.title && { name: updates.title }),
                ...(updates.description && { description: updates.description }),
                ...(updates.dateTime && { time: updates.dateTime.getTime() }),
                ...(updates.location && { venue: { name: updates.location } })
              })
            );
            expect(result.meetupEvent).toBeDefined();
          }

          // Verify no errors for successful update
          expect(result.errors).toHaveLength(0);

        } catch (error) {
          // Should not throw for valid updates
          expect(error).toBeUndefined();
        }
      }
    ), { numRuns: 100 });
  });

  /**
   * **Feature: logimeet, Property 20: Draft event creation on Meetup.com**
   * For any organizer with manual confirmation enabled, the system should create events as drafts directly on Meetup.com in unpublished state, allowing co-organizer collaboration
   * **Validates: Requirements 10.1, 10.2**
   */
  test('Property 20: Draft event creation on Meetup.com', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        description: fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        dateTime: fc.date({ min: new Date(Date.now() + 86400000) }), // Future date
        location: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        publishToMeetup: fc.constant(true), // Force Meetup creation
        publishToLinkedIn: fc.boolean(),
        requiresConfirmation: fc.boolean(),
        groupId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0)
      }),
      fc.record({
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        email: fc.emailAddress(),
        name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        manualConfirmationEnabled: fc.constant(true), // Force manual confirmation mode
        notificationPreferences: fc.constant({
          email: true,
          inApp: true,
          successNotifications: true,
          errorNotifications: true,
          reminderNotifications: true
        }),
        lastSyncTime: fc.date(),
        createdAt: fc.date(),
        updatedAt: fc.date()
      }),
      async (createRequest: CreateEventRequest, userProfile: UserProfile) => {
        // Mock successful draft event creation on Meetup.com
        const mockDraftEvent: MeetupEvent = {
          id: generateId(),
          name: createRequest.title,
          description: createRequest.description,
          time: createRequest.dateTime.getTime(),
          status: 'draft', // Always draft when manual confirmation is enabled
          venue: {
            name: createRequest.location
          }
        };

        mockMeetupClient.createEvent.mockResolvedValue(mockDraftEvent);

        // Create the event
        const result = await eventService.createEvent(
          userProfile.userId,
          userProfile,
          createRequest
        );

        // Verify that local event is created with correct status
        expect(result.event).toBeDefined();
        expect(result.event.userId).toBe(userProfile.userId);
        
        // Account for sanitization in title, description, location
        expect(result.event.title).toBe(createRequest.title.trim().replace(/[<>]/g, ''));
        expect(result.event.description).toBe(createRequest.description.trim().replace(/[<>]/g, ''));
        expect(result.event.location).toBe(createRequest.location.trim().replace(/[<>]/g, ''));
        expect(result.event.dateTime).toEqual(createRequest.dateTime);

        // Verify that event is created in draft mode due to manual confirmation
        expect(result.event.requiresConfirmation).toBe(true);
        expect(result.event.platformStatus).toBe('pending_confirmation');

        // Verify that Meetup.com event is created as draft
        expect(result.meetupEvent).toBeDefined();
        expect(result.event.meetupEventId).toBe(mockDraftEvent.id);
        expect(result.event.meetupEventStatus).toBe('draft');

        // Verify that createEvent was called with isDraft=true
        expect(mockMeetupClient.createEvent).toHaveBeenCalledWith(
          createRequest.groupId,
          expect.objectContaining({
            name: createRequest.title,
            description: createRequest.description,
            time: createRequest.dateTime.getTime()
          }),
          true // isDraft should be true for manual confirmation mode
        );

        // Verify no errors for successful draft creation
        expect(result.errors).toHaveLength(0);
      }
    ), { numRuns: 100 });
  });

  /**
   * **Feature: logimeet, Property 21: Draft event confirmation workflow**
   * For any draft event confirmation, the system should publish the existing draft event on Meetup.com, create LinkedIn events if selected, and activate all scheduled posts and messages
   * **Validates: Requirements 10.3**
   */
  test('Property 21: Draft event confirmation workflow', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        eventId: fc.string({ minLength: 1, maxLength: 50 }),
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        description: fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().length > 0),
        dateTime: fc.date({ min: new Date(Date.now() + 86400000) }),
        location: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
        meetupEventId: fc.string({ minLength: 1, maxLength: 50 }),
        meetupEventStatus: fc.constant('draft'), // Must be draft for confirmation
        platformStatus: fc.constant('pending_confirmation'), // Must be pending confirmation
        source: fc.constant('platform'),
        publishToMeetup: fc.constant(true),
        publishToLinkedIn: fc.boolean(),
        requiresConfirmation: fc.constant(true),
        socialPostsScheduled: fc.boolean(),
        messagesScheduled: fc.boolean(),
        lastSyncTime: fc.date(),
        externallyModified: fc.constant(false),
        createdAt: fc.date(),
        updatedAt: fc.date()
      }),
      fc.string({ minLength: 1, maxLength: 50 }), // Group ID
      async (draftEvent: any, groupId: string) => {
        // Mock successful draft event publication
        const publishedMeetupEvent: MeetupEvent = {
          id: draftEvent.meetupEventId,
          name: draftEvent.title,
          description: draftEvent.description,
          time: draftEvent.dateTime.getTime(),
          status: 'published', // Status changes from draft to published
          venue: {
            name: draftEvent.location
          }
        };

        mockMeetupClient.publishDraftEvent.mockResolvedValue(publishedMeetupEvent);

        try {
          // Confirm the draft event
          const result = await eventService.confirmEvent(draftEvent, groupId);

          // Verify that local event status is updated to confirmed
          expect(result.event).toBeDefined();
          expect(result.event.eventId).toBe(draftEvent.eventId);
          expect(result.event.userId).toBe(draftEvent.userId);
          expect(result.event.platformStatus).toBe('confirmed');

          // Verify that updatedAt timestamp is updated
          expect(result.event.updatedAt).toBeInstanceOf(Date);
          expect(result.event.updatedAt.getTime()).toBeGreaterThanOrEqual(draftEvent.updatedAt.getTime());

          // Verify that Meetup.com draft event is published
          expect(mockMeetupClient.publishDraftEvent).toHaveBeenCalledWith(
            groupId,
            draftEvent.meetupEventId
          );
          expect(result.meetupEvent).toBeDefined();
          expect(result.event.meetupEventStatus).toBe('published');

          // Verify no errors for successful confirmation
          expect(result.errors).toHaveLength(0);

          // Verify that the existing draft event is published (not a new event created)
          expect(result.meetupEvent?.id).toBe(draftEvent.meetupEventId);
          expect(result.meetupEvent?.status).toBe('published');

        } catch (error) {
          // Should not throw for valid draft confirmation
          expect(error).toBeUndefined();
        }
      }
    ), { numRuns: 100 });
  });
});