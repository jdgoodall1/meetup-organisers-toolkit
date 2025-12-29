// Unit tests for LinkedIn API integration

import { LinkedInClient, LinkedInApiError } from '../src/shared/linkedin-client';
import { EventService } from '../src/shared/event-service';
import { EncryptedCredentials, UserProfile } from '../src/shared/types';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LinkedIn Integration Unit Tests', () => {
  let linkedinClient: LinkedInClient;
  let eventService: EventService;
  let mockCredentials: EncryptedCredentials;
  let mockUserProfile: UserProfile;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock credentials
    mockCredentials = {
      accessToken: 'test-linkedin-access-token',
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

    linkedinClient = new LinkedInClient(mockCredentials);
    eventService = new EventService(undefined, linkedinClient);
  });

  describe('LinkedInClient', () => {
    test('should initialize with correct headers', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.linkedin.com/v2',
        timeout: 30000,
        headers: {
          'Authorization': 'Bearer test-linkedin-access-token',
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });
    });

    test('should get user profile', async () => {
      const mockResponse = {
        data: {
          id: 'user-123',
          firstName: {
            localized: {
              en_US: 'John'
            }
          },
          lastName: {
            localized: {
              en_US: 'Doe'
            }
          },
          emailAddress: 'john.doe@example.com',
          profilePicture: {
            displayImage: {
              elements: [{
                identifiers: [{
                  identifier: 'https://example.com/profile.jpg'
                }]
              }]
            }
          }
        }
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue(mockResponse);

      const result = await linkedinClient.getProfile();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/people/~:(id,firstName,lastName,emailAddress,profilePicture(displayImage~:playableStreams))'
      );
      expect(result).toEqual({
        id: 'user-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        profilePicture: 'https://example.com/profile.jpg'
      });
    });

    test('should get organizations with permissions', async () => {
      const mockOrganizationsResponse = {
        data: {
          elements: [
            {
              organization: {
                id: 'org-123',
                name: {
                  localized: {
                    en_US: 'Test Company'
                  }
                },
                organizationType: 'COMPANY'
              }
            }
          ]
        }
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.get as jest.Mock)
        .mockResolvedValueOnce(mockOrganizationsResponse) // getOrganizations call
        .mockResolvedValueOnce({ status: 200 }) // checkEventPermissions call
        .mockResolvedValueOnce({ status: 200 }); // checkPostPermissions call

      const result = await linkedinClient.getOrganizations();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'org-123',
        name: 'Test Company',
        type: 'company',
        permissions: ['CREATE_EVENTS', 'CREATE_POSTS'],
        canCreateEvents: true,
        canCreatePosts: true
      });
    });

    test('should create LinkedIn event', async () => {
      const mockResponse = {
        data: {
          id: 'event-123',
          name: 'Test Event',
          description: 'Test Description',
          startDateTime: '2025-01-01T10:00:00Z',
          status: 'published'
        }
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.post as jest.Mock).mockResolvedValue(mockResponse);

      const eventData = {
        name: 'Test Event',
        description: 'Test Description',
        startDateTime: '2025-01-01T10:00:00Z',
        location: { name: 'Test Location' },
        eventType: 'in_person' as const,
        visibility: 'public' as const
      };

      const result = await linkedinClient.createEvent(eventData);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/events',
        {
          name: 'Test Event',
          description: 'Test Description',
          startDateTime: '2025-01-01T10:00:00Z',
          location: { name: 'Test Location' },
          eventType: 'in_person',
          registrationRequired: false,
          visibility: 'public'
        }
      );
      expect(result).toEqual(mockResponse.data);
    });

    test('should create LinkedIn post', async () => {
      const mockProfileResponse = {
        data: {
          id: 'user-123'
        }
      };

      const mockPostResponse = {
        data: {
          id: 'post-123'
        }
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue(mockProfileResponse);
      (mockAxiosInstance.post as jest.Mock).mockResolvedValue(mockPostResponse);

      const postData = {
        content: 'Test post content',
        visibility: 'public' as const
      };

      const result = await linkedinClient.createPost(postData);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/ugcPosts',
        expect.objectContaining({
          content: {
            contentEntities: [],
            title: 'Test post content',
            description: 'Test post content'
          },
          author: 'urn:li:person:user-123',
          distribution: {
            feedDistribution: 'MAIN_FEED',
            targetEntities: [],
            thirdPartyDistributionChannels: []
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
          }
        })
      );
      expect(result).toEqual({
        id: 'post-123',
        content: 'Test post content',
        visibility: 'public',
        status: 'published'
      });
    });

    test('should schedule LinkedIn post', async () => {
      const mockProfileResponse = {
        data: {
          id: 'user-123'
        }
      };

      const mockPostResponse = {
        data: {
          id: 'post-123'
        }
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue(mockProfileResponse);
      (mockAxiosInstance.post as jest.Mock).mockResolvedValue(mockPostResponse);

      const scheduledTime = '2025-01-01T10:00:00Z';
      const postData = {
        content: 'Scheduled post content',
        visibility: 'public' as const,
        scheduledTime
      };

      const result = await linkedinClient.schedulePost(postData);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/ugcPosts',
        expect.objectContaining({
          content: {
            contentEntities: [],
            title: 'Scheduled post content',
            description: 'Scheduled post content'
          },
          author: 'urn:li:person:user-123',
          publishedAt: new Date(scheduledTime).getTime()
        })
      );
      expect(result).toEqual({
        id: 'post-123',
        content: 'Scheduled post content',
        visibility: 'public',
        scheduledTime,
        status: 'scheduled'
      });
    });

    test('should update LinkedIn event', async () => {
      const mockResponse = {
        data: {
          id: 'event-123',
          name: 'Updated Event'
        }
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.patch as jest.Mock).mockResolvedValue(mockResponse);

      const updates = { name: 'Updated Event' };
      const result = await linkedinClient.updateEvent('event-123', updates);

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/events/event-123',
        updates
      );
      expect(result).toEqual(mockResponse.data);
    });

    test('should cancel LinkedIn event', async () => {
      const mockResponse = {
        data: {
          id: 'event-123',
          status: 'cancelled'
        }
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.patch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await linkedinClient.cancelEvent('event-123');

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/events/event-123',
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
        linkedinClient.createEvent({ name: 'Test' } as any)
      ).rejects.toThrow(LinkedInApiError);
    });

    test('should handle network errors', async () => {
      const mockAxiosInstance = mockedAxios.create();
      const networkError = {
        request: {},
        message: 'Network Error'
      };
      (mockAxiosInstance.post as jest.Mock).mockRejectedValue(networkError);

      await expect(
        linkedinClient.createEvent({ name: 'Test' } as any)
      ).rejects.toThrow(LinkedInApiError);
    });
  });

  describe('EventService LinkedIn Integration', () => {
    test('should check LinkedIn permissions', async () => {
      const mockOrganizations = [
        {
          id: 'org-1',
          name: 'Company 1',
          type: 'company' as const,
          permissions: ['CREATE_EVENTS', 'CREATE_POSTS'],
          canCreateEvents: true,
          canCreatePosts: true
        },
        {
          id: 'org-2',
          name: 'Group 1',
          type: 'group' as const,
          permissions: ['CREATE_POSTS'],
          canCreateEvents: false,
          canCreatePosts: true
        }
      ];

      jest.spyOn(linkedinClient, 'getOrganizations').mockResolvedValue(mockOrganizations);

      const result = await eventService.checkLinkedInPermissions();

      expect(result.hasPermissions).toBe(true);
      expect(result.organizations).toHaveLength(2);
      expect(result.organizations[0].canCreateEvents).toBe(true);
      expect(result.organizations[1].canCreateEvents).toBe(false);
    });

    test('should return no permissions when no organizations', async () => {
      jest.spyOn(linkedinClient, 'getOrganizations').mockResolvedValue([]);

      const result = await eventService.checkLinkedInPermissions();

      expect(result.hasPermissions).toBe(false);
      expect(result.organizations).toHaveLength(0);
    });

    test('should create social media post', async () => {
      const mockPost = {
        id: 'post-123',
        content: 'Test post content',
        visibility: 'public' as const,
        status: 'published' as const
      };

      jest.spyOn(linkedinClient, 'createPost').mockResolvedValue(mockPost);

      const result = await eventService.createSocialPost('Test post content');

      expect(result.postId).toBe('post-123');
      expect(result.status).toBe('published');
      expect(linkedinClient.createPost).toHaveBeenCalledWith({
        content: 'Test post content',
        visibility: 'public'
      });
    });

    test('should schedule social media post', async () => {
      const mockPost = {
        id: 'post-123',
        content: 'Scheduled post content',
        visibility: 'public' as const,
        scheduledTime: '2025-01-01T10:00:00.000Z',
        status: 'scheduled' as const
      };

      jest.spyOn(linkedinClient, 'schedulePost').mockResolvedValue(mockPost);

      const scheduledTime = new Date('2025-01-01T10:00:00.000Z');
      const result = await eventService.createSocialPost(
        'Scheduled post content',
        undefined,
        scheduledTime
      );

      expect(result.postId).toBe('post-123');
      expect(result.status).toBe('scheduled');
      expect(linkedinClient.schedulePost).toHaveBeenCalledWith({
        content: 'Scheduled post content',
        visibility: 'public',
        organizationId: undefined,
        scheduledTime: '2025-01-01T10:00:00.000Z'
      });
    });

    test('should create event with LinkedIn integration', async () => {
      const futureDate = new Date(Date.now() + 86400000); // Tomorrow
      const mockLinkedInEvent = {
        id: 'linkedin-event-123',
        name: 'Test Event',
        description: 'Test Description',
        startDateTime: futureDate.toISOString(),
        status: 'published' as const,
        location: { name: 'Test Location' },
        eventType: 'in_person' as const,
        visibility: 'public' as const
      };

      jest.spyOn(linkedinClient, 'createEvent').mockResolvedValue(mockLinkedInEvent);

      const createRequest = {
        title: 'Test Event',
        description: 'Test Description',
        dateTime: futureDate,
        location: 'Test Location',
        publishToMeetup: false,
        publishToLinkedIn: true
      };

      const result = await eventService.createEvent(
        'user-123',
        mockUserProfile,
        createRequest
      );

      expect(result.event).toBeDefined();
      expect(result.event.title).toBe('Test Event');
      expect(result.event.linkedinEventId).toBe('linkedin-event-123');
      expect(result.linkedinEvent).toEqual(mockLinkedInEvent);
      expect(result.errors).toHaveLength(0);
    });

    test('should handle LinkedIn API errors gracefully during event creation', async () => {
      const futureDate = new Date(Date.now() + 86400000); // Tomorrow
      const apiError = new LinkedInApiError('API Error', 'API_ERROR', 400);
      jest.spyOn(linkedinClient, 'createEvent').mockRejectedValue(apiError);

      const createRequest = {
        title: 'Test Event',
        description: 'Test Description',
        dateTime: futureDate,
        location: 'Test Location',
        publishToMeetup: false,
        publishToLinkedIn: true
      };

      const result = await eventService.createEvent(
        'user-123',
        mockUserProfile,
        createRequest
      );

      // Should still create local event
      expect(result.event).toBeDefined();
      expect(result.event.title).toBe('Test Event');
      expect(result.event.linkedinEventId).toBeUndefined();
      expect(result.linkedinEvent).toBeUndefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('LinkedIn error');
    });

    test('should not create LinkedIn event when manual confirmation is enabled', async () => {
      const futureDate = new Date(Date.now() + 86400000); // Tomorrow
      const userProfileWithConfirmation = {
        ...mockUserProfile,
        manualConfirmationEnabled: true
      };

      const createRequest = {
        title: 'Test Event',
        description: 'Test Description',
        dateTime: futureDate,
        location: 'Test Location',
        publishToMeetup: false,
        publishToLinkedIn: true
      };

      const result = await eventService.createEvent(
        'user-123',
        userProfileWithConfirmation,
        createRequest
      );

      expect(result.event.platformStatus).toBe('pending_confirmation');
      expect(result.event.linkedinEventStatus).toBe('draft');
      expect(result.linkedinEvent).toBeUndefined();
      expect(result.errors).toHaveLength(0);
    });

    test('should create LinkedIn event during confirmation', async () => {
      const futureDate = new Date(Date.now() + 86400000); // Tomorrow
      const mockLinkedInEvent = {
        id: 'linkedin-event-123',
        name: 'Test Event',
        description: 'Test Description',
        startDateTime: futureDate.toISOString(),
        status: 'published' as const,
        location: { name: 'Test Location' },
        eventType: 'in_person' as const,
        visibility: 'public' as const
      };

      jest.spyOn(linkedinClient, 'createEvent').mockResolvedValue(mockLinkedInEvent);

      const draftEvent = {
        eventId: 'local-event-123',
        userId: 'user-123',
        title: 'Test Event',
        description: 'Test Description',
        dateTime: futureDate,
        location: 'Test Location',
        meetupEventStatus: 'draft' as const,
        platformStatus: 'pending_confirmation' as const,
        source: 'platform' as const,
        publishToMeetup: false,
        publishToLinkedIn: true,
        requiresConfirmation: true,
        socialPostsScheduled: false,
        messagesScheduled: false,
        lastSyncTime: new Date(),
        externallyModified: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await eventService.confirmEvent(draftEvent);

      expect(linkedinClient.createEvent).toHaveBeenCalledWith({
        name: 'Test Event',
        description: 'Test Description',
        startDateTime: futureDate.toISOString(),
        location: { name: 'Test Location' },
        eventType: 'in_person',
        visibility: 'public'
      });
      expect(result.event.platformStatus).toBe('confirmed');
      expect(result.event.linkedinEventId).toBe('linkedin-event-123');
      expect(result.event.linkedinEventStatus).toBe('published');
      expect(result.errors).toHaveLength(0);
    });
  });
});