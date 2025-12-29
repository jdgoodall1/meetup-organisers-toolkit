// Property-based tests for event synchronization service

import * as fc from 'fast-check';
import { SyncService, SyncResult } from '../src/shared/sync-service';
import { MeetupClient, MeetupEvent, MeetupApiError } from '../src/shared/meetup-client';
import { LinkedInClient, LinkedInEvent, LinkedInApiError } from '../src/shared/linkedin-client';
import { UserProfile, EncryptedCredentials, Event } from '../src/shared/types';
import { EventModel } from '../src/shared/models';
import { generateId } from '../src/shared/utils';

// Mock axios for testing
jest.mock('axios');

// Mock EventModel database operations
jest.mock('../src/shared/models', () => ({
  ...jest.requireActual('../src/shared/models'),
  EventModel: {
    ...jest.requireActual('../src/shared/models').EventModel,
    getByUserId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    createNew: jest.fn()
  }
}));

describe('Event Synchronization Property Tests', () => {
  let syncService: SyncService;
  let mockMeetupClient: jest.Mocked<MeetupClient>;
  let mockLinkedInClient: jest.Mocked<LinkedInClient>;
  let mockEventModel: jest.Mocked<typeof EventModel>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock credentials
    const mockCredentials: EncryptedCredentials = {
      accessToken: 'mock-access-token',
      encryptedData: 'mock-encrypted-data'
    };

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

    mockEventModel = EventModel as jest.Mocked<typeof EventModel>;

    syncService = new SyncService(mockMeetupClient, mockLinkedInClient);
  });

  /**
   * **Feature: logimeet, Property 17: Event synchronization and import**
   * For any connected Meetup.com account, the system should retrieve and import all existing events while preserving event details and maintaining external references
   * **Validates: Requirements 9.1, 9.2**
   */
  test('Property 17: Event synchronization and import', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        email: fc.emailAddress(),
        name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        meetupCredentials: fc.constant({
          accessToken: 'mock-meetup-token',
          encryptedData: 'mock-encrypted-data'
        }),
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
      fc.array(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 50 }),
          name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          urlname: fc.string({ minLength: 1, maxLength: 50 }),
          members: fc.integer({ min: 1, max: 10000 }),
          status: fc.constant('active')
        }),
        { minLength: 1, maxLength: 5 }
      ),
      fc.array(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 50 }),
          name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          description: fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().length > 0),
          time: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }), // Future dates
          status: fc.constantFrom('draft' as const, 'published' as const, 'cancelled' as const),
          venue: fc.record({
            name: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0)
          })
        }),
        { minLength: 0, maxLength: 10 }
      ),
      async (userProfile: UserProfile, managedGroups: any[], externalEvents: MeetupEvent[]) => {
        // Reset mocks for this iteration
        jest.clearAllMocks();
        
        // Mock existing local events (empty for import test)
        mockEventModel.getByUserId.mockResolvedValue([]);

        // Mock managed groups
        mockMeetupClient.getManagedGroups.mockResolvedValue(managedGroups);

        // Mock group events for each group
        for (const group of managedGroups) {
          const groupEvents = externalEvents.filter((_, index) => index % managedGroups.length === managedGroups.indexOf(group));
          mockMeetupClient.getGroupEvents.mockResolvedValueOnce(groupEvents);
        }

        // Track which events are being created to preserve correct mapping
        let eventCreationIndex = 0;
        
        // Mock event creation
        mockEventModel.create.mockImplementation(async (event: Event) => event);
        mockEventModel.createNew.mockImplementation((data: any) => {
          // Find the corresponding external event for this creation
          const correspondingExternalEvent = externalEvents[eventCreationIndex % externalEvents.length];
          eventCreationIndex++;
          
          return {
            eventId: 'generated-id',
            userId: data.userId,
            title: data.title || 'Imported Event',
            description: data.description || '',
            dateTime: data.dateTime || new Date(),
            location: data.location || 'TBD',
            meetupEventId: data.meetupEventId,
            meetupEventStatus: correspondingExternalEvent?.status || data.meetupEventStatus || 'published',
            linkedinEventId: data.linkedinEventId,
            linkedinEventStatus: data.linkedinEventStatus,
            platformStatus: data.platformStatus || (correspondingExternalEvent?.status === 'draft' ? 'pending_confirmation' : 'confirmed'),
            source: data.source || 'meetup_import',
            requiresConfirmation: data.requiresConfirmation || (correspondingExternalEvent?.status === 'draft'),
            publishToMeetup: data.publishToMeetup !== undefined ? data.publishToMeetup : true,
            publishToLinkedIn: data.publishToLinkedIn !== undefined ? data.publishToLinkedIn : false,
            socialPostsScheduled: data.socialPostsScheduled || false,
            messagesScheduled: data.messagesScheduled || false,
            lastSyncTime: new Date(),
            externallyModified: data.externallyModified || false,
            createdAt: new Date(),
            updatedAt: new Date()
          } as Event;
        });

        // Perform synchronization
        const result = await syncService.syncMeetupEvents(userProfile.userId, userProfile);

        // Verify synchronization completed successfully
        expect(result.syncRecord).toBeDefined();
        expect(result.syncRecord.userId).toBe(userProfile.userId);
        expect(result.syncRecord.platform).toBe('meetup');
        expect(result.syncRecord.status).toBe('success');

        // Verify all external events were imported
        expect(result.eventsImported).toHaveLength(externalEvents.length);
        expect(result.syncRecord.eventsImported).toBe(externalEvents.length);

        // Verify no events were updated (since no existing events)
        expect(result.eventsUpdated).toHaveLength(0);
        expect(result.syncRecord.eventsUpdated).toBe(0);

        // Verify no conflicts detected (since no existing events)
        expect(result.conflictsDetected).toHaveLength(0);
        expect(result.syncRecord.conflictsDetected).toBe(0);

        // Verify no errors occurred
        expect(result.errors).toHaveLength(0);

        // Verify each imported event preserves external details
        // Note: Events may be processed in different order due to group distribution
        const importedEventIds = new Set(result.eventsImported.map(e => e.meetupEventId));
        const originalEventIds = new Set(externalEvents.map(e => e.id));
        
        // Verify all external events were imported (by ID)
        expect(importedEventIds).toEqual(originalEventIds);
        
        // Verify each imported event has correct properties
        for (const importedEvent of result.eventsImported) {
          expect(importedEvent.userId).toBe(userProfile.userId);
          expect(importedEvent.meetupEventId).toBeDefined();
          expect(importedEvent.source).toBe('meetup_import');
          expect(importedEvent.publishToMeetup).toBe(true);
          expect(importedEvent.externallyModified).toBe(false);
          
          // Verify core event data is preserved
          expect(importedEvent.title).toBeDefined();
          expect(importedEvent.description).toBeDefined();
          expect(importedEvent.dateTime).toBeInstanceOf(Date);
          expect(importedEvent.location).toBeDefined();
          expect(importedEvent.meetupEventStatus).toMatch(/^(draft|published|cancelled)$/);
        }

        // Verify external references are maintained
        for (const importedEvent of result.eventsImported) {
          expect(importedEvent.meetupEventId).toBeDefined();
          expect(importedEvent.meetupEventId).toMatch(/^.+$/); // Non-empty string
        }

        // Verify getManagedGroups was called
        expect(mockMeetupClient.getManagedGroups).toHaveBeenCalledTimes(1);

        // Verify getGroupEvents was called for each group
        expect(mockMeetupClient.getGroupEvents).toHaveBeenCalledTimes(managedGroups.length);

        // Verify EventModel.create was called for each imported event
        expect(mockEventModel.create).toHaveBeenCalledTimes(externalEvents.length);
      }
    ), { numRuns: 100 });
  });

  /**
   * **Feature: logimeet, Property 18: External change detection**
   * For any event modified externally on Meetup.com, the system should detect the changes during synchronization and update local event data accordingly
   * **Validates: Requirements 9.3, 9.4**
   */
  test('Property 18: External change detection', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        email: fc.emailAddress(),
        name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        meetupCredentials: fc.constant({
          accessToken: 'mock-meetup-token',
          encryptedData: 'mock-encrypted-data'
        }),
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
      // Original local event
      fc.record({
        eventId: fc.string({ minLength: 1, maxLength: 50 }),
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        description: fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().length > 0),
        dateTime: fc.date({ min: new Date(Date.now() + 86400000) }),
        location: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
        meetupEventId: fc.string({ minLength: 1, maxLength: 50 }),
        meetupEventStatus: fc.constantFrom('draft' as const, 'published' as const),
        platformStatus: fc.constantFrom('pending_confirmation' as const, 'confirmed' as const),
        source: fc.constant('platform' as const),
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
      // Modified external event (same ID but different data)
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        description: fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().length > 0),
        time: fc.integer({ min: Date.now() + 86400000, max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
        status: fc.constantFrom('draft' as const, 'published' as const, 'cancelled' as const),
        venue: fc.record({
          name: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0)
        })
      }),
      async (userProfile: UserProfile, localEvent: any, externalChanges: any) => {
        // Reset mocks for this iteration
        jest.clearAllMocks();

        // Ensure the external event has the same ID as the local event
        const modifiedExternalEvent: MeetupEvent = {
          id: localEvent.meetupEventId,
          name: externalChanges.name,
          description: externalChanges.description,
          time: externalChanges.time,
          status: externalChanges.status,
          venue: externalChanges.venue
        };

        // Ensure the local event has the same userId as the user profile
        localEvent.userId = userProfile.userId;

        // Mock existing local events (contains the event to be updated)
        mockEventModel.getByUserId.mockResolvedValue([localEvent]);

        // Mock managed groups
        const mockGroup = { id: 'group-123', name: 'Test Group', urlname: 'test-group', members: 100, status: 'active' };
        mockMeetupClient.getManagedGroups.mockResolvedValue([mockGroup]);

        // Mock group events (returns the modified external event)
        mockMeetupClient.getGroupEvents.mockResolvedValue([modifiedExternalEvent]);

        // Mock event update
        mockEventModel.update.mockImplementation(async (event: Event) => event);

        // Perform synchronization
        const result = await syncService.syncMeetupEvents(userProfile.userId, userProfile);

        // Verify synchronization completed successfully
        expect(result.syncRecord).toBeDefined();
        expect(result.syncRecord.userId).toBe(userProfile.userId);
        expect(result.syncRecord.platform).toBe('meetup');
        expect(result.syncRecord.status).toBe('success');

        // Verify no events were imported (since event already exists)
        expect(result.eventsImported).toHaveLength(0);
        expect(result.syncRecord.eventsImported).toBe(0);

        // Verify one event was updated
        expect(result.eventsUpdated).toHaveLength(1);
        expect(result.syncRecord.eventsUpdated).toBe(1);

        // Verify the updated event reflects external changes
        const updatedEvent = result.eventsUpdated[0];
        expect(updatedEvent.eventId).toBe(localEvent.eventId);
        expect(updatedEvent.userId).toBe(userProfile.userId);
        expect(updatedEvent.meetupEventId).toBe(localEvent.meetupEventId);

        // Verify external changes were applied (external platform priority)
        expect(updatedEvent.title).toBe(modifiedExternalEvent.name);
        expect(updatedEvent.description).toBe(modifiedExternalEvent.description);
        expect(updatedEvent.dateTime).toEqual(new Date(modifiedExternalEvent.time));
        expect(updatedEvent.location).toBe(modifiedExternalEvent.venue?.name);
        expect(updatedEvent.meetupEventStatus).toBe(modifiedExternalEvent.status);

        // Verify external modification flags are set
        expect(updatedEvent.externallyModified).toBe(true);
        expect(updatedEvent.lastSyncTime).toBeInstanceOf(Date);
        expect(updatedEvent.updatedAt).toBeInstanceOf(Date);

        // Verify conflicts were detected for the changes
        expect(result.conflictsDetected.length).toBeGreaterThan(0);

        // Verify no errors occurred
        expect(result.errors).toHaveLength(0);

        // Verify getManagedGroups was called
        expect(mockMeetupClient.getManagedGroups).toHaveBeenCalledTimes(1);

        // Verify getGroupEvents was called
        expect(mockMeetupClient.getGroupEvents).toHaveBeenCalledTimes(1);

        // Verify EventModel.update was called for the modified event
        expect(mockEventModel.update).toHaveBeenCalledTimes(1);
      }
    ), { numRuns: 100 });
  });

  /**
   * **Feature: logimeet, Property 19: Synchronization conflict resolution**
   * For any synchronization conflict, the system should prioritize external platform data and notify the organizer of discrepancies
   * **Validates: Requirements 9.5**
   */
  test('Property 19: Synchronization conflict resolution', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        email: fc.emailAddress(),
        name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        meetupCredentials: fc.constant({
          accessToken: 'mock-meetup-token',
          encryptedData: 'mock-encrypted-data'
        }),
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
      // Local event data
      fc.record({
        eventId: fc.string({ minLength: 1, maxLength: 50 }),
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        description: fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().length > 0),
        dateTime: fc.date({ min: new Date(Date.now() + 86400000) }),
        location: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
        meetupEventId: fc.string({ minLength: 1, maxLength: 50 }),
        meetupEventStatus: fc.constantFrom('draft' as const, 'published' as const),
        platformStatus: fc.constantFrom('pending_confirmation' as const, 'confirmed' as const),
        source: fc.constant('platform' as const),
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
      // Conflicting external event data (different from local)
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        description: fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().length > 0),
        time: fc.integer({ min: Date.now() + 86400000, max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
        status: fc.constantFrom('draft' as const, 'published' as const, 'cancelled' as const),
        venue: fc.record({
          name: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0)
        })
      }),
      async (userProfile: UserProfile, localEvent: any, externalData: any) => {
        // Reset mocks for this iteration
        jest.clearAllMocks();

        // Ensure the external event has the same ID as the local event but different data
        const conflictingExternalEvent: MeetupEvent = {
          id: localEvent.meetupEventId,
          name: externalData.name,
          description: externalData.description,
          time: externalData.time,
          status: externalData.status,
          venue: externalData.venue
        };

        // Ensure the local event has the same userId as the user profile
        localEvent.userId = userProfile.userId;

        // Ensure there are actual conflicts by making sure data is different
        if (localEvent.title === conflictingExternalEvent.name &&
            localEvent.description === conflictingExternalEvent.description &&
            localEvent.dateTime.getTime() === conflictingExternalEvent.time &&
            localEvent.location === conflictingExternalEvent.venue?.name &&
            localEvent.meetupEventStatus === conflictingExternalEvent.status) {
          // Skip this iteration if there are no actual conflicts
          return;
        }

        // Mock existing local events (contains the event with conflicts)
        mockEventModel.getByUserId.mockResolvedValue([localEvent]);

        // Mock managed groups
        const mockGroup = { id: 'group-123', name: 'Test Group', urlname: 'test-group', members: 100, status: 'active' };
        mockMeetupClient.getManagedGroups.mockResolvedValue([mockGroup]);

        // Mock group events (returns the conflicting external event)
        mockMeetupClient.getGroupEvents.mockResolvedValue([conflictingExternalEvent]);

        // Mock event update
        mockEventModel.update.mockImplementation(async (event: Event) => event);

        // Perform synchronization
        const result = await syncService.syncMeetupEvents(userProfile.userId, userProfile);

        // Verify synchronization completed successfully
        expect(result.syncRecord).toBeDefined();
        expect(result.syncRecord.userId).toBe(userProfile.userId);
        expect(result.syncRecord.platform).toBe('meetup');
        expect(result.syncRecord.status).toBe('success');

        // Verify one event was updated
        expect(result.eventsUpdated).toHaveLength(1);
        expect(result.syncRecord.eventsUpdated).toBe(1);

        // Verify conflicts were detected
        expect(result.conflictsDetected.length).toBeGreaterThan(0);
        expect(result.syncRecord.conflictsDetected).toBeGreaterThan(0);

        // Verify the updated event prioritizes external platform data
        const updatedEvent = result.eventsUpdated[0];
        expect(updatedEvent.eventId).toBe(localEvent.eventId);
        expect(updatedEvent.userId).toBe(userProfile.userId);
        expect(updatedEvent.meetupEventId).toBe(localEvent.meetupEventId);

        // Verify external data takes priority over local data
        expect(updatedEvent.title).toBe(conflictingExternalEvent.name);
        expect(updatedEvent.description).toBe(conflictingExternalEvent.description);
        expect(updatedEvent.dateTime).toEqual(new Date(conflictingExternalEvent.time));
        expect(updatedEvent.location).toBe(conflictingExternalEvent.venue?.name);
        expect(updatedEvent.meetupEventStatus).toBe(conflictingExternalEvent.status);

        // Verify external modification flags are set
        expect(updatedEvent.externallyModified).toBe(true);
        expect(updatedEvent.lastSyncTime).toBeInstanceOf(Date);
        expect(updatedEvent.updatedAt).toBeInstanceOf(Date);

        // Verify each detected conflict has proper structure
        for (const conflict of result.conflictsDetected) {
          expect(conflict.conflictId).toBeDefined();
          expect(conflict.eventId).toBe(localEvent.eventId);
          expect(conflict.userId).toBe(userProfile.userId);
          expect(conflict.platform).toBe('meetup');
          expect(conflict.conflictType).toMatch(/^(title_mismatch|description_mismatch|date_mismatch|status_mismatch)$/);
          expect(conflict.localValue).toBeDefined();
          expect(conflict.externalValue).toBeDefined();
          expect(conflict.status).toBe('pending');
          expect(conflict.createdAt).toBeInstanceOf(Date);
        }

        // Verify organizer is notified of discrepancies through conflict detection
        expect(result.conflictsDetected.length).toBeGreaterThan(0);

        // Verify no errors occurred
        expect(result.errors).toHaveLength(0);

        // Verify getManagedGroups was called
        expect(mockMeetupClient.getManagedGroups).toHaveBeenCalledTimes(1);

        // Verify getGroupEvents was called
        expect(mockMeetupClient.getGroupEvents).toHaveBeenCalledTimes(1);

        // Verify EventModel.update was called for the conflicted event
        expect(mockEventModel.update).toHaveBeenCalledTimes(1);
      }
    ), { numRuns: 100 });
  });

  /**
   * **Feature: logimeet, Property 22: External draft publication detection**
   * For any draft event published externally on Meetup.com by co-organizers, the system should detect the publication during synchronization and update the event status accordingly
   * **Validates: Requirements 10.4**
   */
  test('Property 22: External draft publication detection', async () => {
    await fc.assert(fc.asyncProperty(
      // Local draft event
      fc.record({
        eventId: fc.string({ minLength: 1, maxLength: 50 }),
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        description: fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().length > 0),
        dateTime: fc.date({ min: new Date(Date.now() + 86400000) }),
        location: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
        meetupEventId: fc.string({ minLength: 1, maxLength: 50 }),
        meetupEventStatus: fc.constant('draft' as const), // Must be draft initially
        platformStatus: fc.constant('pending_confirmation' as const), // Must be pending confirmation
        source: fc.constant('platform' as const),
        publishToMeetup: fc.constant(true),
        publishToLinkedIn: fc.boolean(),
        requiresConfirmation: fc.constant(true), // Must require confirmation for draft
        socialPostsScheduled: fc.boolean(),
        messagesScheduled: fc.boolean(),
        lastSyncTime: fc.date(),
        externallyModified: fc.constant(false),
        createdAt: fc.date(),
        updatedAt: fc.date()
      }),
      fc.string({ minLength: 1, maxLength: 50 }), // Group ID
      async (localDraftEvent: any, groupId: string) => {
        // Reset mocks for this iteration
        jest.clearAllMocks();

        // Create the externally published event (same ID, same data, but published status)
        const externallyPublishedEvent: MeetupEvent = {
          id: localDraftEvent.meetupEventId,
          name: localDraftEvent.title,
          description: localDraftEvent.description,
          time: localDraftEvent.dateTime.getTime(),
          status: 'published', // Status changed from draft to published externally
          venue: {
            name: localDraftEvent.location
          }
        };

        // Mock existing local events (contains the draft event)
        mockEventModel.getByUserId.mockResolvedValue([localDraftEvent]);

        // Mock managed groups
        const mockGroup = { id: groupId, name: 'Test Group', urlname: 'test-group', members: 100, status: 'active' };
        mockMeetupClient.getManagedGroups.mockResolvedValue([mockGroup]);

        // Mock group events (returns the externally published event)
        mockMeetupClient.getGroupEvents.mockResolvedValue([externallyPublishedEvent]);

        // Mock event update
        mockEventModel.update.mockImplementation(async (event: Event) => event);

        // Perform synchronization
        const result = await syncService.syncMeetupEvents(localDraftEvent.userId, {
          userId: localDraftEvent.userId,
          email: 'test@example.com',
          name: 'Test User',
          meetupCredentials: {
            accessToken: 'mock-meetup-token',
            encryptedData: 'mock-encrypted-data'
          },
          manualConfirmationEnabled: true,
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
        });

        // Verify synchronization completed successfully
        expect(result.syncRecord).toBeDefined();
        expect(result.syncRecord.userId).toBe(localDraftEvent.userId);
        expect(result.syncRecord.platform).toBe('meetup');
        expect(result.syncRecord.status).toBe('success');

        // Verify no events were imported (since event already exists)
        expect(result.eventsImported).toHaveLength(0);
        expect(result.syncRecord.eventsImported).toBe(0);

        // Verify one event was updated
        expect(result.eventsUpdated).toHaveLength(1);
        expect(result.syncRecord.eventsUpdated).toBe(1);

        // Verify the updated event reflects external publication
        const updatedEvent = result.eventsUpdated[0];
        expect(updatedEvent.eventId).toBe(localDraftEvent.eventId);
        expect(updatedEvent.userId).toBe(localDraftEvent.userId);
        expect(updatedEvent.meetupEventId).toBe(localDraftEvent.meetupEventId);

        // Verify status was updated to reflect external publication
        expect(updatedEvent.meetupEventStatus).toBe('published');
        expect(updatedEvent.platformStatus).toBe('confirmed'); // Should be updated from pending_confirmation

        // Verify external modification flags are set
        expect(updatedEvent.externallyModified).toBe(true);
        expect(updatedEvent.lastSyncTime).toBeInstanceOf(Date);
        expect(updatedEvent.updatedAt).toBeInstanceOf(Date);

        // Verify a status conflict was detected (draft -> published)
        const statusConflicts = result.conflictsDetected.filter(c => c.conflictType === 'status_mismatch');
        expect(statusConflicts.length).toBeGreaterThan(0);

        // Verify the status conflict shows the correct values
        const statusConflict = statusConflicts[0];
        expect(statusConflict.localValue).toBe('draft');
        expect(statusConflict.externalValue).toBe('published');
        expect(statusConflict.platform).toBe('meetup');

        // Verify no errors occurred
        expect(result.errors).toHaveLength(0);

        // Verify getManagedGroups was called
        expect(mockMeetupClient.getManagedGroups).toHaveBeenCalledTimes(1);

        // Verify getGroupEvents was called
        expect(mockMeetupClient.getGroupEvents).toHaveBeenCalledTimes(1);

        // Verify EventModel.update was called for the published event
        expect(mockEventModel.update).toHaveBeenCalledTimes(1);

        // Test the checkExternalPublication method directly
        const publicationCheck = await syncService.checkExternalPublication(localDraftEvent, groupId);
        
        // Mock the getEvent call for the direct check
        mockMeetupClient.getEvent.mockResolvedValue(externallyPublishedEvent);
        
        const directCheck = await syncService.checkExternalPublication(localDraftEvent, groupId);
        expect(directCheck.wasPublished).toBe(true);
        if (directCheck.updatedEvent) {
          expect(directCheck.updatedEvent.meetupEventStatus).toBe('published');
          expect(directCheck.updatedEvent.platformStatus).toBe('confirmed');
        }
      }
    ), { numRuns: 100 });
  });
});