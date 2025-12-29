// Property-based tests for social media scheduling service

import * as fc from 'fast-check';
import { SocialMediaService, SchedulePostsRequest } from '../src/shared/social-media-service';
import { Event, UserProfile, ScheduledPost } from '../src/shared/types';
import { generateId } from '../src/shared/utils';

// Mock AWS clients
jest.mock('../src/shared/aws-clients');

describe('Social Media Scheduling Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * **Feature: logimeet, Property 8: Social post scheduling consistency**
   * For any event creation, the system should schedule exactly 5 LinkedIn posts at intervals of 1 month, 2 weeks, 1 week, 3 days, and day of event
   * **Validates: Requirements 4.1**
   */
  test('Property 8: Social post scheduling consistency', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        description: fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        location: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        // Event must be far enough in the future to allow all 5 posts
        dateTime: fc.date({ min: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000) }), // 35+ days in future
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        requiresConfirmation: fc.boolean(),
        publishToLinkedIn: fc.constant(true) // Force LinkedIn publishing to test scheduling
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
      async (eventData, userProfile: UserProfile) => {
        // Create event object (simulate the sanitization that happens in EventModel)
        const event: Event = {
          eventId: generateId(),
          userId: eventData.userId,
          title: eventData.title.trim().replace(/[<>]/g, ''), // Apply same sanitization as EventModel
          description: eventData.description.trim().replace(/[<>]/g, ''),
          dateTime: eventData.dateTime,
          location: eventData.location.trim().replace(/[<>]/g, ''),
          meetupEventStatus: 'draft',
          platformStatus: 'confirmed',
          source: 'platform',
          requiresConfirmation: eventData.requiresConfirmation,
          publishToMeetup: false,
          publishToLinkedIn: eventData.publishToLinkedIn,
          socialPostsScheduled: false,
          messagesScheduled: false,
          lastSyncTime: new Date(),
          externallyModified: false,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // Mock database operations to avoid actual DB calls
        const mockSaveScheduledPost = jest.spyOn(SocialMediaService as any, 'saveScheduledPost')
          .mockResolvedValue(undefined);

        try {
          // Schedule posts for the event
          const request: SchedulePostsRequest = {
            event,
            userProfile
          };

          const result = await SocialMediaService.schedulePostsForEvent(request);

          // Verify exactly 5 posts are scheduled (one for each interval)
          expect(result.scheduledPosts).toHaveLength(5);
          expect(result.errors).toHaveLength(0);

          // Calculate expected schedule times
          const eventTime = event.dateTime.getTime();
          const expectedIntervals = [
            30 * 24 * 60 * 60 * 1000, // 1 month (30 days)
            14 * 24 * 60 * 60 * 1000, // 2 weeks (14 days)
            7 * 24 * 60 * 60 * 1000,  // 1 week (7 days)
            3 * 24 * 60 * 60 * 1000,  // 3 days
            0                          // Day of event
          ];

          const expectedScheduleTimes = expectedIntervals.map(interval => 
            new Date(eventTime - interval)
          );

          // Sort posts by scheduled time for comparison
          const sortedPosts = result.scheduledPosts.sort((a, b) => 
            a.scheduledTime.getTime() - b.scheduledTime.getTime()
          );

          // Verify each post is scheduled at the correct interval
          for (let i = 0; i < 5; i++) {
            const post = sortedPosts[i];
            const expectedTime = expectedScheduleTimes[i];
            
            // Verify scheduled time matches expected interval (within 1 second tolerance)
            expect(Math.abs(post.scheduledTime.getTime() - expectedTime.getTime())).toBeLessThan(1000);
            
            // Verify post properties
            expect(post.eventId).toBe(event.eventId);
            expect(post.userId).toBe(event.userId);
            expect(post.platform).toBe('linkedin');
            expect(post.content).toBeDefined();
            expect(post.content.length).toBeGreaterThan(0);
            
            // Verify post contains event information (using sanitized values)
            expect(post.content).toContain(event.title); // event.title is already sanitized
            
            // Verify status based on confirmation requirements
            const expectedStatus = (event.requiresConfirmation || userProfile.manualConfirmationEnabled) 
              ? 'pending_confirmation' 
              : 'pending';
            expect(post.status).toBe(expectedStatus);
            
            // Verify confirmation requirement is set correctly
            expect(post.requiresConfirmation).toBe(event.requiresConfirmation || userProfile.manualConfirmationEnabled);
          }

          // Verify posts have different content (each interval should have unique messaging)
          const contentSet = new Set(result.scheduledPosts.map(p => p.content));
          expect(contentSet.size).toBe(5); // All 5 posts should have unique content

          // Verify all posts are for LinkedIn platform
          expect(result.scheduledPosts.every(p => p.platform === 'linkedin')).toBe(true);

          // Verify all posts belong to the same event and user
          expect(result.scheduledPosts.every(p => p.eventId === event.eventId)).toBe(true);
          expect(result.scheduledPosts.every(p => p.userId === event.userId)).toBe(true);

          // Verify database save was called for each post
          expect(mockSaveScheduledPost).toHaveBeenCalledTimes(5);

        } catch (error) {
          // Scheduling should not fail for valid event data
          expect(error).toBeUndefined();
        } finally {
          mockSaveScheduledPost.mockRestore();
        }
      }
    ), { numRuns: 100 });
  });
});
  /**
   * **Feature: logimeet, Property 9: Scheduled post execution**
   * For any scheduled post with an arrived time, the system should publish the content to LinkedIn at the correct time
   * **Validates: Requirements 4.2**
   */
  test('Property 9: Scheduled post execution', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        postId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        eventId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
        platform: fc.constant('linkedin' as const),
        content: fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.trim().replace(/[<>]/g, '').length > 10),
        // Scheduled time in the past (ready for execution)
        scheduledTime: fc.date({ max: new Date(Date.now() - 60000) }), // At least 1 minute ago
        status: fc.constant('pending' as const),
        requiresConfirmation: fc.constant(false), // Not requiring confirmation for execution test
        createdAt: fc.date({ max: new Date() })
      }),
      fc.boolean(), // Success/failure flag for LinkedIn API
      fc.string({ minLength: 1, maxLength: 100 }), // External post ID or error message
      async (scheduledPost: ScheduledPost, shouldSucceed: boolean, externalIdOrError: string) => {
        // Mock LinkedIn client
        const mockLinkedInClient = {
          createPost: jest.fn()
        } as any;

        // Mock database operations
        const mockUpdatePostStatus = jest.spyOn(SocialMediaService as any, 'updatePostStatus')
          .mockResolvedValue(undefined);

        try {
          if (shouldSucceed) {
            // Mock successful LinkedIn post creation
            const mockLinkedInPost = {
              id: externalIdOrError,
              content: scheduledPost.content,
              visibility: 'public',
              status: 'published'
            };
            mockLinkedInClient.createPost.mockResolvedValue(mockLinkedInPost);
          } else {
            // Mock LinkedIn API error
            const error = new Error(externalIdOrError);
            mockLinkedInClient.createPost.mockRejectedValue(error);
          }

          // Execute the scheduled post
          const result = await SocialMediaService.executeScheduledPost({
            post: scheduledPost,
            linkedinClient: mockLinkedInClient
          });

          if (shouldSucceed) {
            // Verify successful execution
            expect(result.success).toBe(true);
            expect(result.externalPostId).toBe(externalIdOrError);
            expect(result.errorMessage).toBeUndefined();

            // Verify LinkedIn API was called with correct parameters
            expect(mockLinkedInClient.createPost).toHaveBeenCalledWith({
              content: scheduledPost.content,
              visibility: 'public',
              organizationId: scheduledPost.externalPostId // Should use stored org ID if available
            });

            // Verify post status was updated to published
            expect(mockUpdatePostStatus).toHaveBeenCalledWith(
              scheduledPost.postId,
              'published',
              externalIdOrError
            );

          } else {
            // Verify failed execution
            expect(result.success).toBe(false);
            expect(result.externalPostId).toBeUndefined();
            expect(result.errorMessage).toBe(externalIdOrError);

            // Verify LinkedIn API was still called (attempt was made)
            expect(mockLinkedInClient.createPost).toHaveBeenCalledWith({
              content: scheduledPost.content,
              visibility: 'public',
              organizationId: scheduledPost.externalPostId
            });

            // Verify post status was updated to failed with error message
            expect(mockUpdatePostStatus).toHaveBeenCalledWith(
              scheduledPost.postId,
              'failed',
              undefined,
              externalIdOrError
            );
          }

          // Verify the post content is published exactly as scheduled
          const createPostCall = mockLinkedInClient.createPost.mock.calls[0][0];
          expect(createPostCall.content).toBe(scheduledPost.content);
          expect(createPostCall.visibility).toBe('public');

          // Verify database update was called exactly once
          expect(mockUpdatePostStatus).toHaveBeenCalledTimes(1);

        } catch (error) {
          // Post execution should handle errors gracefully and not throw
          expect(error).toBeUndefined();
        } finally {
          mockUpdatePostStatus.mockRestore();
        }
      }
    ), { numRuns: 100 });
  });
  /**
   * **Feature: logimeet, Property 10: Event cancellation cleanup**
   * For any event cancellation, the system should remove all remaining scheduled posts associated with that event
   * **Validates: Requirements 4.4**
   */
  test('Property 10: Event cancellation cleanup', async () => {
    await fc.assert(fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0), // eventId
      fc.array(
        fc.record({
          postId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().replace(/[<>]/g, '').length > 0),
          platform: fc.constant('linkedin' as const),
          content: fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.trim().replace(/[<>]/g, '').length > 10),
          scheduledTime: fc.date({ min: new Date() }), // Future dates
          status: fc.oneof(
            fc.constant('pending' as const),
            fc.constant('pending_confirmation' as const),
            fc.constant('published' as const),
            fc.constant('failed' as const),
            fc.constant('cancelled' as const)
          ),
          requiresConfirmation: fc.boolean(),
          createdAt: fc.date({ max: new Date() })
        }),
        { minLength: 0, maxLength: 10 }
      ), // Array of scheduled posts
      async (eventId: string, existingPosts: Partial<ScheduledPost>[]) => {
        // Complete the post objects with required fields
        const completePosts: ScheduledPost[] = existingPosts.map(post => ({
          eventId,
          userId: 'test-user',
          ...post
        } as ScheduledPost));

        // Mock database operations
        const mockGetScheduledPostsByEvent = jest.spyOn(SocialMediaService as any, 'getScheduledPostsByEvent')
          .mockResolvedValue(completePosts);
        
        const mockUpdatePostStatus = jest.spyOn(SocialMediaService as any, 'updatePostStatus')
          .mockResolvedValue(undefined);

        try {
          // Cancel posts for the event
          await SocialMediaService.cancelPostsForEvent(eventId);

          // Verify that getScheduledPostsByEvent was called with correct eventId
          expect(mockGetScheduledPostsByEvent).toHaveBeenCalledWith(eventId);

          // Count posts that should be cancelled (pending or pending_confirmation)
          const cancellablePosts = completePosts.filter(post => 
            post.status === 'pending' || post.status === 'pending_confirmation'
          );

          // Verify that updatePostStatus was called for each cancellable post
          expect(mockUpdatePostStatus).toHaveBeenCalledTimes(cancellablePosts.length);

          // Verify each cancellable post was updated to 'cancelled' status
          for (const post of cancellablePosts) {
            expect(mockUpdatePostStatus).toHaveBeenCalledWith(post.postId, 'cancelled');
          }

          // Verify that already published, failed, or cancelled posts were not updated
          const nonCancellablePosts = completePosts.filter(post => 
            post.status !== 'pending' && post.status !== 'pending_confirmation'
          );

          // Check that non-cancellable posts were not included in update calls
          for (const post of nonCancellablePosts) {
            const wasUpdated = mockUpdatePostStatus.mock.calls.some(call => call[0] === post.postId);
            expect(wasUpdated).toBe(false);
          }

          // If there are no cancellable posts, updatePostStatus should not be called
          if (cancellablePosts.length === 0) {
            expect(mockUpdatePostStatus).not.toHaveBeenCalled();
          }

          // Verify that all remaining scheduled posts (pending/pending_confirmation) are cancelled
          // This ensures complete cleanup of future posts
          const remainingScheduledPosts = cancellablePosts.length;
          const cancelledPosts = mockUpdatePostStatus.mock.calls.filter(call => call[1] === 'cancelled').length;
          expect(cancelledPosts).toBe(remainingScheduledPosts);

        } catch (error) {
          // Cancellation should not fail for valid event IDs
          expect(error).toBeUndefined();
        } finally {
          mockGetScheduledPostsByEvent.mockRestore();
          mockUpdatePostStatus.mockRestore();
        }
      }
    ), { numRuns: 100 });
  });