// Scheduler Lambda handler

import { SQSEvent, EventBridgeEvent } from 'aws-lambda';
import { validateConfig } from '../shared/config';
import { SocialMediaService } from '../shared/social-media-service';
import { LinkedInClient } from '../shared/linkedin-client';
import { UserProfileModel } from '../shared/models';

export const handler = async (
  event: SQSEvent | EventBridgeEvent<string, any>
): Promise<void> => {
  try {
    validateConfig();

    // Handle SQS events (scheduled posts)
    if ('Records' in event) {
      await handleSQSEvent(event as SQSEvent);
    }
    // Handle EventBridge events (periodic tasks)
    else if ('source' in event) {
      await handleEventBridgeEvent(event as EventBridgeEvent<string, any>);
    }
  } catch (error) {
    console.error('Scheduler handler error:', error);
    throw error;
  }
};

async function handleSQSEvent(event: SQSEvent): Promise<void> {
  console.log('Processing SQS messages:', event.Records.length);
  
  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);
      
      if (message.type === 'execute_scheduled_post') {
        await executeScheduledPost(message.postId, message.userId);
      } else {
        console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error processing SQS record:', error);
      // Continue processing other records
    }
  }
}

async function handleEventBridgeEvent(event: EventBridgeEvent<string, any>): Promise<void> {
  console.log('Processing EventBridge event:', event.source, event['detail-type']);
  
  if (event.source === 'eventpush.scheduler' && event['detail-type'] === 'Check Scheduled Posts') {
    await checkAndExecuteScheduledPosts();
  }
}

async function executeScheduledPost(postId: string, userId: string): Promise<void> {
  try {
    // Get user profile to access LinkedIn credentials
    const userProfile = await UserProfileModel.get(userId);
    if (!userProfile || !userProfile.linkedinCredentials) {
      console.error(`No LinkedIn credentials found for user ${userId}`);
      return;
    }

    // Create LinkedIn client
    const linkedinClient = new LinkedInClient(userProfile.linkedinCredentials);

    // Get the scheduled post (this would need to be implemented in SocialMediaService)
    // For now, we'll assume the post details are passed in the message
    // In a real implementation, we'd fetch the post from the database
    
    console.log(`Executing scheduled post ${postId} for user ${userId}`);
    // The actual execution would happen here
    
  } catch (error) {
    console.error(`Error executing scheduled post ${postId}:`, error);
    throw error;
  }
}

async function checkAndExecuteScheduledPosts(): Promise<void> {
  try {
    console.log('Checking for posts ready for execution...');
    
    // Get posts that are ready to be executed
    const readyPosts = await SocialMediaService.getPostsReadyForExecution();
    
    console.log(`Found ${readyPosts.length} posts ready for execution`);
    
    for (const post of readyPosts) {
      try {
        // Get user profile for LinkedIn credentials
        const userProfile = await UserProfileModel.get(post.userId);
        if (!userProfile || !userProfile.linkedinCredentials) {
          console.error(`No LinkedIn credentials found for user ${post.userId}`);
          continue;
        }

        // Create LinkedIn client and execute post
        const linkedinClient = new LinkedInClient(userProfile.linkedinCredentials);
        
        const result = await SocialMediaService.executeScheduledPost({
          post,
          linkedinClient
        });

        if (result.success) {
          console.log(`Successfully executed post ${post.postId}`);
        } else {
          console.error(`Failed to execute post ${post.postId}: ${result.errorMessage}`);
        }
        
      } catch (error) {
        console.error(`Error executing post ${post.postId}:`, error);
        // Continue with other posts
      }
    }
    
  } catch (error) {
    console.error('Error checking scheduled posts:', error);
    throw error;
  }
}