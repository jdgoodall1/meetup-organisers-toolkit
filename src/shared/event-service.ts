// Event service for managing events across platforms

import { Event, UserProfile } from './types';
import { EventModel } from './models';
import { MeetupClient, MeetupEvent, MeetupApiError } from './meetup-client';
import { LinkedInClient, LinkedInEvent, LinkedInApiError } from './linkedin-client';
import { SocialMediaService } from './social-media-service';
import { MessagingService } from './messaging-service';
import { NotificationService } from './notification-service';
import { generateId } from './utils';

export interface CreateEventRequest {
  title: string;
  description: string;
  dateTime: Date;
  location: string;
  publishToMeetup: boolean;
  publishToLinkedIn: boolean;
  requiresConfirmation?: boolean;
  groupId?: string; // Meetup group ID
}

export interface EventCreationResult {
  event: Event;
  meetupEvent?: MeetupEvent;
  linkedinEvent?: LinkedInEvent;
  errors: string[];
}

export class EventService {
  constructor(
    private meetupClient?: MeetupClient,
    private linkedinClient?: LinkedInClient
  ) {}

  /**
   * Create a new event
   */
  async createEvent(
    userId: string,
    userProfile: UserProfile,
    request: CreateEventRequest
  ): Promise<EventCreationResult> {
    const errors: string[] = [];
    let meetupEvent: MeetupEvent | undefined;
    let linkedinEvent: LinkedInEvent | undefined;

    // Create the local event record
    const event = EventModel.createNew({
      userId,
      title: request.title,
      description: request.description,
      dateTime: request.dateTime,
      location: request.location,
      publishToMeetup: request.publishToMeetup,
      publishToLinkedIn: request.publishToLinkedIn,
      requiresConfirmation: request.requiresConfirmation || userProfile.manualConfirmationEnabled,
      platformStatus: (request.requiresConfirmation || userProfile.manualConfirmationEnabled) 
        ? 'pending_confirmation' 
        : 'confirmed',
      source: 'platform'
    });

    // Create event on Meetup.com if requested
    if (request.publishToMeetup && this.meetupClient && request.groupId) {
      try {
        const meetupEventData: MeetupEvent = {
          name: request.title,
          description: request.description,
          time: request.dateTime.getTime(),
          venue: {
            name: request.location
          }
        };

        const isDraft = request.requiresConfirmation || userProfile.manualConfirmationEnabled;
        meetupEvent = await this.meetupClient.createEvent(
          request.groupId,
          meetupEventData,
          isDraft
        );

        // Update local event with Meetup details
        event.meetupEventId = meetupEvent.id;
        event.meetupEventStatus = meetupEvent.status || (isDraft ? 'draft' : 'published');
      } catch (error) {
        if (error instanceof MeetupApiError) {
          errors.push(`Meetup.com error: ${error.message}`);
        } else {
          errors.push(`Failed to create Meetup.com event: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Create event on LinkedIn if requested and not in draft mode
    if (request.publishToLinkedIn && this.linkedinClient) {
      try {
        // Only create LinkedIn event if not requiring confirmation or if already confirmed
        const shouldCreateLinkedInEvent = !(request.requiresConfirmation || userProfile.manualConfirmationEnabled);
        
        if (shouldCreateLinkedInEvent) {
          const linkedinEventData: LinkedInEvent = {
            name: request.title,
            description: request.description,
            startDateTime: request.dateTime.toISOString(),
            location: {
              name: request.location
            },
            eventType: 'in_person',
            visibility: 'public'
          };

          linkedinEvent = await this.linkedinClient.createEvent(linkedinEventData);

          // Update local event with LinkedIn details
          event.linkedinEventId = linkedinEvent.id;
          event.linkedinEventStatus = linkedinEvent.status || 'published';
        } else {
          // Mark as draft for later confirmation
          event.linkedinEventStatus = 'draft';
        }
      } catch (error) {
        if (error instanceof LinkedInApiError) {
          errors.push(`LinkedIn error: ${error.message}`);
        } else {
          errors.push(`Failed to create LinkedIn event: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    return {
      event,
      meetupEvent,
      linkedinEvent,
      errors
    };
  }

  /**
   * Confirm a draft event (publish it)
   */
  async confirmEvent(
    event: Event,
    groupId?: string
  ): Promise<{ event: Event; meetupEvent?: MeetupEvent; linkedinEvent?: LinkedInEvent; errors: string[] }> {
    const errors: string[] = [];
    let meetupEvent: MeetupEvent | undefined;
    let linkedinEvent: LinkedInEvent | undefined;

    // Update local event status
    event.platformStatus = 'confirmed';
    event.updatedAt = new Date();

    // Publish draft event on Meetup.com if it exists
    if (event.meetupEventId && event.meetupEventStatus === 'draft' && this.meetupClient && groupId) {
      try {
        meetupEvent = await this.meetupClient.publishDraftEvent(groupId, event.meetupEventId);
        event.meetupEventStatus = 'published';
      } catch (error) {
        if (error instanceof MeetupApiError) {
          errors.push(`Failed to publish Meetup.com event: ${error.message}`);
        } else {
          errors.push(`Failed to publish Meetup.com event: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Create LinkedIn event if it was requested but not created due to draft mode
    if (event.publishToLinkedIn && !event.linkedinEventId && this.linkedinClient) {
      try {
        const linkedinEventData: LinkedInEvent = {
          name: event.title,
          description: event.description,
          startDateTime: event.dateTime.toISOString(),
          location: {
            name: event.location
          },
          eventType: 'in_person',
          visibility: 'public'
        };

        linkedinEvent = await this.linkedinClient.createEvent(linkedinEventData);

        // Update local event with LinkedIn details
        event.linkedinEventId = linkedinEvent.id;
        event.linkedinEventStatus = linkedinEvent.status || 'published';
      } catch (error) {
        if (error instanceof LinkedInApiError) {
          errors.push(`Failed to create LinkedIn event: ${error.message}`);
        } else {
          errors.push(`Failed to create LinkedIn event: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    return {
      event,
      meetupEvent,
      linkedinEvent,
      errors
    };
  }

  /**
   * Update an existing event
   */
  async updateEvent(
    event: Event,
    updates: Partial<CreateEventRequest>,
    groupId?: string
  ): Promise<{ event: Event; meetupEvent?: MeetupEvent; linkedinEvent?: LinkedInEvent; errors: string[] }> {
    const errors: string[] = [];
    let meetupEvent: MeetupEvent | undefined;
    let linkedinEvent: LinkedInEvent | undefined;

    // Update local event
    if (updates.title) event.title = updates.title;
    if (updates.description) event.description = updates.description;
    if (updates.dateTime) event.dateTime = updates.dateTime;
    if (updates.location) event.location = updates.location;
    if (updates.publishToMeetup !== undefined) event.publishToMeetup = updates.publishToMeetup;
    if (updates.publishToLinkedIn !== undefined) event.publishToLinkedIn = updates.publishToLinkedIn;
    
    event.updatedAt = new Date();

    // Update Meetup.com event if it exists
    if (event.meetupEventId && this.meetupClient && groupId) {
      try {
        const meetupUpdates: Partial<MeetupEvent> = {};
        if (updates.title) meetupUpdates.name = updates.title;
        if (updates.description) meetupUpdates.description = updates.description;
        if (updates.dateTime) meetupUpdates.time = updates.dateTime.getTime();
        if (updates.location) {
          meetupUpdates.venue = { name: updates.location };
        }

        if (Object.keys(meetupUpdates).length > 0) {
          meetupEvent = await this.meetupClient.updateEvent(groupId, event.meetupEventId, meetupUpdates);
        }
      } catch (error) {
        if (error instanceof MeetupApiError) {
          errors.push(`Failed to update Meetup.com event: ${error.message}`);
        } else {
          errors.push(`Failed to update Meetup.com event: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Update LinkedIn event if it exists
    if (event.linkedinEventId && this.linkedinClient) {
      try {
        const linkedinUpdates: Partial<LinkedInEvent> = {};
        if (updates.title) linkedinUpdates.name = updates.title;
        if (updates.description) linkedinUpdates.description = updates.description;
        if (updates.dateTime) linkedinUpdates.startDateTime = updates.dateTime.toISOString();
        if (updates.location) {
          linkedinUpdates.location = { name: updates.location };
        }

        if (Object.keys(linkedinUpdates).length > 0) {
          linkedinEvent = await this.linkedinClient.updateEvent(event.linkedinEventId, linkedinUpdates);
        }
      } catch (error) {
        if (error instanceof LinkedInApiError) {
          errors.push(`Failed to update LinkedIn event: ${error.message}`);
        } else {
          errors.push(`Failed to update LinkedIn event: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    return {
      event,
      meetupEvent,
      linkedinEvent,
      errors
    };
  }

  /**
   * Cancel an event
   */
  async cancelEvent(
    event: Event,
    groupId?: string
  ): Promise<{ event: Event; meetupEvent?: MeetupEvent; linkedinEvent?: LinkedInEvent; errors: string[] }> {
    const errors: string[] = [];
    let meetupEvent: MeetupEvent | undefined;
    let linkedinEvent: LinkedInEvent | undefined;

    // Update local event status
    event.platformStatus = 'cancelled';
    event.updatedAt = new Date();

    // Cancel Meetup.com event if it exists
    if (event.meetupEventId && this.meetupClient && groupId) {
      try {
        meetupEvent = await this.meetupClient.cancelEvent(groupId, event.meetupEventId);
        event.meetupEventStatus = 'cancelled';
      } catch (error) {
        if (error instanceof MeetupApiError) {
          errors.push(`Failed to cancel Meetup.com event: ${error.message}`);
        } else {
          errors.push(`Failed to cancel Meetup.com event: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Cancel LinkedIn event if it exists
    if (event.linkedinEventId && this.linkedinClient) {
      try {
        linkedinEvent = await this.linkedinClient.cancelEvent(event.linkedinEventId);
        event.linkedinEventStatus = 'cancelled';
      } catch (error) {
        if (error instanceof LinkedInApiError) {
          errors.push(`Failed to cancel LinkedIn event: ${error.message}`);
        } else {
          errors.push(`Failed to cancel LinkedIn event: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    return {
      event,
      meetupEvent,
      linkedinEvent,
      errors
    };
  }

  /**
   * Reject a draft event (cancel it and clean up associated posts/messages)
   * Only works on events with platformStatus === 'pending_confirmation'
   */
  async rejectEvent(
    event: Event,
    groupId?: string
  ): Promise<{ event: Event; meetupEvent?: MeetupEvent; linkedinEvent?: LinkedInEvent; errors: string[] }> {
    const errors: string[] = [];
    let meetupEvent: MeetupEvent | undefined;
    let linkedinEvent: LinkedInEvent | undefined;

    // Update local event status
    event.platformStatus = 'cancelled';
    event.updatedAt = new Date();

    // Cancel draft on Meetup.com if it exists
    if (event.meetupEventId && this.meetupClient && groupId) {
      try {
        meetupEvent = await this.meetupClient.cancelEvent(groupId, event.meetupEventId);
        event.meetupEventStatus = 'cancelled';
      } catch (error) {
        if (error instanceof MeetupApiError) {
          errors.push(`Failed to cancel Meetup.com draft event: ${error.message}`);
        } else {
          errors.push(`Failed to cancel Meetup.com draft event: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } else if (event.meetupEventId) {
      // Mark as cancelled locally even if we can't reach Meetup
      event.meetupEventStatus = 'cancelled';
    }

    // Cancel LinkedIn draft if it exists
    if (event.linkedinEventId && this.linkedinClient) {
      try {
        linkedinEvent = await this.linkedinClient.cancelEvent(event.linkedinEventId);
        event.linkedinEventStatus = 'cancelled';
      } catch (error) {
        if (error instanceof LinkedInApiError) {
          errors.push(`Failed to cancel LinkedIn draft event: ${error.message}`);
        } else {
          errors.push(`Failed to cancel LinkedIn draft event: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } else if (event.linkedinEventStatus === 'draft') {
      event.linkedinEventStatus = 'cancelled';
    }

    // Cancel all scheduled posts for this event
    try {
      await SocialMediaService.cancelPostsForEvent(event.eventId);
    } catch (error) {
      errors.push(`Failed to cancel scheduled posts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Cancel all scheduled messages for this event
    try {
      await MessagingService.cancelMessagesForEvent(event.eventId);
    } catch (error) {
      errors.push(`Failed to cancel scheduled messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Send rejection notification
    try {
      await NotificationService.sendNotification({
        userId: event.userId,
        type: 'info',
        title: 'Draft Event Rejected',
        message: `The draft event "${event.title}" has been rejected. All associated scheduled posts and messages have been cancelled.`,
        relatedEntityId: event.eventId,
        relatedEntityType: 'event'
      });
    } catch (error) {
      errors.push(`Failed to send rejection notification: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      event,
      meetupEvent,
      linkedinEvent,
      errors
    };
  }

  /**
   * Get group members who haven't RSVP'd to an event
   */
  async getNonRsvpMembers(groupId: string, eventId: string): Promise<string[]> {
    if (!this.meetupClient) {
      throw new Error('Meetup client not available');
    }

    try {
      const [members, attendees] = await Promise.all([
        this.meetupClient.getGroupMembers(groupId),
        this.meetupClient.getEventAttendees(groupId, eventId)
      ]);

      const attendeeIds = new Set(
        attendees
          .filter(a => a.rsvp.response === 'yes')
          .map(a => a.member.id)
      );

      return members
        .filter(member => member.status === 'active' && !attendeeIds.has(member.id))
        .map(member => member.id);
    } catch (error) {
      if (error instanceof MeetupApiError) {
        throw error;
      }
      throw new Error(`Failed to get non-RSVP members: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get event attendees
   */
  async getEventAttendees(groupId: string, eventId: string): Promise<string[]> {
    if (!this.meetupClient) {
      throw new Error('Meetup client not available');
    }

    try {
      const attendees = await this.meetupClient.getEventAttendees(groupId, eventId);
      return attendees
        .filter(a => a.rsvp.response === 'yes')
        .map(a => a.member.id);
    } catch (error) {
      if (error instanceof MeetupApiError) {
        throw error;
      }
      throw new Error(`Failed to get event attendees: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send message to recipients
   */
  async sendMessage(
    groupId: string,
    message: string,
    recipientType: 'attendees' | 'non_rsvp_members',
    eventId?: string
  ): Promise<{ messageId: string; recipientCount: number }> {
    if (!this.meetupClient) {
      throw new Error('Meetup client not available');
    }

    try {
      return await this.meetupClient.sendMessage(groupId, message, recipientType, eventId);
    } catch (error) {
      if (error instanceof MeetupApiError) {
        throw error;
      }
      throw new Error(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check LinkedIn permissions for the user
   */
  async checkLinkedInPermissions(): Promise<{ hasPermissions: boolean; organizations: any[] }> {
    if (!this.linkedinClient) {
      return { hasPermissions: false, organizations: [] };
    }

    try {
      const organizations = await this.linkedinClient.getOrganizations();
      const hasPermissions = organizations.some(org => org.canCreateEvents || org.canCreatePosts);
      
      return {
        hasPermissions,
        organizations: organizations.filter(org => org.canCreateEvents || org.canCreatePosts)
      };
    } catch (error) {
      if (error instanceof LinkedInApiError) {
        throw error;
      }
      throw new Error(`Failed to check LinkedIn permissions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a social media post on LinkedIn
   */
  async createSocialPost(
    content: string,
    organizationId?: string,
    scheduledTime?: Date
  ): Promise<{ postId: string; status: string }> {
    if (!this.linkedinClient) {
      throw new Error('LinkedIn client not available');
    }

    try {
      const postData = {
        content,
        visibility: 'public' as const,
        organizationId,
        scheduledTime: scheduledTime?.toISOString()
      };

      let result;
      if (scheduledTime) {
        result = await this.linkedinClient.schedulePost(postData);
      } else {
        result = await this.linkedinClient.createPost(postData);
      }

      return {
        postId: result.id || '',
        status: result.status || 'published'
      };
    } catch (error) {
      if (error instanceof LinkedInApiError) {
        throw error;
      }
      throw new Error(`Failed to create social post: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}