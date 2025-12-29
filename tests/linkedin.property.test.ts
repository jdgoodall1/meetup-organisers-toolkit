// Property-based tests for LinkedIn API integration

import * as fc from 'fast-check';
import { EventService, CreateEventRequest } from '../src/shared/event-service';
import { LinkedInClient, LinkedInEvent, LinkedInApiError, LinkedInOrganization } from '../src/shared/linkedin-client';
import { UserProfile, EncryptedCredentials } from '../src/shared/types';
import { generateId } from '../src/shared/utils';

// Mock axios for testing
jest.mock('axios');

describe('LinkedIn Integration Property Tests', () => {
  let eventService: EventService;
  let mockLinkedInClient: jest.Mocked<LinkedInClient>;

  beforeEach(() => {
    // Create mock credentials
    const mockCredentials: EncryptedCredentials = {
      accessToken: 'mock-linkedin-access-token',
      encryptedData: 'mock-encrypted-data'
    };

    // Create mock LinkedIn client
    mockLinkedInClient = {
      getProfile: jest.fn(),
      getOrganizations: jest.fn(),
      createEvent: jest.fn(),
      createPost: jest.fn(),
      schedulePost: jest.fn(),
      updateEvent: jest.fn(),
      cancelEvent: jest.fn(),
      getEvent: jest.fn()
    } as any;

    // Clear all mocks
    jest.clearAllMocks();

    eventService = new EventService(undefined, mockLinkedInClient);
  });

  /**
   * **Feature: logimeet, Property 7: Permission-based feature access**
   * For any user with LinkedIn permissions, the system should enable LinkedIn event creation options, while users without permissions should not see these options
   * **Validates: Requirements 3.1**
   */
  test('Property 7: Permission-based feature access', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        hasEventPermissions: fc.boolean(),
        hasPostPermissions: fc.boolean(),
        organizationCount: fc.integer({ min: 0, max: 5 })
      }),
      async (permissionConfig) => {
        // Generate mock organizations based on permission configuration
        const organizations: LinkedInOrganization[] = [];
        
        for (let i = 0; i < permissionConfig.organizationCount; i++) {
          const permissions: string[] = [];
          if (permissionConfig.hasEventPermissions) permissions.push('CREATE_EVENTS');
          if (permissionConfig.hasPostPermissions) permissions.push('CREATE_POSTS');
          
          organizations.push({
            id: `org-${i}`,
            name: `Organization ${i}`,
            type: i % 2 === 0 ? 'company' : 'group',
            permissions,
            canCreateEvents: permissionConfig.hasEventPermissions,
            canCreatePosts: permissionConfig.hasPostPermissions
          });
        }

        // Mock the getOrganizations method
        mockLinkedInClient.getOrganizations.mockResolvedValue(organizations);

        try {
          // Check LinkedIn permissions
          const result = await eventService.checkLinkedInPermissions();

          // Verify permission detection logic
          const expectedHasPermissions = permissionConfig.organizationCount > 0 && 
            (permissionConfig.hasEventPermissions || permissionConfig.hasPostPermissions);
          
          expect(result.hasPermissions).toBe(expectedHasPermissions);

          // Verify that only organizations with permissions are returned
          const expectedOrganizationCount = permissionConfig.organizationCount > 0 && 
            (permissionConfig.hasEventPermissions || permissionConfig.hasPostPermissions) 
            ? permissionConfig.organizationCount 
            : 0;
          
          expect(result.organizations).toHaveLength(expectedOrganizationCount);

          // Verify that all returned organizations have at least one permission
          result.organizations.forEach(org => {
            expect(org.canCreateEvents || org.canCreatePosts).toBe(true);
          });

          // If user has event permissions, they should be able to create events
          if (permissionConfig.hasEventPermissions && permissionConfig.organizationCount > 0) {
            expect(result.organizations.some(org => org.canCreateEvents)).toBe(true);
          }

          // If user has post permissions, they should be able to create posts
          if (permissionConfig.hasPostPermissions && permissionConfig.organizationCount > 0) {
            expect(result.organizations.some(org => org.canCreatePosts)).toBe(true);
          }

          // If user has no permissions or no organizations, they should not see LinkedIn options
          if (!permissionConfig.hasEventPermissions && !permissionConfig.hasPostPermissions) {
            expect(result.hasPermissions).toBe(false);
            expect(result.organizations).toHaveLength(0);
          }

          if (permissionConfig.organizationCount === 0) {
            expect(result.hasPermissions).toBe(false);
            expect(result.organizations).toHaveLength(0);
          }

        } catch (error) {
          // Permission checking should not throw for valid configurations
          expect(error).toBeUndefined();
        }
      }
    ), { numRuns: 100 });
  });

  /**
   * **Feature: logimeet, Property 4: Event creation success handling** (LinkedIn portion)
   * For any successful event creation (Meetup.com or LinkedIn), the system should store the event reference and display confirmation
   * **Validates: Requirements 3.4**
   */
  test('Property 4: Event creation success handling (LinkedIn portion)', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        description: fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        dateTime: fc.date({ min: new Date(Date.now() + 86400000) }), // Future date
        location: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        publishToMeetup: fc.boolean(),
        publishToLinkedIn: fc.constant(true), // Force LinkedIn creation to test success handling
        requiresConfirmation: fc.boolean()
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
        // Reset mocks for each iteration
        mockLinkedInClient.createEvent.mockReset();

        // Mock successful LinkedIn event creation
        const mockLinkedInEvent: LinkedInEvent = {
          id: generateId(),
          name: createRequest.title,
          description: createRequest.description,
          startDateTime: createRequest.dateTime.toISOString(),
          status: 'published',
          location: {
            name: createRequest.location
          },
          eventType: 'in_person',
          visibility: 'public'
        };

        // Only mock LinkedIn creation if not requiring confirmation
        const shouldCreateLinkedInEvent = !(createRequest.requiresConfirmation || userProfile.manualConfirmationEnabled);
        
        if (shouldCreateLinkedInEvent) {
          mockLinkedInClient.createEvent.mockResolvedValue(mockLinkedInEvent);
        }

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
        expect(result.event.publishToLinkedIn).toBe(createRequest.publishToLinkedIn);

        // If LinkedIn creation was requested and should be created immediately
        if (createRequest.publishToLinkedIn && shouldCreateLinkedInEvent) {
          expect(result.linkedinEvent).toBeDefined();
          expect(result.event.linkedinEventId).toBe(mockLinkedInEvent.id);
          expect(result.event.linkedinEventStatus).toBe(mockLinkedInEvent.status);
          expect(mockLinkedInClient.createEvent).toHaveBeenCalledWith(
            expect.objectContaining({
              name: createRequest.title,
              description: createRequest.description,
              startDateTime: createRequest.dateTime.toISOString(),
              location: { name: createRequest.location },
              eventType: 'in_person',
              visibility: 'public'
            })
          );
        }

        // If LinkedIn creation was requested but requires confirmation
        if (createRequest.publishToLinkedIn && !shouldCreateLinkedInEvent) {
          expect(result.linkedinEvent).toBeUndefined();
          expect(result.event.linkedinEventId).toBeUndefined();
          expect(result.event.linkedinEventStatus).toBe('draft');
          expect(mockLinkedInClient.createEvent).not.toHaveBeenCalled();
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
   * **Feature: logimeet, Property 5: Event creation error handling** (LinkedIn portion)
   * For any failed event creation attempt, the system should display error messages, maintain input data, and continue with other tasks where applicable
   * **Validates: Requirements 3.3**
   */
  test('Property 5: Event creation error handling (LinkedIn portion)', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        description: fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        dateTime: fc.date({ min: new Date(Date.now() + 86400000) }), // Future date
        location: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        publishToMeetup: fc.boolean(),
        publishToLinkedIn: fc.constant(true), // Force LinkedIn creation to test error handling
        requiresConfirmation: fc.constant(false) // Force immediate creation to test error handling
      }),
      fc.record({
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        email: fc.emailAddress(),
        name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        manualConfirmationEnabled: fc.constant(false), // Force immediate creation to test error handling
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
        // Mock LinkedIn API error
        const linkedinError = new LinkedInApiError(errorMessage, 'API_ERROR', 400);
        mockLinkedInClient.createEvent.mockRejectedValue(linkedinError);

        // Create the event (should handle LinkedIn error gracefully)
        const result = await eventService.createEvent(
          userProfile.userId,
          userProfile,
          createRequest
        );

        // Verify that local event is still created despite LinkedIn error
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

        // Verify that LinkedIn event creation failed but system continued
        expect(result.linkedinEvent).toBeUndefined();
        expect(result.event.linkedinEventId).toBeUndefined();

        // Verify that error is captured and reported
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('LinkedIn error');
        expect(result.errors[0]).toContain(errorMessage);

        // Verify that the system continues with other tasks (local event creation)
        expect(result.event.eventId).toBeDefined();
        expect(result.event.createdAt).toBeDefined();
        expect(result.event.updatedAt).toBeDefined();

        // Verify that LinkedIn creation was attempted
        expect(mockLinkedInClient.createEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            name: createRequest.title,
            description: createRequest.description,
            startDateTime: createRequest.dateTime.toISOString(),
            location: { name: createRequest.location },
            eventType: 'in_person',
            visibility: 'public'
          })
        );
      }
    ), { numRuns: 100 });
  });
});