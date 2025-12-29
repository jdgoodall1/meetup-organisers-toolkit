// Social media scheduling service

import { ScheduledPost, Event, UserProfile } from './types';
import { ScheduledPostModel } from './models';
import { LinkedInClient } from './linkedin-client';
import { generateId, formatDateForStorage } from './utils';
import { dynamoDocClient } from './aws-clients';
import { PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { config } from './config';

export interface SocialMediaScheduleConfig {
  intervals: {
    oneMonth: number;    // 30 days in milliseconds
    twoWeeks: number;    // 14 days in milliseconds
    oneWeek: number;     // 7 days in milliseconds
    threeDays: number;   // 3 days in milliseconds
    dayOf: number;       // 0 days in milliseconds
  };
}

export interface PostTemplate {
  oneMonth: string;
  twoWeeks: string;
  oneWeek: string;
  threeDays: string;
  dayOf: string;
}

export interface SchedulePostsRequest {
  event: Event;
  userProfile: UserProfile;
  customTemplate?: Partial<PostTemplate>;
  organizationId?: string;
}

export interface SchedulePostsResult {
  scheduledPosts: ScheduledPost[];
  errors: string[];
}

export interface ExecutePostRequest {
  post: ScheduledPost;
  linkedinClient: LinkedInClient;
}

export interface ExecutePostResult {
  success: boolean;
  externalPostId?: string;
  errorMessage?: string;
}

export class SocialMediaService {
  private static readonly DEFAULT_SCHEDULE_CONFIG: SocialMediaScheduleConfig = {
    intervals: {
      oneMonth: 30 * 24 * 60 * 60 * 1000,  // 30 days
      twoWeeks: 14 * 24 * 60 * 60 * 1000,  // 14 days
      oneWeek: 7 * 24 * 60 * 60 * 1000,    // 7 days
      threeDays: 3 * 24 * 60 * 60 * 1000,  // 3 days
      dayOf: 0                              // Day of event
    }
  };

  private static readonly DEFAULT_POST_TEMPLATE: PostTemplate = {
    oneMonth: "🗓️ Save the date! Join us for '{title}' on {date} at {location}. More details coming soon! #meetup #networking",
    twoWeeks: "📅 Two weeks to go! Don't miss '{title}' on {date} at {location}. {description} #meetup #event",
    oneWeek: "⏰ One week left! Register now for '{title}' on {date} at {location}. {description} #meetup #lastchance",
    threeDays: "🚨 Final reminder! '{title}' is happening in just 3 days on {date} at {location}. Secure your spot! #meetup #finalcall",
    dayOf: "🎉 It's happening TODAY! '{title}' starts soon at {location}. See you there! #meetup #today"
  };

  /**
   * Schedule all 5 social media posts for an event
   */
  static async schedulePostsForEvent(request: SchedulePostsRequest): Promise<SchedulePostsResult> {
    const { event, userProfile, customTemplate, organizationId } = request;
    const scheduledPosts: ScheduledPost[] = [];
    const errors: string[] = [];

    try {
      // Use custom template or default
      const template = { ...this.DEFAULT_POST_TEMPLATE, ...customTemplate };
      
      // Calculate scheduled times based on event date
      const eventTime = event.dateTime.getTime();
      const scheduleConfig = this.DEFAULT_SCHEDULE_CONFIG;
      
      const scheduleTimes = [
        { key: 'oneMonth' as keyof PostTemplate, time: new Date(eventTime - scheduleConfig.intervals.oneMonth) },
        { key: 'twoWeeks' as keyof PostTemplate, time: new Date(eventTime - scheduleConfig.intervals.twoWeeks) },
        { key: 'oneWeek' as keyof PostTemplate, time: new Date(eventTime - scheduleConfig.intervals.oneWeek) },
        { key: 'threeDays' as keyof PostTemplate, time: new Date(eventTime - scheduleConfig.intervals.threeDays) },
        { key: 'dayOf' as keyof PostTemplate, time: new Date(eventTime - scheduleConfig.intervals.dayOf) }
      ];

      // Create scheduled posts
      for (const schedule of scheduleTimes) {
        try {
          // Skip posts scheduled in the past
          if (schedule.time.getTime() <= Date.now()) {
            continue;
          }

          // Generate post content from template
          const content = this.generatePostContent(template[schedule.key], event);
          
          // Determine status based on confirmation requirements
          const status = (event.requiresConfirmation || userProfile.manualConfirmationEnabled) 
            ? 'pending_confirmation' 
            : 'pending';

          // Create scheduled post
          const scheduledPost = ScheduledPostModel.create({
            eventId: event.eventId,
            userId: event.userId,
            platform: 'linkedin',
            content,
            scheduledTime: schedule.time,
            status,
            requiresConfirmation: event.requiresConfirmation || userProfile.manualConfirmationEnabled
          });

          // Save to database
          await this.saveScheduledPost(scheduledPost, organizationId);
          scheduledPosts.push(scheduledPost);

        } catch (error) {
          const errorMessage = `Failed to schedule ${schedule.key} post: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMessage);
        }
      }

      return { scheduledPosts, errors };

    } catch (error) {
      const errorMessage = `Failed to schedule posts for event: ${error instanceof Error ? error.message : 'Unknown error'}`;
      return { scheduledPosts: [], errors: [errorMessage] };
    }
  }

  /**
   * Execute a scheduled post by publishing it to LinkedIn
   */
  static async executeScheduledPost(request: ExecutePostRequest): Promise<ExecutePostResult> {
    const { post, linkedinClient } = request;

    try {
      // Create the post on LinkedIn
      const linkedinPost = await linkedinClient.createPost({
        content: post.content,
        visibility: 'public',
        organizationId: post.externalPostId // Use stored organization ID if available
      });

      // Update post status in database
      await this.updatePostStatus(post.postId, 'published', linkedinPost.id);

      return {
        success: true,
        externalPostId: linkedinPost.id
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update post status to failed
      await this.updatePostStatus(post.postId, 'failed', undefined, errorMessage);

      return {
        success: false,
        errorMessage
      };
    }
  }

  /**
   * Cancel all scheduled posts for an event
   */
  static async cancelPostsForEvent(eventId: string): Promise<void> {
    try {
      // Get all scheduled posts for the event
      const posts = await this.getScheduledPostsByEvent(eventId);
      
      // Cancel each post that hasn't been published yet
      for (const post of posts) {
        if (post.status === 'pending' || post.status === 'pending_confirmation') {
          await this.updatePostStatus(post.postId, 'cancelled');
        }
      }

    } catch (error) {
      throw new Error(`Failed to cancel posts for event ${eventId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update scheduled post content for event modifications
   */
  static async updatePostsForEvent(event: Event, customTemplate?: Partial<PostTemplate>): Promise<void> {
    try {
      // Get all pending posts for the event
      const posts = await this.getScheduledPostsByEvent(event.eventId);
      const template = { ...this.DEFAULT_POST_TEMPLATE, ...customTemplate };
      
      // Update content for each pending post
      for (const post of posts) {
        if (post.status === 'pending' || post.status === 'pending_confirmation') {
          // Determine which template to use based on scheduled time
          const eventTime = event.dateTime.getTime();
          const postTime = post.scheduledTime.getTime();
          const timeDiff = eventTime - postTime;
          
          let templateKey: keyof PostTemplate = 'dayOf';
          if (timeDiff >= this.DEFAULT_SCHEDULE_CONFIG.intervals.oneMonth) {
            templateKey = 'oneMonth';
          } else if (timeDiff >= this.DEFAULT_SCHEDULE_CONFIG.intervals.twoWeeks) {
            templateKey = 'twoWeeks';
          } else if (timeDiff >= this.DEFAULT_SCHEDULE_CONFIG.intervals.oneWeek) {
            templateKey = 'oneWeek';
          } else if (timeDiff >= this.DEFAULT_SCHEDULE_CONFIG.intervals.threeDays) {
            templateKey = 'threeDays';
          }

          // Generate updated content
          const updatedContent = this.generatePostContent(template[templateKey], event);
          
          // Update post in database
          await this.updatePostContent(post.postId, updatedContent);
        }
      }

    } catch (error) {
      throw new Error(`Failed to update posts for event ${event.eventId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get scheduled posts that are ready to be executed
   */
  static async getPostsReadyForExecution(): Promise<ScheduledPost[]> {
    try {
      const now = new Date();
      const result = await dynamoDocClient.send(new QueryCommand({
        TableName: config.tables.scheduledPosts,
        IndexName: 'ScheduledTimeIndex', // Assumes GSI exists
        KeyConditionExpression: '#status = :status AND scheduledTime <= :now',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'pending',
          ':now': formatDateForStorage(now)
        }
      }));

      if (!result.Items) {
        return [];
      }

      return result.Items.map(item => ScheduledPostModel.deserialize(item));

    } catch (error) {
      throw new Error(`Failed to get posts ready for execution: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Confirm pending posts (change status from pending_confirmation to pending)
   */
  static async confirmPostsForEvent(eventId: string): Promise<void> {
    try {
      const posts = await this.getScheduledPostsByEvent(eventId);
      
      for (const post of posts) {
        if (post.status === 'pending_confirmation') {
          await this.updatePostStatus(post.postId, 'pending');
        }
      }

    } catch (error) {
      throw new Error(`Failed to confirm posts for event ${eventId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate post content from template and event data
   */
  private static generatePostContent(template: string, event: Event): string {
    const formatDate = (date: Date): string => {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    };

    // Use a function replacement to avoid issues with special characters like $&
    return template
      .replace(/\{title\}/g, () => event.title)
      .replace(/\{description\}/g, () => event.description)
      .replace(/\{date\}/g, () => formatDate(event.dateTime))
      .replace(/\{location\}/g, () => event.location);
  }

  /**
   * Save scheduled post to database
   */
  private static async saveScheduledPost(post: ScheduledPost, organizationId?: string): Promise<void> {
    const serializedPost = ScheduledPostModel.serialize(post);
    
    await dynamoDocClient.send(new PutCommand({
      TableName: config.tables.scheduledPosts,
      Item: {
        PK: `EVENT#${post.eventId}`,
        SK: `POST#${post.postId}`,
        organizationId, // Store organization ID for later use
        ...serializedPost
      }
    }));
  }

  /**
   * Update post status in database
   */
  private static async updatePostStatus(
    postId: string, 
    status: ScheduledPost['status'], 
    externalPostId?: string,
    errorMessage?: string
  ): Promise<void> {
    let updateExpression = 'SET #status = :status, updatedAt = :updatedAt';
    const expressionAttributeNames: Record<string, string> = { '#status': 'status' };
    const expressionAttributeValues: Record<string, any> = {
      ':status': status,
      ':updatedAt': formatDateForStorage(new Date())
    };

    if (externalPostId) {
      updateExpression += ', externalPostId = :externalPostId';
      expressionAttributeValues[':externalPostId'] = externalPostId;
    }

    if (errorMessage) {
      updateExpression += ', errorMessage = :errorMessage';
      expressionAttributeValues[':errorMessage'] = errorMessage;
    }

    await dynamoDocClient.send(new UpdateCommand({
      TableName: config.tables.scheduledPosts,
      Key: { postId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    }));
  }

  /**
   * Update post content in database
   */
  private static async updatePostContent(postId: string, content: string): Promise<void> {
    await dynamoDocClient.send(new UpdateCommand({
      TableName: config.tables.scheduledPosts,
      Key: { postId },
      UpdateExpression: 'SET content = :content, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':content': content,
        ':updatedAt': formatDateForStorage(new Date())
      }
    }));
  }

  /**
   * Get scheduled posts for an event
   */
  private static async getScheduledPostsByEvent(eventId: string): Promise<ScheduledPost[]> {
    const result = await dynamoDocClient.send(new QueryCommand({
      TableName: config.tables.scheduledPosts,
      IndexName: 'EventPostsIndex',
      KeyConditionExpression: 'eventId = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId
      }
    }));

    if (!result.Items) {
      return [];
    }

    return result.Items.map(item => {
      const { PK, SK, ...postData } = item;
      return ScheduledPostModel.deserialize(postData);
    });
  }
}