// Data model validation and serialization utilities

import {
  UserProfile,
  Event,
  ScheduledPost,
  Message,
  SyncRecord,
  SyncConflict,
  Notification,
  NotificationSettings,
  EncryptedCredentials
} from './types';
import { generateId, parseDate, formatDateForStorage, isValidEmail, sanitizeString, isFutureDate } from './utils';
import { dynamoDocClient } from './aws-clients';
import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { config } from './config';

// Validation errors
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// UserProfile validation and serialization
export class UserProfileModel {
  static validate(data: Partial<UserProfile>): void {
    if (!data.userId || typeof data.userId !== 'string') {
      throw new ValidationError('User ID is required and must be a string', 'userId');
    }

    if (!data.email || !isValidEmail(data.email)) {
      throw new ValidationError('Valid email is required', 'email');
    }

    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      throw new ValidationError('Name is required and must be a non-empty string', 'name');
    }

    if (data.notificationPreferences) {
      this.validateNotificationSettings(data.notificationPreferences);
    }

    if (data.meetupCredentials) {
      this.validateEncryptedCredentials(data.meetupCredentials);
    }

    if (data.linkedinCredentials) {
      this.validateEncryptedCredentials(data.linkedinCredentials);
    }
  }

  private static validateNotificationSettings(settings: NotificationSettings): void {
    const requiredBooleanFields = ['email', 'inApp', 'successNotifications', 'errorNotifications', 'reminderNotifications'];
    
    for (const field of requiredBooleanFields) {
      if (typeof settings[field as keyof NotificationSettings] !== 'boolean') {
        throw new ValidationError(`${field} must be a boolean`, field);
      }
    }
  }

  private static validateEncryptedCredentials(credentials: EncryptedCredentials): void {
    if (!credentials.accessToken || typeof credentials.accessToken !== 'string') {
      throw new ValidationError('Access token is required', 'accessToken');
    }

    if (!credentials.encryptedData || typeof credentials.encryptedData !== 'string') {
      throw new ValidationError('Encrypted data is required', 'encryptedData');
    }

    if (credentials.expiresAt && !(credentials.expiresAt instanceof Date)) {
      throw new ValidationError('Expires at must be a Date object', 'expiresAt');
    }
  }

  static create(data: Pick<UserProfile, 'email' | 'name' | 'notificationPreferences'> & Partial<Omit<UserProfile, 'userId' | 'createdAt' | 'updatedAt' | 'lastSyncTime' | 'email' | 'name' | 'notificationPreferences'>>): UserProfile {
    const now = new Date();
    const userProfile: UserProfile = {
      userId: generateId(),
      email: sanitizeString(data.email),
      name: sanitizeString(data.name),
      meetupCredentials: data.meetupCredentials,
      linkedinCredentials: data.linkedinCredentials,
      notificationPreferences: data.notificationPreferences,
      manualConfirmationEnabled: data.manualConfirmationEnabled || false,
      lastSyncTime: now,
      createdAt: now,
      updatedAt: now
    };

    this.validate(userProfile);
    return userProfile;
  }

  static serialize(userProfile: UserProfile): Record<string, any> {
    return {
      ...userProfile,
      lastSyncTime: formatDateForStorage(userProfile.lastSyncTime),
      createdAt: formatDateForStorage(userProfile.createdAt),
      updatedAt: formatDateForStorage(userProfile.updatedAt)
    };
  }

  static deserialize(data: Record<string, any>): UserProfile {
    return {
      ...data,
      lastSyncTime: parseDate(data.lastSyncTime),
      createdAt: parseDate(data.createdAt),
      updatedAt: parseDate(data.updatedAt)
    } as UserProfile;
  }
}

// Event validation and serialization
export class EventModel {
  static validate(data: Partial<Event>): void {
    if (!data.eventId || typeof data.eventId !== 'string') {
      throw new ValidationError('Event ID is required and must be a string', 'eventId');
    }

    if (!data.userId || typeof data.userId !== 'string') {
      throw new ValidationError('User ID is required and must be a string', 'userId');
    }

    if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
      throw new ValidationError('Title is required and must be a non-empty string', 'title');
    }

    if (!data.description || typeof data.description !== 'string') {
      throw new ValidationError('Description is required and must be a string', 'description');
    }

    if (!data.dateTime || !(data.dateTime instanceof Date)) {
      throw new ValidationError('Date time is required and must be a Date object', 'dateTime');
    }

    if (!isFutureDate(data.dateTime)) {
      throw new ValidationError('Event date must be in the future', 'dateTime');
    }

