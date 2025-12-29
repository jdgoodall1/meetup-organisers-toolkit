// Unit tests for social media scheduling service

import { SocialMediaService, SchedulePostsRequest, ExecutePostRequest } from '../src/shared/social-media-service';
import { LinkedInClient, LinkedInApiError } from '../src/shared/linkedin-client';
import { Event, UserProfile, ScheduledPost } from '../src/shared/types';

// Mock AWS clients
jest.mock('../src/shared/aws-clients');

describe('Social Media Service Unit Tests', () => {
  let mockEvent: Event;
  let mockUserProfile: UserProfile;
  let mockLinkedInClient: jest.Mocked<LinkedInClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock event (35 days in the future to allow all 5 posts)
    const futureDate = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000);
    mockEvent = {
      eventId: 'test-event-id',
      userId: 'test-user-id',
      title: 'Test Event',
      description: 'Test event description',
      dateTime: futureDate,
      location: 'Test Location',
      meetupEventStatus: 'draft',
      platformStatus: 'confirmed',
      source: 'platform',
      requiresConfirmation: false,
      publishToMeetup: false,
      publishToLinkedIn: true,
      socialPostsScheduled: false,
      messagesScheduled: false,
      lastSyncTime: new Date(),
      externallyModified: false,
      createdAt: new Date(),
      updatedAt: new Date()
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

    // Create mock LinkedIn client
    mockLinkedInClient = {
      createPost: jest.fn(),
      schedulePost: jest.fn(),
      getProfile: jest.fn(),
      getOrganizations: jest.fn(),
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      cancelEvent: jest.fn(),
      getEvent: jest.fn()
    } as any;
  });

  describe('schedulePostsForEvent', () => {
    test('should schedule 5 posts with correct intervals', async () => {
      // Mock database save operation
      const mockSaveScheduledPost = jest.spyOn(SocialMediaService as any, 'saveScheduledPost')
        .mockResolvedValue(undefined);

      const request: SchedulePostsRequest = {
        event: mockEvent,
        userProfile: mockUserProfile
      };

      const result = await SocialMediaService.schedulePostsForEvent(request);

      expect(result.scheduledPosts).toHaveLength(5);
      expect(result.errors).toHaveLength(0);

      // Verify posts are scheduled at correct intervals
      const eventTime = mockEvent.dateTime.getTime();
      const expectedIntervals = [
        30 * 24 * 60 * 60 * 1000, // 1 month
        14 * 24 * 60 * 60 * 1000, // 2 weeks
        7 * 24 * 60 * 60 * 1000,  // 1 week
        3 * 24 * 60 * 60 * 1000,  // 3 days
        0                          // Day of event
      ];

      const sortedPosts = result.scheduledPosts.sort((a, b) => 
        a.scheduledTime.getTime() - b.scheduledTime.getTime()
      );

      for (let i = 0; i < 5; i++) {
        const expectedTime = new Date(eventTime - expectedIntervals[i]);
        expect(Math.abs(sortedPosts[i].scheduledTime.getTime() - expectedTime.getTime())).toBeLessThan(1000);
      }

      expect(mockSaveScheduledPost).toHaveBeenCalledTimes(5);
      mockSaveScheduledPost.mockRestore();
    });

    test('should use custom template when provided', async () => {
      const mockSaveScheduledPost = jest.spyOn(SocialMediaService as any, 'saveScheduledPost')
        .mockResolvedValue(undefined);

      const customTemplate = {
        oneMonth: 'Custom one month message for {title}',
        dayOf: 'Custom day of message for {title}'
      };

      const request: SchedulePostsRequest = {
        event: mockEvent,
        userProfile: mockUserProfile,
        customTemplate
      };

      const result = await SocialMediaService.schedulePostsForEvent(request);

      expect(result.scheduledPosts).toHaveLength(5);
      
      // Find the one month and day of posts
      const oneMonthPost = result.scheduledPosts.find(p => 
        p.content.includes('Custom one month message')
      );
      const dayOfPost = result.scheduledPosts.find(p => 
        p.content.includes('Custom day of message')
      );

      expect(oneMonthPost).toBeDefined();
      expect(dayOfPost).toBeDefined();
      expect(oneMonthPost!.content).toContain('Test Event');
      expect(dayOfPost!.content).toContain('Test Event');

      mockSaveScheduledPost.mockRestore();
    });

    test('should set pending_confirmation status when manual confirmation enabled', async () => {
      const mockSaveScheduledPost = jest.spyOn(SocialMediaService as any, 'saveScheduledPost')
        .mockResolvedValue(undefined);

      const userProfileWithConfirmation = {
        ...mockUserProfile,
        manualConfirmationEnabled: true
      };

      const request: SchedulePostsRequest = {
        event: mockEvent,
        userProfile: userProfileWithConfirmation
      };

      const result = await SocialMediaService.schedulePostsForEvent(request);

      expect(result.scheduledPosts).toHaveLength(5);
      result.scheduledPosts.forEach(post => {
        expect(post.status).toBe('pending_confirmation');
        expect(post.requiresConfirmation).toBe(true);
      });

      mockSaveScheduledPost.mockRestore();
    });

    test('should skip posts scheduled in the past', async () => {
      const mockSaveScheduledPost = jest.spyOn(SocialMediaService as any, 'saveScheduledPost')
        .mockResolvedValue(undefined);

      // Event only 2 days in the future (should skip 1 month, 2 weeks, 1 week posts)
      const nearFutureEvent = {
        ...mockEvent,
        dateTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      };

      const request: SchedulePostsRequest = {
        event: nearFutureEvent,
        userProfile: mockUserProfile
      };

      const result = await SocialMediaService.schedulePostsForEvent(request);

      // Should only schedule day of event post (3 days and day of are in future)
      expect(result.scheduledPosts.length).toBeLessThan(5);
      expect(result.errors).toHaveLength(0);

      mockSaveScheduledPost.mockRestore();
    });

    test('should handle database save errors gracefully', async () => {
      const mockSaveScheduledPost = jest.spyOn(SocialMediaService as any, 'saveScheduledPost')
        .mockRejectedValue(new Error('Database error'));

      const request: SchedulePostsRequest = {
        event: mockEvent,
        userProfile: mockUserProfile
      };

      const result = await SocialMediaService.schedulePostsForEvent(request);

      expect(result.scheduledPosts).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Database error');

      mockSaveScheduledPost.mockRestore();
    });
  });

  describe('executeScheduledPost', () => {
    let mockScheduledPost: ScheduledPost;

    beforeEach(() => {
      mockScheduledPost = {
        postId: 'test-post-id',
        eventId: 'test-event-id',
        userId: 'test-user-id',
        platform: 'linkedin',
        content: 'Test post content',
        scheduledTime: new Date(Date.now() - 60000), // 1 minute ago
        status: 'pending',
        requiresConfirmation: false,
        createdAt: new Date()
      };
    });

    test('should execute post successfully', async () => {
      const mockUpdatePostStatus = jest.spyOn(SocialMediaService as any, 'updatePostStatus')
        .mockResolvedValue(undefined);

      const mockLinkedInPost = {
        id: 'linkedin-post-123',
        content: 'Test post content',
        visibility: 'public' as const,
        status: 'published' as const
      };

      mockLinkedInClient.createPost.mockResolvedValue(mockLinkedInPost);

      const request: ExecutePostRequest = {
        post: mockScheduledPost,
        linkedinClient: mockLinkedInClient
      };

      const result = await SocialMediaService.executeScheduledPost(request);

      expect(result.success).toBe(true);
      expect(result.externalPostId).toBe('linkedin-post-123');
      expect(result.errorMessage).toBeUndefined();

      expect(mockLinkedInClient.createPost).toHaveBeenCalledWith({
        content: 'Test post content',
        visibility: 'public',
        organizationId: undefined
      });

      expect(mockUpdatePostStatus).toHaveBeenCalledWith(
        'test-post-id',
        'published',
        'linkedin-post-123'
      );

      mockUpdatePostStatus.mockRestore();
    });

    test('should handle LinkedIn API errors', async () => {
      const mockUpdatePostStatus = jest.spyOn(SocialMediaService as any, 'updatePostStatus')
        .mockResolvedValue(undefined);

      const apiError = new LinkedInApiError('API Error', 'API_ERROR', 400);
      mockLinkedInClient.createPost.mockRejectedValue(apiError);

      const request: ExecutePostRequest = {
        post: mockScheduledPost,
        linkedinClient: mockLinkedInClient
      };

      const result = await SocialMediaService.executeScheduledPost(request);

      expect(result.success).toBe(false);
      expect(result.externalPostId).toBeUndefined();
      expect(result.errorMessage).toBe('API Error');

      expect(mockUpdatePostStatus).toHaveBeenCalledWith(
        'test-post-id',
        'failed',
        undefined,
        'API Error'
      );

      mockUpdatePostStatus.mockRestore();
    });

    test('should use organization ID when provided', async () => {
      const mockUpdatePostStatus = jest.spyOn(SocialMediaService as any, 'updatePostStatus')
        .mockResolvedValue(undefined);

      const postWithOrgId = {
        ...mockScheduledPost,
        externalPostId: 'org-123' // Using externalPostId to store organization ID
      };

      const mockLinkedInPost = {
        id: 'linkedin-post-123',
        content: 'Test post content',
        visibility: 'public' as const,
        status: 'published' as const
      };

      mockLinkedInClient.createPost.mockResolvedValue(mockLinkedInPost);

      const request: ExecutePostRequest = {
        post: postWithOrgId,
        linkedinClient: mockLinkedInClient
      };

      await SocialMediaService.executeScheduledPost(request);

      expect(mockLinkedInClient.createPost).toHaveBeenCalledWith({
        content: 'Test post content',
        visibility: 'public',
        organizationId: 'org-123'
      });

      mockUpdatePostStatus.mockRestore();
    });
  });

  describe('cancelPostsForEvent', () => {
    test('should cancel pending and pending_confirmation posts', async () => {
      const mockPosts: ScheduledPost[] = [
        {
          postId: 'post-1',
          eventId: 'test-event-id',
          userId: 'test-user-id',
          platform: 'linkedin',
          content: 'Post 1',
          scheduledTime: new Date(),
          status: 'pending',
          requiresConfirmation: false,
          createdAt: new Date()
        },
        {
          postId: 'post-2',
          eventId: 'test-event-id',
          userId: 'test-user-id',
          platform: 'linkedin',
          content: 'Post 2',
          scheduledTime: new Date(),
          status: 'pending_confirmation',
          requiresConfirmation: true,
          createdAt: new Date()
        },
        {
          postId: 'post-3',
          eventId: 'test-event-id',
          userId: 'test-user-id',
          platform: 'linkedin',
          content: 'Post 3',
          scheduledTime: new Date(),
          status: 'published',
          requiresConfirmation: false,
          createdAt: new Date()
        }
      ];

      const mockGetScheduledPostsByEvent = jest.spyOn(SocialMediaService as any, 'getScheduledPostsByEvent')
        .mockResolvedValue(mockPosts);
      
      const mockUpdatePostStatus = jest.spyOn(SocialMediaService as any, 'updatePostStatus')
        .mockResolvedValue(undefined);

      await SocialMediaService.cancelPostsForEvent('test-event-id');

      expect(mockGetScheduledPostsByEvent).toHaveBeenCalledWith('test-event-id');
      expect(mockUpdatePostStatus).toHaveBeenCalledTimes(2); // Only pending and pending_confirmation

      expect(mockUpdatePostStatus).toHaveBeenCalledWith('post-1', 'cancelled');
      expect(mockUpdatePostStatus).toHaveBeenCalledWith('post-2', 'cancelled');

      // Should not cancel already published post
      expect(mockUpdatePostStatus).not.toHaveBeenCalledWith('post-3', 'cancelled');

      mockGetScheduledPostsByEvent.mockRestore();
      mockUpdatePostStatus.mockRestore();
    });

    test('should handle empty post list', async () => {
      const mockGetScheduledPostsByEvent = jest.spyOn(SocialMediaService as any, 'getScheduledPostsByEvent')
        .mockResolvedValue([]);
      
      const mockUpdatePostStatus = jest.spyOn(SocialMediaService as any, 'updatePostStatus')
        .mockResolvedValue(undefined);

      await SocialMediaService.cancelPostsForEvent('test-event-id');

      expect(mockGetScheduledPostsByEvent).toHaveBeenCalledWith('test-event-id');
      expect(mockUpdatePostStatus).not.toHaveBeenCalled();

      mockGetScheduledPostsByEvent.mockRestore();
      mockUpdatePostStatus.mockRestore();
    });

    test('should handle database errors', async () => {
      const mockGetScheduledPostsByEvent = jest.spyOn(SocialMediaService as any, 'getScheduledPostsByEvent')
        .mockRejectedValue(new Error('Database error'));

      await expect(
        SocialMediaService.cancelPostsForEvent('test-event-id')
      ).rejects.toThrow('Failed to cancel posts for event test-event-id: Database error');

      mockGetScheduledPostsByEvent.mockRestore();
    });
  });

  describe('updatePostsForEvent', () => {
    test('should update content for pending posts', async () => {
      const mockPosts: ScheduledPost[] = [
        {
          postId: 'post-1',
          eventId: 'test-event-id',
          userId: 'test-user-id',
          platform: 'linkedin',
          content: 'Old content',
          scheduledTime: new Date(mockEvent.dateTime.getTime() - 30 * 24 * 60 * 60 * 1000), // 1 month before
          status: 'pending',
          requiresConfirmation: false,
          createdAt: new Date()
        },
        {
          postId: 'post-2',
          eventId: 'test-event-id',
          userId: 'test-user-id',
          platform: 'linkedin',
          content: 'Old content',
          scheduledTime: new Date(mockEvent.dateTime.getTime()),
          status: 'published', // Should not be updated
          requiresConfirmation: false,
          createdAt: new Date()
        }
      ];

      const mockGetScheduledPostsByEvent = jest.spyOn(SocialMediaService as any, 'getScheduledPostsByEvent')
        .mockResolvedValue(mockPosts);
      
      const mockUpdatePostContent = jest.spyOn(SocialMediaService as any, 'updatePostContent')
        .mockResolvedValue(undefined);

      await SocialMediaService.updatePostsForEvent(mockEvent);

      expect(mockGetScheduledPostsByEvent).toHaveBeenCalledWith('test-event-id');
      expect(mockUpdatePostContent).toHaveBeenCalledTimes(1); // Only pending post

      expect(mockUpdatePostContent).toHaveBeenCalledWith(
        'post-1',
        expect.stringContaining('Test Event')
      );

      mockGetScheduledPostsByEvent.mockRestore();
      mockUpdatePostContent.mockRestore();
    });

    test('should use custom template for updates', async () => {
      const mockPosts: ScheduledPost[] = [
        {
          postId: 'post-1',
          eventId: 'test-event-id',
          userId: 'test-user-id',
          platform: 'linkedin',
          content: 'Old content',
          scheduledTime: new Date(mockEvent.dateTime.getTime() - 30 * 24 * 60 * 60 * 1000),
          status: 'pending',
          requiresConfirmation: false,
          createdAt: new Date()
        }
      ];

      const mockGetScheduledPostsByEvent = jest.spyOn(SocialMediaService as any, 'getScheduledPostsByEvent')
        .mockResolvedValue(mockPosts);
      
      const mockUpdatePostContent = jest.spyOn(SocialMediaService as any, 'updatePostContent')
        .mockResolvedValue(undefined);

      const customTemplate = {
        oneMonth: 'Updated custom message for {title}'
      };

      await SocialMediaService.updatePostsForEvent(mockEvent, customTemplate);

      expect(mockUpdatePostContent).toHaveBeenCalledWith(
        'post-1',
        expect.stringContaining('Updated custom message')
      );

      mockGetScheduledPostsByEvent.mockRestore();
      mockUpdatePostContent.mockRestore();
    });
  });

  describe('confirmPostsForEvent', () => {
    test('should change pending_confirmation posts to pending', async () => {
      const mockPosts: ScheduledPost[] = [
        {
          postId: 'post-1',
          eventId: 'test-event-id',
          userId: 'test-user-id',
          platform: 'linkedin',
          content: 'Post 1',
          scheduledTime: new Date(),
          status: 'pending_confirmation',
          requiresConfirmation: true,
          createdAt: new Date()
        },
        {
          postId: 'post-2',
          eventId: 'test-event-id',
          userId: 'test-user-id',
          platform: 'linkedin',
          content: 'Post 2',
          scheduledTime: new Date(),
          status: 'pending', // Already pending, should not be updated
          requiresConfirmation: false,
          createdAt: new Date()
        }
      ];

      const mockGetScheduledPostsByEvent = jest.spyOn(SocialMediaService as any, 'getScheduledPostsByEvent')
        .mockResolvedValue(mockPosts);
      
      const mockUpdatePostStatus = jest.spyOn(SocialMediaService as any, 'updatePostStatus')
        .mockResolvedValue(undefined);

      await SocialMediaService.confirmPostsForEvent('test-event-id');

      expect(mockGetScheduledPostsByEvent).toHaveBeenCalledWith('test-event-id');
      expect(mockUpdatePostStatus).toHaveBeenCalledTimes(1);
      expect(mockUpdatePostStatus).toHaveBeenCalledWith('post-1', 'pending');

      mockGetScheduledPostsByEvent.mockRestore();
      mockUpdatePostStatus.mockRestore();
    });
  });

  describe('Post content generation', () => {
    test('should generate content with event details', async () => {
      const mockSaveScheduledPost = jest.spyOn(SocialMediaService as any, 'saveScheduledPost')
        .mockResolvedValue(undefined);

      const request: SchedulePostsRequest = {
        event: mockEvent,
        userProfile: mockUserProfile
      };

      const result = await SocialMediaService.schedulePostsForEvent(request);

      expect(result.scheduledPosts).toHaveLength(5);
      
      // Verify all posts contain event details
      result.scheduledPosts.forEach(post => {
        expect(post.content).toContain('Test Event');
        expect(post.content).toContain('Test Location');
        
        // Only some posts contain date information (not the "day of" post)
        if (!post.content.includes("It's happening TODAY!")) {
          expect(post.content).toMatch(/\d{4}/); // Should contain year
        }
      });

      // Verify different posts have different content
      const contentSet = new Set(result.scheduledPosts.map(p => p.content));
      expect(contentSet.size).toBe(5);

      mockSaveScheduledPost.mockRestore();
    });
  });
});