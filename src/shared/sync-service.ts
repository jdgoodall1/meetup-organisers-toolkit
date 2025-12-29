// Event synchronization service for polling and importing events from external platforms

import { Event, UserProfile, SyncRecord, SyncConflict } from './types';
import { EventModel, SyncRecordModel, SyncConflictModel } from './models';
import { MeetupClient, MeetupEvent, MeetupApiError } from './meetup-client';
import { LinkedInClient, LinkedInEvent, LinkedInApiError } from './linkedin-client';
import { generateId } from './utils';

export interface SyncResult {
  syncRecord: SyncRecord;
  eventsImported: Event[];
  eventsUpdated: Event[];
  conflictsDetected: SyncConflict[];
  errors: string[];
}

export interface ConflictResolution {
  conflictId: string;
  resolution: 'local' | 'external';
}

export class SyncService {
  constructor(
    private meetupClient?: MeetupClient,
    private linkedinClient?: LinkedInClient
  ) {}

  /**
   * Synchronize events from Meetup.com for a user
   */
  async syncMeetupEvents(userId: string, userProfile: UserProfile): Promise<SyncResult> {
    const errors: string[] = [];
    const eventsImported: Event[] = [];
    const eventsUpdated: Event[] = [];
    const conflictsDetected: SyncConflict[] = [];

    // Create sync record
    const syncRecord = SyncRecordModel.create({
      userId,
      platform: 'meetup',
      lastSyncTime: new Date(),
      status: 'in_progress'
    });

    if (!this.meetupClient) {
      syncRecord.status = 'failed';
      syncRecord.errorMessage = 'Meetup client not available';
      errors.push('Meetup client not available');
      return {
        syncRecord,
        eventsImported,
        eventsUpdated,
        conflictsDetected,
        errors
      };
    }

    try {
      // Get user's managed groups
      const managedGroups = await this.meetupClient.getManagedGroups();
      
      // Get existing local events for this user
      const existingEvents = await EventModel.getByUserId(userId);
      const existingEventsByMeetupId = new Map(
        existingEvents
          .filter(e => e.meetupEventId)
          .map(e => [e.meetupEventId!, e])
      );

      // Sync events from each managed group
      for (const group of managedGroups) {
        try {
          // Get all events from this group (including drafts)
          const groupEvents = await this.meetupClient.getGroupEvents(group.id);
          
          for (const meetupEvent of groupEvents) {
            if (!meetupEvent.id) continue;

            const existingEvent = existingEventsByMeetupId.get(meetupEvent.id);
            
            if (existingEvent) {
              // Check for conflicts and update existing event
              const conflicts = this.detectConflicts(existingEvent, meetupEvent);
              conflictsDetected.push(...conflicts);

              // Update event with external data (external platform priority)
              const updatedEvent = this.updateEventFromMeetup(existingEvent, meetupEvent);
              await EventModel.update(updatedEvent);
              eventsUpdated.push(updatedEvent);
            } else {
              // Import new event
              const importedEvent = this.createEventFromMeetup(userId, meetupEvent, group.id);
              await EventModel.create(importedEvent);
              eventsImported.push(importedEvent);
            }
          }
        } catch (error) {
          if (error instanceof MeetupApiError) {
            errors.push(`Failed to sync group ${group.name}: ${error.message}`);
          } else {
            errors.push(`Failed to sync group ${group.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }

      // Update sync record with results
      syncRecord.status = errors.length > 0 ? 'failed' : 'success';
      syncRecord.eventsImported = eventsImported.length;
      syncRecord.eventsUpdated = eventsUpdated.length;
      syncRecord.conflictsDetected = conflictsDetected.length;
      if (errors.length > 0) {
        syncRecord.errorMessage = errors.join('; ');
      }

    } catch (error) {
      syncRecord.status = 'failed';
      if (error instanceof MeetupApiError) {
        syncRecord.errorMessage = `Meetup API error: ${error.message}`;
        errors.push(`Meetup API error: ${error.message}`);
      } else {
        syncRecord.errorMessage = `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      syncRecord,
      eventsImported,
      eventsUpdated,
      conflictsDetected,
      errors
    };
  }

  /**
   * Synchronize events from LinkedIn for a user
   */
  async syncLinkedInEvents(userId: string, userProfile: UserProfile): Promise<SyncResult> {
    const errors: string[] = [];
    const eventsImported: Event[] = [];
    const eventsUpdated: Event[] = [];
    const conflictsDetected: SyncConflict[] = [];

    // Create sync record
    const syncRecord = SyncRecordModel.create({
      userId,
      platform: 'linkedin',
      lastSyncTime: new Date(),
      status: 'in_progress'
    });

    if (!this.linkedinClient) {
      syncRecord.status = 'failed';
      syncRecord.errorMessage = 'LinkedIn client not available';
      errors.push('LinkedIn client not available');
      return {
        syncRecord,
        eventsImported,
        eventsUpdated,
        conflictsDetected,
        errors
      };
    }

    try {
      // Get user's organizations
      const organizations = await this.linkedinClient.getOrganizations();
      
      // Get existing local events for this user
      const existingEvents = await EventModel.getByUserId(userId);
      const existingEventsByLinkedInId = new Map(
        existingEvents
          .filter(e => e.linkedinEventId)
          .map(e => [e.linkedinEventId!, e])
      );

      // Sync events from each organization
      for (const org of organizations) {
        if (!org.canCreateEvents) continue;

        try {
          // Get events from this organization
          const orgEvents = await this.linkedinClient.getOrganizationEvents(org.id);
          
          for (const linkedinEvent of orgEvents) {
            if (!linkedinEvent.id) continue;

            const existingEvent = existingEventsByLinkedInId.get(linkedinEvent.id);
            
            if (existingEvent) {
              // Check for conflicts and update existing event
              const conflicts = this.detectLinkedInConflicts(existingEvent, linkedinEvent);
              conflictsDetected.push(...conflicts);

              // Update event with external data (external platform priority)
              const updatedEvent = this.updateEventFromLinkedIn(existingEvent, linkedinEvent);
              await EventModel.update(updatedEvent);
              eventsUpdated.push(updatedEvent);
            } else {
              // Import new event
              const importedEvent = this.createEventFromLinkedIn(userId, linkedinEvent, org.id);
              await EventModel.create(importedEvent);
              eventsImported.push(importedEvent);
            }
          }
        } catch (error) {
          if (error instanceof LinkedInApiError) {
            errors.push(`Failed to sync organization ${org.name}: ${error.message}`);
          } else {
            errors.push(`Failed to sync organization ${org.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }

      // Update sync record with results
      syncRecord.status = errors.length > 0 ? 'failed' : 'success';
      syncRecord.eventsImported = eventsImported.length;
      syncRecord.eventsUpdated = eventsUpdated.length;
      syncRecord.conflictsDetected = conflictsDetected.length;
      if (errors.length > 0) {
        syncRecord.errorMessage = errors.join('; ');
      }

    } catch (error) {
      syncRecord.status = 'failed';
      if (error instanceof LinkedInApiError) {
        syncRecord.errorMessage = `LinkedIn API error: ${error.message}`;
        errors.push(`LinkedIn API error: ${error.message}`);
      } else {
        syncRecord.errorMessage = `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      syncRecord,
      eventsImported,
      eventsUpdated,
      conflictsDetected,
      errors
    };
  }

  /**
   * Detect conflicts between local and Meetup.com event data
   */
  private detectConflicts(localEvent: Event, meetupEvent: MeetupEvent): SyncConflict[] {
    const conflicts: SyncConflict[] = [];

    // Check title mismatch
    if (localEvent.title !== meetupEvent.name) {
      conflicts.push(SyncConflictModel.create({
        eventId: localEvent.eventId,
        userId: localEvent.userId,
        platform: 'meetup',
        conflictType: 'title_mismatch',
        localValue: localEvent.title,
        externalValue: meetupEvent.name || ''
      }));
    }

    // Check description mismatch
    if (localEvent.description !== meetupEvent.description) {
      conflicts.push(SyncConflictModel.create({
        eventId: localEvent.eventId,
        userId: localEvent.userId,
        platform: 'meetup',
        conflictType: 'description_mismatch',
        localValue: localEvent.description,
        externalValue: meetupEvent.description || ''
      }));
    }

    // Check date mismatch
    if (meetupEvent.time && localEvent.dateTime.getTime() !== meetupEvent.time) {
      conflicts.push(SyncConflictModel.create({
        eventId: localEvent.eventId,
        userId: localEvent.userId,
        platform: 'meetup',
        conflictType: 'date_mismatch',
        localValue: localEvent.dateTime.toISOString(),
        externalValue: new Date(meetupEvent.time).toISOString()
      }));
    }

    // Check status mismatch
    if (localEvent.meetupEventStatus !== meetupEvent.status) {
      conflicts.push(SyncConflictModel.create({
        eventId: localEvent.eventId,
        userId: localEvent.userId,
        platform: 'meetup',
        conflictType: 'status_mismatch',
        localValue: localEvent.meetupEventStatus,
        externalValue: meetupEvent.status || ''
      }));
    }

    return conflicts;
  }

  /**
   * Detect conflicts between local and LinkedIn event data
   */
  private detectLinkedInConflicts(localEvent: Event, linkedinEvent: LinkedInEvent): SyncConflict[] {
    const conflicts: SyncConflict[] = [];

    // Check title mismatch
    if (localEvent.title !== linkedinEvent.name) {
      conflicts.push(SyncConflictModel.create({
        eventId: localEvent.eventId,
        userId: localEvent.userId,
        platform: 'linkedin',
        conflictType: 'title_mismatch',
        localValue: localEvent.title,
        externalValue: linkedinEvent.name || ''
      }));
    }

    // Check description mismatch
    if (localEvent.description !== linkedinEvent.description) {
      conflicts.push(SyncConflictModel.create({
        eventId: localEvent.eventId,
        userId: localEvent.userId,
        platform: 'linkedin',
        conflictType: 'description_mismatch',
        localValue: localEvent.description,
        externalValue: linkedinEvent.description || ''
      }));
    }

    // Check date mismatch
    if (linkedinEvent.startDateTime) {
      const linkedinDate = new Date(linkedinEvent.startDateTime);
      if (localEvent.dateTime.getTime() !== linkedinDate.getTime()) {
        conflicts.push(SyncConflictModel.create({
          eventId: localEvent.eventId,
          userId: localEvent.userId,
          platform: 'linkedin',
          conflictType: 'date_mismatch',
          localValue: localEvent.dateTime.toISOString(),
          externalValue: linkedinDate.toISOString()
        }));
      }
    }

    // Check status mismatch
    if (localEvent.linkedinEventStatus !== linkedinEvent.status) {
      conflicts.push(SyncConflictModel.create({
        eventId: localEvent.eventId,
        userId: localEvent.userId,
        platform: 'linkedin',
        conflictType: 'status_mismatch',
        localValue: localEvent.linkedinEventStatus || '',
        externalValue: linkedinEvent.status || ''
      }));
    }

    return conflicts;
  }

  /**
   * Update local event with Meetup.com data (external platform priority)
   */
  private updateEventFromMeetup(localEvent: Event, meetupEvent: MeetupEvent): Event {
    const updatedEvent = { ...localEvent };
    
    // Update with external data (external platform priority)
    if (meetupEvent.name) {
      updatedEvent.title = meetupEvent.name;
    }
    if (meetupEvent.description) {
      updatedEvent.description = meetupEvent.description;
    }
    if (meetupEvent.time) {
      updatedEvent.dateTime = new Date(meetupEvent.time);
    }
    if (meetupEvent.venue?.name) {
      updatedEvent.location = meetupEvent.venue.name;
    }
    if (meetupEvent.status) {
      updatedEvent.meetupEventStatus = meetupEvent.status;
      
      // Update platform status based on external status
      if (meetupEvent.status === 'published' && updatedEvent.platformStatus === 'pending_confirmation') {
        updatedEvent.platformStatus = 'confirmed';
      } else if (meetupEvent.status === 'cancelled') {
        updatedEvent.platformStatus = 'cancelled';
      }
    }

    updatedEvent.lastSyncTime = new Date();
    updatedEvent.externallyModified = true;
    updatedEvent.updatedAt = new Date();

    return updatedEvent;
  }

  /**
   * Update local event with LinkedIn data (external platform priority)
   */
  private updateEventFromLinkedIn(localEvent: Event, linkedinEvent: LinkedInEvent): Event {
    const updatedEvent = { ...localEvent };
    
    // Update with external data (external platform priority)
    if (linkedinEvent.name) {
      updatedEvent.title = linkedinEvent.name;
    }
    if (linkedinEvent.description) {
      updatedEvent.description = linkedinEvent.description;
    }
    if (linkedinEvent.startDateTime) {
      updatedEvent.dateTime = new Date(linkedinEvent.startDateTime);
    }
    if (linkedinEvent.location?.name) {
      updatedEvent.location = linkedinEvent.location.name;
    }
    if (linkedinEvent.status) {
      updatedEvent.linkedinEventStatus = linkedinEvent.status;
      
      // Update platform status based on external status
      if (linkedinEvent.status === 'published' && updatedEvent.platformStatus === 'pending_confirmation') {
        updatedEvent.platformStatus = 'confirmed';
      } else if (linkedinEvent.status === 'cancelled') {
        updatedEvent.platformStatus = 'cancelled';
      }
    }

    updatedEvent.lastSyncTime = new Date();
    updatedEvent.externallyModified = true;
    updatedEvent.updatedAt = new Date();

    return updatedEvent;
  }

  /**
   * Create local event from Meetup.com event data
   */
  private createEventFromMeetup(userId: string, meetupEvent: MeetupEvent, groupId: string): Event {
    const now = new Date();
    
    return EventModel.createNew({
      userId,
      title: meetupEvent.name || 'Imported Event',
      description: meetupEvent.description || '',
      dateTime: meetupEvent.time ? new Date(meetupEvent.time) : now,
      location: meetupEvent.venue?.name || 'TBD',
      meetupEventId: meetupEvent.id,
      meetupEventStatus: meetupEvent.status || 'published',
      platformStatus: meetupEvent.status === 'draft' ? 'pending_confirmation' : 'confirmed',
      source: 'meetup_import',
      publishToMeetup: true,
      publishToLinkedIn: false,
      requiresConfirmation: meetupEvent.status === 'draft',
      socialPostsScheduled: false,
      messagesScheduled: false,
      externallyModified: false
    });
  }

  /**
   * Create local event from LinkedIn event data
   */
  private createEventFromLinkedIn(userId: string, linkedinEvent: LinkedInEvent, organizationId: string): Event {
    const now = new Date();
    
    return EventModel.createNew({
      userId,
      title: linkedinEvent.name || 'Imported Event',
      description: linkedinEvent.description || '',
      dateTime: linkedinEvent.startDateTime ? new Date(linkedinEvent.startDateTime) : now,
      location: linkedinEvent.location?.name || 'TBD',
      linkedinEventId: linkedinEvent.id,
      linkedinEventStatus: linkedinEvent.status || 'published',
      platformStatus: linkedinEvent.status === 'draft' ? 'pending_confirmation' : 'confirmed',
      source: 'linkedin_import',
      publishToMeetup: false,
      publishToLinkedIn: true,
      requiresConfirmation: linkedinEvent.status === 'draft',
      socialPostsScheduled: false,
      messagesScheduled: false,
      externallyModified: false
    });
  }

  /**
   * Resolve synchronization conflicts
   */
  async resolveConflicts(resolutions: ConflictResolution[]): Promise<{ resolved: SyncConflict[]; errors: string[] }> {
    const resolved: SyncConflict[] = [];
    const errors: string[] = [];

    for (const resolution of resolutions) {
      try {
        // In a real implementation, you would fetch the conflict from the database
        // For now, we'll create a mock resolved conflict
        const resolvedConflict: SyncConflict = {
          conflictId: resolution.conflictId,
          eventId: 'mock-event-id',
          userId: 'mock-user-id',
          platform: 'meetup',
          conflictType: 'title_mismatch',
          localValue: 'Local Title',
          externalValue: 'External Title',
          status: resolution.resolution === 'local' ? 'resolved_local' : 'resolved_external',
          createdAt: new Date(),
          resolvedAt: new Date()
        };

        resolved.push(resolvedConflict);
      } catch (error) {
        errors.push(`Failed to resolve conflict ${resolution.conflictId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { resolved, errors };
  }

  /**
   * Perform periodic synchronization for a user
   */
  async performPeriodicSync(userId: string, userProfile: UserProfile): Promise<{
    meetupSync?: SyncResult;
    linkedinSync?: SyncResult;
    errors: string[];
  }> {
    const errors: string[] = [];
    let meetupSync: SyncResult | undefined;
    let linkedinSync: SyncResult | undefined;

    // Sync Meetup.com events if credentials are available
    if (userProfile.meetupCredentials && this.meetupClient) {
      try {
        meetupSync = await this.syncMeetupEvents(userId, userProfile);
        errors.push(...meetupSync.errors);
      } catch (error) {
        errors.push(`Meetup sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Sync LinkedIn events if credentials are available
    if (userProfile.linkedinCredentials && this.linkedinClient) {
      try {
        linkedinSync = await this.syncLinkedInEvents(userId, userProfile);
        errors.push(...linkedinSync.errors);
      } catch (error) {
        errors.push(`LinkedIn sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      meetupSync,
      linkedinSync,
      errors
    };
  }

  /**
   * Check if an event was published externally (for draft detection)
   */
  async checkExternalPublication(event: Event, groupId?: string): Promise<{
    wasPublished: boolean;
    updatedEvent?: Event;
    error?: string;
  }> {
    try {
      // Check Meetup.com publication status
      if (event.meetupEventId && event.meetupEventStatus === 'draft' && this.meetupClient && groupId) {
        const meetupEvent = await this.meetupClient.getEvent(groupId, event.meetupEventId);
        
        if (meetupEvent.status === 'published') {
          // Event was published externally
          const updatedEvent = this.updateEventFromMeetup(event, meetupEvent);
          return {
            wasPublished: true,
            updatedEvent
          };
        }
      }

      // Check LinkedIn publication status
      if (event.linkedinEventId && event.linkedinEventStatus === 'draft' && this.linkedinClient) {
        const linkedinEvent = await this.linkedinClient.getEvent(event.linkedinEventId);
        
        if (linkedinEvent.status === 'published') {
          // Event was published externally
          const updatedEvent = this.updateEventFromLinkedIn(event, linkedinEvent);
          return {
            wasPublished: true,
            updatedEvent
          };
        }
      }

      return { wasPublished: false };

    } catch (error) {
      return {
        wasPublished: false,
        error: `Failed to check external publication: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}