    if (!data.location || typeof data.location !== 'string' || data.location.trim().length === 0) {
      throw new ValidationError('Location is required and must be a non-empty string', 'location');
    }

    const validMeetupStatuses = ['draft', 'published', 'cancelled'];
    if (!validMeetupStatuses.includes(data.meetupEventStatus as string)) {
      throw new ValidationError('Invalid meetup event status', 'meetupEventStatus');
    }

    if (data.linkedinEventStatus) {
      const validLinkedinStatuses = ['draft', 'published', 'cancelled'];
      if (!validLinkedinStatuses.includes(data.linkedinEventStatus)) {
        throw new ValidationError('Invalid LinkedIn event status', 'linkedinEventStatus');
      }
    }

    const validPlatformStatuses = ['pending_confirmation', 'confirmed', 'cancelled'];
    if (!validPlatformStatuses.includes(data.platformStatus as string)) {
      throw new ValidationError('Invalid platform status', 'platformStatus');
    }

    const validSources = ['platform', 'meetup_import', 'linkedin_import'];
    if (!validSources.includes(data.source as string)) {
      throw new ValidationError('Invalid source', 'source');
    }
  }

  static deserialize(data: Record<string, any>): Event {
    return {
      ...data,
      dateTime: parseDate(data.dateTime),
      lastSyncTime: parseDate(data.lastSyncTime),
      createdAt: parseDate(data.createdAt),
      updatedAt: parseDate(data.updatedAt)
    } as Event;
  }

  static serialize(event: Event): Record<string, any> {
    return {
      ...event,
      dateTime: formatDateForStorage(event.dateTime),
      lastSyncTime: formatDateForStorage(event.lastSyncTime),
      createdAt: formatDateForStorage(event.createdAt),
      updatedAt: formatDateForStorage(event.updatedAt)
    };
  }

  // Database operations
  static async create(event: Event): Promise<Event> {
    const serializedEvent = this.serialize(event);
    
    await dynamoDocClient.send(new PutCommand({
      TableName: config.tables.events,
      Item: {
        PK: `USER#${event.userId}`,
        SK: `EVENT#${event.eventId}`,
        ...serializedEvent
      }
    }));

    return event;
  }

  static async get(userId: string, eventId: string): Promise<Event | null> {
    const result = await dynamoDocClient.send(new GetCommand({
      TableName: config.tables.events,
      Key: {
        PK: `USER#${userId}`,
        SK: `EVENT#${eventId}`
      }
    }));

    if (!result.Item) {
      return null;
    }

    const { PK, SK, ...eventData } = result.Item;
    return this.deserialize(eventData);
  }

  static async update(event: Event): Promise<Event> {
    event.updatedAt = new Date();
    const serializedEvent = this.serialize(event);
    
    await dynamoDocClient.send(new PutCommand({
      TableName: config.tables.events,
      Item: {
        PK: `USER#${event.userId}`,
        SK: `EVENT#${event.eventId}`,
        ...serializedEvent
      }
    }));

    return event;
  }

  static async delete(userId: string, eventId: string): Promise<void> {
    await dynamoDocClient.send(new DeleteCommand({
      TableName: config.tables.events,
      Key: {
        PK: `USER#${userId}`,
        SK: `EVENT#${eventId}`
      }
    }));
  }

  static async getByUserId(userId: string): Promise<Event[]> {
    const result = await dynamoDocClient.send(new QueryCommand({
      TableName: config.tables.events,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'EVENT#'
      }
    }));

    if (!result.Items) {
      return [];
    }

    return result.Items.map(item => {
      const { PK, SK, ...eventData } = item;
      return this.deserialize(eventData);
    });
  }

  // Factory method for creating new events
  static createNew(data: Pick<Event, 'userId' | 'title' | 'description' | 'dateTime' | 'location'> & Partial<Omit<Event, 'eventId' | 'createdAt' | 'updatedAt' | 'lastSyncTime' | 'userId' | 'title' | 'description' | 'dateTime' | 'location'>>): Event {
    const now = new Date();
    const event: Event = {
      eventId: generateId(),
      userId: data.userId,
      title: sanitizeString(data.title),
      description: sanitizeString(data.description),
      dateTime: data.dateTime,
      location: sanitizeString(data.location),
      meetupEventId: data.meetupEventId,
      meetupEventStatus: data.meetupEventStatus || 'draft',
      linkedinEventId: data.linkedinEventId,
      linkedinEventStatus: data.linkedinEventStatus,
      platformStatus: data.platformStatus || 'pending_confirmation',
      source: data.source || 'platform',
      requiresConfirmation: data.requiresConfirmation ?? false,
      publishToMeetup: data.publishToMeetup ?? true,
      publishToLinkedIn: data.publishToLinkedIn ?? false,
      socialPostsScheduled: data.socialPostsScheduled ?? false,
      messagesScheduled: data.messagesScheduled ?? false,
      lastSyncTime: now,
      externallyModified: data.externallyModified ?? false,
      createdAt: now,
      updatedAt: now
    };

    this.validate(event);
    return event;
  }
}

