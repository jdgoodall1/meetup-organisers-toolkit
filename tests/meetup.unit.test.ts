// Unit tests for Meetup.com API integration

import { MeetupClient, MeetupApiError } from '../src/shared/meetup-client';
import { EventService } from '../src/shared/event-service';
import { EncryptedCredentials, UserProfile } from '../src/shared/types';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Meetup.com Integration Unit Tests', () => {
  let meetupClient: MeetupClient;
  let eventService: EventService;
  let mockCredentials: EncryptedCredentials;
  let mockUserProfile: UserProfile;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock credentials
    mockCredentials = {
      accessToken: 'test-access-token',
      encryptedData: 'encrypted-data'
    };

    // Create mock user profile
    mockUserProfile = {
      userId: 'test-user-id',
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

    // Mock axios.create to return a mock instance
    const mockAxiosInstance = {
      post: jest.fn(),
      patch: jest.fn(),
      get: jest.fn(),
      interceptors: {
        response: {
          use: jest.fn()
        }
      }
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    meetupClient = new MeetupClient(mockCredentials);
    eventService = new EventService(meetupClient);
  });

  describe('MeetupClient', () => {
    test('should initialize with correct headers', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.meetup.com',
        timeout: 30000,
        headers: {
          'Authorization': 'Bearer test-access-token',
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
    });

    test('should create event with correct payload', async () => {
      const mockResponse = {
        data: {
          id: 'event-123',
          name: 'Test Event',
          description: 'Test Description',
          time: Date.now(),
          status: 'published'
        }
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.post as jest.Mock).mockResolvedValue(mockResponse);

      const eventData = {
        name: 'Test Event',
        description: 'Test Description',
        time: Date.now(),
        venue: { name: 'Test Location' }
      };

      const result = await meetupClient.createEvent('group-123', eventData, false);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/group-123/events',
        {
          ...eventData,
          group_id: 'group-123',
          status: 'published'
        }
      );
      expect(result).toEqual(mockResponse.data);
    });

    test('should create draft event when isDraft is true', async () => {
      const mockResponse = {
        data: {
          id: 'event-123',
          name: 'Test Event',
          status: 'draft'
        }
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.post as jest.Mock).mockResolvedValue(mockResponse);

      const eventData = {
        name: 'Test Event',
        description: 'Test Description',
        time: Date.now(),
        venue: { name: 'Test Location' }
      };

      await meetupClient.createEvent('group-123', eventData, true);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/group-123/events',
        expect.objectContaining({
          status: 'draft'
        })
      );
    });

    test('should publish draft event', async () => {
      const mockResponse = {
        data: {
          id: 'event-123',
          status: 'published'
        }
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.patch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await meetupClient.publishDraftEvent('group-123', 'event-123');

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/group-123/events/event-123',
        { status: 'published' }
      );
      expect(result).toEqual(mockResponse.data);
    });

    test('should update event with partial data', async () => {
      const mockResponse = {
        data: {
          id: 'event-123',
          name: 'Updated Event'
        }
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.patch as jest.Mock).mockResolvedValue(mockResponse);

      const updates = { name: 'Updated Event' };
      const result = await meetupClient.updateEvent('group-123', 'event-123', updates);

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/group-123/events/event-123',
        updates
      );
      expect(result).toEqual(mockResponse.data);
    });

    test('should cancel event', async () => {
      const mockResponse = {
        data: {
          id: 'event-123',
          status: 'cancelled'
        }
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.patch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await meetupClient.cancelEvent('group-123', 'event-123');

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/group-123/events/event-123',
        { status: 'cancelled' }
      );
      expect(result).toEqual(mockResponse.data);
    });

    test('should handle API errors correctly', async () => {
      const mockAxiosInstance = mockedAxios.create();
      const apiError = {
        response: {
          status: 400,
          data: {
            code: 'INVALID_REQUEST',
            message: 'Invalid event data'
          }
        }
      };
      (mockAxiosInstance.post as jest.Mock).mockRejectedValue(apiError);

      await expect(
        meetupClient.createEvent('group-123', { name: 'Test' } as any, false)
      ).rejects.toThrow(MeetupApiError);
    });

    test('should handle network errors', async () => {
      const mockAxiosInstance = mockedAxios.create();
      const networkError = {
        request: {},
        message: 'Network Error'
      };
      (mockAxiosInstance.post as jest.Mock).mockRejectedValue(networkError);

      await expect(
        meetupClient.createEvent('group-123', { name: 'Test' } as any, false)
      ).rejects.toThrow(MeetupApiError);
    });

    test('should get group members', async () => {
      const mockResponse = {
        data: {
          members: [
            { id: 'member-1', name: 'Member 1', status: 'active' },
            { id: 'member-2', name: 'Member 2', status: 'active' }
          ]
        }
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue(mockResponse);

      const result = await meetupClient.getGroupMembers('group-123');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/group-123/members');
      expect(result).toEqual(mockResponse.data.members);
    });

    test('should get event attendees', async () => {
      const mockResponse = {
        data: {
          attendees: [
            {
              member: { id: 'member-1', name: 'Member 1' },
              rsvp: { response: 'yes', guests: 0, created: Date.now(), updated: Date.now() }
            }
          ]
        }
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue(mockResponse);

      const result = await meetupClient.getEventAttendees('group-123', 'event-123');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/group-123/events/event-123/rsvps');
      expect(result).toEqual(mockResponse.data.attendees);
    });

    test('should send message to attendees', async () => {
      const mockResponse = {
        data: {
          id: 'message-123',
          recipient_count: 5
        }
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await meetupClient.sendMessage(
        'group-123',
        'Hello attendees!',
        'attendees',
        'event-123'
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/group-123/events/event-123/messages',
        {
          message: 'Hello attendees!',
          recipients: 'attendees'
        }
      );
      expect(result).toEqual({
        messageId: 'message-123',
        recipientCount: 5
      });
    });

    test('should send message to non-RSVP members', async () => {
      const mockResponse = {
        data: {
          id: 'message-456',
          recipient_count: 10
        }
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await meetupClient.sendMessage(
        'group-123',
        'Hello members!',
        'non_rsvp_members',
        'event-123'
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/group-123/messages',
        {
          message: 'Hello members!',
          recipients: 'members',
          exclude_rsvp_event_id: 'event-123'
        }
      );
      expect(result).toEqual({
        messageId: 'message-456',
        recipientCount: 10
      });
    });
  });

  describe('EventService', () => {
    test('should create event with Meetup integration', async () => {
      const mockMeetupEvent = {
        id: 'meetup-event-123',
        name: 'Test Event',
        description: 'Test Description',
        time: Date.now(),
        status: 'published' as const
      };

      // Mock the createEvent method
      jest.spyOn(meetupClient, 'createEvent').mockResolvedValue(mockMeetupEvent);

      const createRequest = {
        title: 'Test Event',
        description: 'Test Description',
        dateTime: new Date(Date.now() + 86400000), // Tomorrow
        location: 'Test Location',
        publishToMeetup: true,
        publishToLinkedIn: false,
        groupId: 'group-123'
      };

      const result = await eventService.createEvent(
        'user-123',
        mockUserProfile,
        createRequest
      );

      expect(result.event).toBeDefined();
      expect(result.event.title).toBe('Test Event');
      expect(result.event.meetupEventId).toBe('meetup-event-123');
      expect(result.meetupEvent).toEqual(mockMeetupEvent);
      expect(result.errors).toHaveLength(0);
    });

    test('should handle Meetup API errors gracefully', async () => {
      const apiError = new MeetupApiError('API Error', 'API_ERROR', 400);
      jest.spyOn(meetupClient, 'createEvent').mockRejectedValue(apiError);

      const createRequest = {
        title: 'Test Event',
        description: 'Test Description',
        dateTime: new Date(Date.now() + 86400000),
        location: 'Test Location',
        publishToMeetup: true,
        publishToLinkedIn: false,
        groupId: 'group-123'
      };

      const result = await eventService.createEvent(
        'user-123',
        mockUserProfile,
        createRequest
      );

      // Should still create local event
      expect(result.event).toBeDefined();
      expect(result.event.title).toBe('Test Event');
      expect(result.event.meetupEventId).toBeUndefined();
      expect(result.meetupEvent).toBeUndefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Meetup.com error');
    });

    test('should create draft event when manual confirmation is enabled', async () => {
      const mockDraftEvent = {
        id: 'draft-event-123',
        name: 'Test Event',
        description: 'Test Description',
        time: Date.now(),
        status: 'draft' as const
      };

      jest.spyOn(meetupClient, 'createEvent').mockResolvedValue(mockDraftEvent);

      const userProfileWithConfirmation = {
        ...mockUserProfile,
        manualConfirmationEnabled: true
      };

      const createRequest = {
        title: 'Test Event',
        description: 'Test Description',
        dateTime: new Date(Date.now() + 86400000),
        location: 'Test Location',
        publishToMeetup: true,
        publishToLinkedIn: false,
        groupId: 'group-123'
      };

      const result = await eventService.createEvent(
        'user-123',
        userProfileWithConfirmation,
        createRequest
      );

      expect(meetupClient.createEvent).toHaveBeenCalledWith(
        'group-123',
        expect.any(Object),
        true // isDraft should be true
      );
      expect(result.event.platformStatus).toBe('pending_confirmation');
      expect(result.event.meetupEventStatus).toBe('draft');
    });

    test('should confirm draft event', async () => {
      const mockPublishedEvent = {
        id: 'event-123',
        name: 'Test Event',
        description: 'Test Description',
        time: Date.now(),
        status: 'published' as const
      };

      jest.spyOn(meetupClient, 'publishDraftEvent').mockResolvedValue(mockPublishedEvent);

      const draftEvent = {
        eventId: 'local-event-123',
        userId: 'user-123',
        title: 'Test Event',
        description: 'Test Description',
        dateTime: new Date(),
        location: 'Test Location',
        meetupEventId: 'event-123',
        meetupEventStatus: 'draft' as const,
        platformStatus: 'pending_confirmation' as const,
        source: 'platform' as const,
        publishToMeetup: true,
        publishToLinkedIn: false,
        requiresConfirmation: true,
        socialPostsScheduled: false,
        messagesScheduled: false,
        lastSyncTime: new Date(),
        externallyModified: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await eventService.confirmEvent(draftEvent, 'group-123');

      expect(meetupClient.publishDraftEvent).toHaveBeenCalledWith('group-123', 'event-123');
      expect(result.event.platformStatus).toBe('confirmed');
      expect(result.event.meetupEventStatus).toBe('published');
      expect(result.errors).toHaveLength(0);
    });

    test('should get non-RSVP members', async () => {
      const mockMembers = [
        { id: 'member-1', name: 'Member 1', status: 'active' as const, joined: Date.now(), visited: Date.now() },
        { id: 'member-2', name: 'Member 2', status: 'active' as const, joined: Date.now(), visited: Date.now() },
        { id: 'member-3', name: 'Member 3', status: 'inactive' as const, joined: Date.now(), visited: Date.now() }
      ];

      const mockAttendees = [
        {
          member: { id: 'member-1', name: 'Member 1' },
          rsvp: { response: 'yes' as const, guests: 0, created: Date.now(), updated: Date.now() }
        }
      ];

      jest.spyOn(meetupClient, 'getGroupMembers').mockResolvedValue(mockMembers);
      jest.spyOn(meetupClient, 'getEventAttendees').mockResolvedValue(mockAttendees);

      const result = await eventService.getNonRsvpMembers('group-123', 'event-123');

      // Should return only active members who haven't RSVP'd
      expect(result).toEqual(['member-2']);
    });

    test('should get event attendees', async () => {
      const mockAttendees = [
        {
          member: { id: 'member-1', name: 'Member 1' },
          rsvp: { response: 'yes' as const, guests: 0, created: Date.now(), updated: Date.now() }
        },
        {
          member: { id: 'member-2', name: 'Member 2' },
          rsvp: { response: 'no' as const, guests: 0, created: Date.now(), updated: Date.now() }
        }
      ];

      jest.spyOn(meetupClient, 'getEventAttendees').mockResolvedValue(mockAttendees);

      const result = await eventService.getEventAttendees('group-123', 'event-123');

      // Should return only members who RSVP'd yes
      expect(result).toEqual(['member-1']);
    });
  });
});