// ScheduledPost validation and serialization
export class ScheduledPostModel {
  static validate(data: Partial<ScheduledPost>): void {
    if (!data.postId || typeof data.postId !== 'string') {
      throw new ValidationError('Post ID is required and must be a string', 'postId');
    }

    if (!data.eventId || typeof data.eventId !== 'string') {
      throw new ValidationError('Event ID is required and must be a string', 'eventId');
    }

    if (!data.userId || typeof data.userId !== 'string') {
      throw new ValidationError('User ID is required and must be a string', 'userId');
    }

    if (data.platform !== 'linkedin') {
      throw new ValidationError('Platform must be linkedin', 'platform');
    }

    if (!data.content || typeof data.content !== 'string' || data.content.trim().length === 0) {
      throw new ValidationError('Content is required and must be a non-empty string', 'content');
    }

    if (!data.scheduledTime || !(data.scheduledTime instanceof Date)) {
      throw new ValidationError('Scheduled time is required and must be a Date object', 'scheduledTime');
    }

    const validStatuses = ['pending', 'pending_confirmation', 'published', 'failed', 'cancelled'];
    if (!validStatuses.includes(data.status as string)) {
      throw new ValidationError('Invalid status', 'status');
    }
  }

  static create(data: Pick<ScheduledPost, 'eventId' | 'userId' | 'platform' | 'content' | 'scheduledTime'> & Partial<Omit<ScheduledPost, 'postId' | 'createdAt' | 'eventId' | 'userId' | 'platform' | 'content' | 'scheduledTime'>>): ScheduledPost {
    const scheduledPost: ScheduledPost = {
      postId: generateId(),
      eventId: data.eventId,
      userId: data.userId,
      platform: data.platform,
      content: sanitizeString(data.content),
      scheduledTime: data.scheduledTime,
      status: data.status || 'pending',
      externalPostId: data.externalPostId,
      errorMessage: data.errorMessage,
      requiresConfirmation: data.requiresConfirmation || false,
      createdAt: new Date()
    };

    this.validate(scheduledPost);
    return scheduledPost;
  }

  static serialize(post: ScheduledPost): Record<string, any> {
    return {
      ...post,
      scheduledTime: formatDateForStorage(post.scheduledTime),
      createdAt: formatDateForStorage(post.createdAt)
    };
  }

  static deserialize(data: Record<string, any>): ScheduledPost {
    return {
      ...data,
      scheduledTime: parseDate(data.scheduledTime),
      createdAt: parseDate(data.createdAt)
    } as ScheduledPost;
  }
}

// Message validation and serialization
export class MessageModel {
  static validate(data: Partial<Message>): void {
    if (!data.messageId || typeof data.messageId !== 'string') {
      throw new ValidationError('Message ID is required and must be a string', 'messageId');
    }

    if (!data.eventId || typeof data.eventId !== 'string') {
      throw new ValidationError('Event ID is required and must be a string', 'eventId');
    }

    if (!data.userId || typeof data.userId !== 'string') {
      throw new ValidationError('User ID is required and must be a string', 'userId');
    }

    const validRecipientTypes = ['attendees', 'non_rsvp_members'];
    if (!validRecipientTypes.includes(data.recipientType as string)) {
      throw new ValidationError('Invalid recipient type', 'recipientType');
    }

    if (!data.content || typeof data.content !== 'string' || data.content.trim().length === 0) {
      throw new ValidationError('Content is required and must be a non-empty string', 'content');
    }

    if (!data.scheduledTime || !(data.scheduledTime instanceof Date)) {
      throw new ValidationError('Scheduled time is required and must be a Date object', 'scheduledTime');
    }

    const validStatuses = ['pending', 'pending_confirmation', 'sent', 'failed', 'cancelled'];
    if (!validStatuses.includes(data.status as string)) {
      throw new ValidationError('Invalid status', 'status');
    }

    if (typeof data.recipientCount !== 'number' || data.recipientCount < 0) {
      throw new ValidationError('Recipient count must be a non-negative number', 'recipientCount');
    }

    if (typeof data.sentCount !== 'number' || data.sentCount < 0) {
      throw new ValidationError('Sent count must be a non-negative number', 'sentCount');
    }

    if (data.sentCount > data.recipientCount) {
      throw new ValidationError('Sent count cannot exceed recipient count', 'sentCount');
    }
  }

  static create(data: Pick<Message, 'eventId' | 'userId' | 'recipientType' | 'content' | 'scheduledTime'> & Partial<Omit<Message, 'messageId' | 'createdAt' | 'eventId' | 'userId' | 'recipientType' | 'content' | 'scheduledTime'>>): Message {
    const message: Message = {
      messageId: generateId(),
      eventId: data.eventId,
      userId: data.userId,
      recipientType: data.recipientType,
      content: sanitizeString(data.content),
      scheduledTime: data.scheduledTime,
      status: data.status || 'pending',
      recipientCount: data.recipientCount || 0,
      sentCount: data.sentCount || 0,
      errorMessage: data.errorMessage,
      requiresConfirmation: data.requiresConfirmation || false,
      createdAt: new Date()
    };

    this.validate(message);
    return message;
  }

  static serialize(message: Message): Record<string, any> {
    return {
      ...message,
      scheduledTime: formatDateForStorage(message.scheduledTime),
      createdAt: formatDateForStorage(message.createdAt)
    };
  }

  static deserialize(data: Record<string, any>): Message {
    return {
      ...data,
      scheduledTime: parseDate(data.scheduledTime),
      createdAt: parseDate(data.createdAt)
    } as Message;
  }
}

// SyncRecord validation and serialization
export class SyncRecordModel {
  static validate(data: Partial<SyncRecord>): void {
    if (!data.syncId || typeof data.syncId !== 'string') {
      throw new ValidationError('Sync ID is required and must be a string', 'syncId');
    }

    if (!data.userId || typeof data.userId !== 'string') {
      throw new ValidationError('User ID is required and must be a string', 'userId');
    }

    const validPlatforms = ['meetup', 'linkedin'];
    if (!validPlatforms.includes(data.platform as string)) {
      throw new ValidationError('Invalid platform', 'platform');
    }

    if (!data.lastSyncTime || !(data.lastSyncTime instanceof Date)) {
      throw new ValidationError('Last sync time is required and must be a Date object', 'lastSyncTime');
    }

    const validStatuses = ['success', 'failed', 'in_progress'];
    if (!validStatuses.includes(data.status as string)) {
      throw new ValidationError('Invalid status', 'status');
    }

    if (typeof data.eventsImported !== 'number' || data.eventsImported < 0) {
      throw new ValidationError('Events imported must be a non-negative number', 'eventsImported');
    }

    if (typeof data.eventsUpdated !== 'number' || data.eventsUpdated < 0) {
      throw new ValidationError('Events updated must be a non-negative number', 'eventsUpdated');
    }

    if (typeof data.conflictsDetected !== 'number' || data.conflictsDetected < 0) {
      throw new ValidationError('Conflicts detected must be a non-negative number', 'conflictsDetected');
    }
  }

  static create(data: Pick<SyncRecord, 'userId' | 'platform' | 'lastSyncTime' | 'status'> & Partial<Omit<SyncRecord, 'syncId' | 'createdAt' | 'userId' | 'platform' | 'lastSyncTime' | 'status'>>): SyncRecord {
    const syncRecord: SyncRecord = {
      syncId: generateId(),
      userId: data.userId,
      platform: data.platform,
      lastSyncTime: data.lastSyncTime,
      status: data.status,
      eventsImported: data.eventsImported || 0,
      eventsUpdated: data.eventsUpdated || 0,
      conflictsDetected: data.conflictsDetected || 0,
      errorMessage: data.errorMessage,
      createdAt: new Date()
    };

    this.validate(syncRecord);
    return syncRecord;
  }

  static serialize(syncRecord: SyncRecord): Record<string, any> {
    return {
      ...syncRecord,
      lastSyncTime: formatDateForStorage(syncRecord.lastSyncTime),
      createdAt: formatDateForStorage(syncRecord.createdAt)
    };
  }

  static deserialize(data: Record<string, any>): SyncRecord {
    return {
      ...data,
      lastSyncTime: parseDate(data.lastSyncTime),
      createdAt: parseDate(data.createdAt)
    } as SyncRecord;
  }
}

// SyncConflict validation and serialization
export class SyncConflictModel {
  static validate(data: Partial<SyncConflict>): void {
    if (!data.conflictId || typeof data.conflictId !== 'string') {
      throw new ValidationError('Conflict ID is required and must be a string', 'conflictId');
    }

    if (!data.eventId || typeof data.eventId !== 'string') {
      throw new ValidationError('Event ID is required and must be a string', 'eventId');
    }

    if (!data.userId || typeof data.userId !== 'string') {
      throw new ValidationError('User ID is required and must be a string', 'userId');
    }

    const validPlatforms = ['meetup', 'linkedin'];
    if (!validPlatforms.includes(data.platform as string)) {
      throw new ValidationError('Invalid platform', 'platform');
    }

    const validConflictTypes = ['title_mismatch', 'date_mismatch', 'description_mismatch', 'status_mismatch'];
    if (!validConflictTypes.includes(data.conflictType as string)) {
      throw new ValidationError('Invalid conflict type', 'conflictType');
    }

    if (!data.localValue || typeof data.localValue !== 'string') {
      throw new ValidationError('Local value is required and must be a string', 'localValue');
    }

    if (!data.externalValue || typeof data.externalValue !== 'string') {
      throw new ValidationError('External value is required and must be a string', 'externalValue');
    }

    const validStatuses = ['pending', 'resolved_local', 'resolved_external'];
    if (!validStatuses.includes(data.status as string)) {
      throw new ValidationError('Invalid status', 'status');
    }

    if (data.resolvedAt && !(data.resolvedAt instanceof Date)) {
      throw new ValidationError('Resolved at must be a Date object', 'resolvedAt');
    }
  }

  static create(data: Pick<SyncConflict, 'eventId' | 'userId' | 'platform' | 'conflictType' | 'localValue' | 'externalValue'> & Partial<Omit<SyncConflict, 'conflictId' | 'createdAt' | 'eventId' | 'userId' | 'platform' | 'conflictType' | 'localValue' | 'externalValue'>>): SyncConflict {
    const syncConflict: SyncConflict = {
      conflictId: generateId(),
      eventId: data.eventId,
      userId: data.userId,
      platform: data.platform,
      conflictType: data.conflictType,
      localValue: data.localValue,
      externalValue: data.externalValue,
      status: data.status || 'pending',
      createdAt: new Date(),
      resolvedAt: data.resolvedAt
    };

    this.validate(syncConflict);
    return syncConflict;
  }

  static serialize(syncConflict: SyncConflict): Record<string, any> {
    return {
      ...syncConflict,
      createdAt: formatDateForStorage(syncConflict.createdAt),
      resolvedAt: syncConflict.resolvedAt ? formatDateForStorage(syncConflict.resolvedAt) : undefined
    };
  }

  static deserialize(data: Record<string, any>): SyncConflict {
    return {
      ...data,
      createdAt: parseDate(data.createdAt),
      resolvedAt: data.resolvedAt ? parseDate(data.resolvedAt) : undefined
    } as SyncConflict;
  }
}

// Notification validation and serialization
export class NotificationModel {
  static validate(data: Partial<Notification>): void {
    if (!data.notificationId || typeof data.notificationId !== 'string') {
      throw new ValidationError('Notification ID is required and must be a string', 'notificationId');
    }

    if (!data.userId || typeof data.userId !== 'string') {
      throw new ValidationError('User ID is required and must be a string', 'userId');
    }

    const validTypes = ['success', 'error', 'warning', 'info'];
    if (!validTypes.includes(data.type as string)) {
      throw new ValidationError('Invalid type', 'type');
    }

    if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
      throw new ValidationError('Title is required and must be a non-empty string', 'title');
    }

    if (!data.message || typeof data.message !== 'string' || data.message.trim().length === 0) {
      throw new ValidationError('Message is required and must be a non-empty string', 'message');
    }

    if (typeof data.read !== 'boolean') {
      throw new ValidationError('Read must be a boolean', 'read');
    }
  }

  static create(data: Pick<Notification, 'userId' | 'type' | 'title' | 'message'> & Partial<Omit<Notification, 'notificationId' | 'createdAt' | 'userId' | 'type' | 'title' | 'message'>>): Notification {
    const notification: Notification = {
      notificationId: generateId(),
      userId: data.userId,
      type: data.type,
      title: sanitizeString(data.title),
      message: sanitizeString(data.message),
      relatedEntityId: data.relatedEntityId,
      relatedEntityType: data.relatedEntityType,
      read: data.read || false,
      createdAt: new Date()
    };

    this.validate(notification);
    return notification;
  }

  static serialize(notification: Notification): Record<string, any> {
    return {
      ...notification,
      createdAt: formatDateForStorage(notification.createdAt)
    };
  }

  static deserialize(data: Record<string, any>): Notification {
    return {
      ...data,
      createdAt: parseDate(data.createdAt)
    } as Notification;
  }
}