// Unit tests for data models

import {
  UserProfileModel,
  EventModel,
  ScheduledPostModel,
  MessageModel,
  SyncRecordModel,
  SyncConflictModel,
  NotificationModel,
  ValidationError
} from '../src/shared/models';
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
} from '../src/shared/types';

describe('Data Models Unit Tests', () => {

  describe('UserProfileModel', () => {
    const validNotificationSettings: NotificationSettings = {
      email: true,
      inApp: true,
      successNotifications: true,
      errorNotifications: true,
      reminderNotifications: false
    };

    const validEncryptedCredentials: EncryptedCredentials = {
      accessToken: 'access-token-123',
      refreshToken: 'refresh-token-456',
      expiresAt: new Date(Date.now() + 3600000),
      encryptedData: 'encrypted-data-string'
    };

    describe('validate', () => {
      test('should validate valid user profile data', () => {
        const validData: Partial<UserProfile> = {
          userId: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          notificationPreferences: validNotificationSettings,
          meetupCredentials: validEncryptedCredentials
        };

        expect(() => UserProfileModel.validate(validData)).not.toThrow();
      });

      test('should reject missing userId', () => {
        const invalidData: Partial<UserProfile> = {
          email: 'test@example.com',
          name: 'Test User',
          notificationPreferences: validNotificationSettings
        };

        expect(() => UserProfileModel.validate(invalidData))
          .toThrow(new ValidationError('User ID is required and must be a string', 'userId'));
      });

      test('should reject invalid email', () => {
        const invalidData: Partial<UserProfile> = {
          userId: 'user-123',
          email: 'invalid-email',
          name: 'Test User',
          notificationPreferences: validNotificationSettings
        };

        expect(() => UserProfileModel.validate(invalidData))
          .toThrow(new ValidationError('Valid email is required', 'email'));
      });

      test('should reject empty name', () => {
        const invalidData: Partial<UserProfile> = {
          userId: 'user-123',
          email: 'test@example.com',
          name: '',
          notificationPreferences: validNotificationSettings
        };

        expect(() => UserProfileModel.validate(invalidData))
          .toThrow(new ValidationError('Name is required and must be a non-empty string', 'name'));
      });

      test('should reject invalid notification settings', () => {
        const invalidNotificationSettings = {
          email: 'not-boolean',
          inApp: true,
          successNotifications: true,
          errorNotifications: true,
          reminderNotifications: false
        } as any;

        const invalidData: Partial<UserProfile> = {
          userId: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          notificationPreferences: invalidNotificationSettings
        };

        expect(() => UserProfileModel.validate(invalidData))
          .toThrow(new ValidationError('email must be a boolean', 'email'));
      });

      test('should reject invalid encrypted credentials', () => {
        const invalidCredentials = {
          accessToken: '',
          encryptedData: 'encrypted-data'
        } as EncryptedCredentials;

        const invalidData: Partial<UserProfile> = {
          userId: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          notificationPreferences: validNotificationSettings,
          meetupCredentials: invalidCredentials
        };

        expect(() => UserProfileModel.validate(invalidData))
          .toThrow(new ValidationError('Access token is required', 'accessToken'));
      });
    });

    describe('create', () => {
      test('should create valid user profile with generated ID and timestamps', () => {
        const userData = {
          email: 'test@example.com',
          name: 'Test User',
          notificationPreferences: validNotificationSettings,
          manualConfirmationEnabled: true
        };

        const userProfile = UserProfileModel.create(userData);

        expect(userProfile.userId).toBeDefined();
        expect(userProfile.email).toBe('test@example.com');
        expect(userProfile.name).toBe('Test User');
        expect(userProfile.manualConfirmationEnabled).toBe(true);
        expect(userProfile.createdAt).toBeInstanceOf(Date);
        expect(userProfile.updatedAt).toBeInstanceOf(Date);
        expect(userProfile.lastSyncTime).toBeInstanceOf(Date);
      });

      test('should set default values for optional fields', () => {
        const userData = {
          email: 'test@example.com',
          name: 'Test User',
          notificationPreferences: validNotificationSettings
        };

        const userProfile = UserProfileModel.create(userData);

        expect(userProfile.manualConfirmationEnabled).toBe(false);
      });
    });

    describe('serialize and deserialize', () => {
      test('should serialize and deserialize user profile correctly', () => {
        const userData = {
          email: 'test@example.com',
          name: 'Test User',
          notificationPreferences: validNotificationSettings,
          manualConfirmationEnabled: true
        };

        const userProfile = UserProfileModel.create(userData);
        const serialized = UserProfileModel.serialize(userProfile);
        const deserialized = UserProfileModel.deserialize(serialized);

        expect(deserialized.userId).toBe(userProfile.userId);
        expect(deserialized.email).toBe(userProfile.email);
        expect(deserialized.createdAt).toEqual(userProfile.createdAt);
        expect(deserialized.updatedAt).toEqual(userProfile.updatedAt);
        expect(deserialized.lastSyncTime).toEqual(userProfile.lastSyncTime);
      });
    });
  });

  describe('EventModel', () => {
    const futureDate = new Date(Date.now() + 86400000); // 1 day from now

    describe('validate', () => {
      test('should validate valid event data', () => {
        const validData: Partial<Event> = {
          eventId: 'event-123',
          userId: 'user-123',
          title: 'Test Event',
          description: 'Test event description',
          dateTime: futureDate,
          location: 'Test Location',
          meetupEventStatus: 'draft',
          platformStatus: 'pending_confirmation',
          source: 'platform'
        };

        expect(() => EventModel.validate(validData)).not.toThrow();
      });

      test('should reject past event date', () => {
        const pastDate = new Date(Date.now() - 86400000); // 1 day ago
        const invalidData: Partial<Event> = {
          eventId: 'event-123',
          userId: 'user-123',
          title: 'Test Event',
          description: 'Test event description',
          dateTime: pastDate,
          location: 'Test Location',
          meetupEventStatus: 'draft',
          platformStatus: 'pending_confirmation',
          source: 'platform'
        };

        expect(() => EventModel.validate(invalidData))
          .toThrow(new ValidationError('Event date must be in the future', 'dateTime'));
      });

      test('should reject invalid meetup status', () => {
        const invalidData: Partial<Event> = {
          eventId: 'event-123',
          userId: 'user-123',
          title: 'Test Event',
          description: 'Test event description',
          dateTime: futureDate,
          location: 'Test Location',
          meetupEventStatus: 'invalid-status' as any,
          platformStatus: 'pending_confirmation',
          source: 'platform'
        };

        expect(() => EventModel.validate(invalidData))
          .toThrow(new ValidationError('Invalid meetup event status', 'meetupEventStatus'));
      });

      test('should reject empty title', () => {
        const invalidData: Partial<Event> = {
          eventId: 'event-123',
          userId: 'user-123',
          title: '',
          description: 'Test event description',
          dateTime: futureDate,
          location: 'Test Location',
          meetupEventStatus: 'draft',
          platformStatus: 'pending_confirmation',
          source: 'platform'
        };

        expect(() => EventModel.validate(invalidData))
          .toThrow(new ValidationError('Title is required and must be a non-empty string', 'title'));
      });
    });

    describe('create', () => {
      test('should create valid event with generated ID and timestamps', () => {
        const eventData = {
          userId: 'user-123',
          title: 'Test Event',
          description: 'Test event description',
          dateTime: futureDate,
          location: 'Test Location',
          meetupEventStatus: 'draft' as const,
          platformStatus: 'confirmed' as const,
          source: 'platform' as const,
          requiresConfirmation: true,
          publishToLinkedIn: true
        };

        const event = EventModel.createNew(eventData);

        expect(event.eventId).toBeDefined();
        expect(event.title).toBe('Test Event');
        expect(event.requiresConfirmation).toBe(true);
        expect(event.publishToLinkedIn).toBe(true);
        expect(event.publishToMeetup).toBe(true); // default
        expect(event.createdAt).toBeInstanceOf(Date);
        expect(event.updatedAt).toBeInstanceOf(Date);
      });

      test('should set default values for optional fields', () => {
        const eventData = {
          userId: 'user-123',
          title: 'Test Event',
          description: 'Test event description',
          dateTime: futureDate,
          location: 'Test Location'
        };

        const event = EventModel.createNew(eventData);

        expect(event.meetupEventStatus).toBe('draft');
        expect(event.platformStatus).toBe('pending_confirmation');
        expect(event.source).toBe('platform');
        expect(event.requiresConfirmation).toBe(false);
        expect(event.publishToMeetup).toBe(true);
        expect(event.publishToLinkedIn).toBe(false);
        expect(event.socialPostsScheduled).toBe(false);
        expect(event.messagesScheduled).toBe(false);
        expect(event.externallyModified).toBe(false);
      });
    });

    describe('serialize and deserialize', () => {
      test('should serialize and deserialize event correctly', () => {
        const eventData = {
          userId: 'user-123',
          title: 'Test Event',
          description: 'Test event description',
          dateTime: futureDate,
          location: 'Test Location'
        };

        const event = EventModel.createNew(eventData);
        const serialized = EventModel.serialize(event);
        const deserialized = EventModel.deserialize(serialized);

        expect(deserialized.eventId).toBe(event.eventId);
        expect(deserialized.title).toBe(event.title);
        expect(deserialized.dateTime).toEqual(event.dateTime);
        expect(deserialized.createdAt).toEqual(event.createdAt);
      });
    });
  });

  describe('ScheduledPostModel', () => {
    const futureDate = new Date(Date.now() + 86400000);

    describe('validate', () => {
      test('should validate valid scheduled post data', () => {
        const validData: Partial<ScheduledPost> = {
          postId: 'post-123',
          eventId: 'event-123',
          userId: 'user-123',
          platform: 'linkedin',
          content: 'Test post content',
          scheduledTime: futureDate,
          status: 'pending'
        };

        expect(() => ScheduledPostModel.validate(validData)).not.toThrow();
      });

      test('should reject invalid platform', () => {
        const invalidData: Partial<ScheduledPost> = {
          postId: 'post-123',
          eventId: 'event-123',
          userId: 'user-123',
          platform: 'facebook' as any,
          content: 'Test post content',
          scheduledTime: futureDate,
          status: 'pending'
        };

        expect(() => ScheduledPostModel.validate(invalidData))
          .toThrow(new ValidationError('Platform must be linkedin', 'platform'));
      });

      test('should reject empty content', () => {
        const invalidData: Partial<ScheduledPost> = {
          postId: 'post-123',
          eventId: 'event-123',
          userId: 'user-123',
          platform: 'linkedin',
          content: '',
          scheduledTime: futureDate,
          status: 'pending'
        };

        expect(() => ScheduledPostModel.validate(invalidData))
          .toThrow(new ValidationError('Content is required and must be a non-empty string', 'content'));
      });
    });

    describe('create', () => {
      test('should create valid scheduled post with generated ID and timestamp', () => {
        const postData = {
          eventId: 'event-123',
          userId: 'user-123',
          platform: 'linkedin' as const,
          content: 'Test post content',
          scheduledTime: futureDate,
          status: 'pending_confirmation' as const,
          requiresConfirmation: true
        };

        const post = ScheduledPostModel.create(postData);

        expect(post.postId).toBeDefined();
        expect(post.content).toBe('Test post content');
        expect(post.status).toBe('pending_confirmation');
        expect(post.requiresConfirmation).toBe(true);
        expect(post.createdAt).toBeInstanceOf(Date);
      });

      test('should set default values for optional fields', () => {
        const postData = {
          eventId: 'event-123',
          userId: 'user-123',
          platform: 'linkedin' as const,
          content: 'Test post content',
          scheduledTime: futureDate
        };

        const post = ScheduledPostModel.create(postData);

        expect(post.status).toBe('pending');
        expect(post.requiresConfirmation).toBe(false);
      });
    });
  });

  describe('MessageModel', () => {
    const futureDate = new Date(Date.now() + 86400000);

    describe('validate', () => {
      test('should validate valid message data', () => {
        const validData: Partial<Message> = {
          messageId: 'message-123',
          eventId: 'event-123',
          userId: 'user-123',
          recipientType: 'attendees',
          content: 'Test message content',
          scheduledTime: futureDate,
          status: 'pending',
          recipientCount: 10,
          sentCount: 0
        };

        expect(() => MessageModel.validate(validData)).not.toThrow();
      });

      test('should reject invalid recipient type', () => {
        const invalidData: Partial<Message> = {
          messageId: 'message-123',
          eventId: 'event-123',
          userId: 'user-123',
          recipientType: 'invalid-type' as any,
          content: 'Test message content',
          scheduledTime: futureDate,
          status: 'pending',
          recipientCount: 10,
          sentCount: 0
        };

        expect(() => MessageModel.validate(invalidData))
          .toThrow(new ValidationError('Invalid recipient type', 'recipientType'));
      });

      test('should reject sent count exceeding recipient count', () => {
        const invalidData: Partial<Message> = {
          messageId: 'message-123',
          eventId: 'event-123',
          userId: 'user-123',
          recipientType: 'attendees',
          content: 'Test message content',
          scheduledTime: futureDate,
          status: 'pending',
          recipientCount: 5,
          sentCount: 10
        };

        expect(() => MessageModel.validate(invalidData))
          .toThrow(new ValidationError('Sent count cannot exceed recipient count', 'sentCount'));
      });

      test('should reject negative recipient count', () => {
        const invalidData: Partial<Message> = {
          messageId: 'message-123',
          eventId: 'event-123',
          userId: 'user-123',
          recipientType: 'attendees',
          content: 'Test message content',
          scheduledTime: futureDate,
          status: 'pending',
          recipientCount: -1,
          sentCount: 0
        };

        expect(() => MessageModel.validate(invalidData))
          .toThrow(new ValidationError('Recipient count must be a non-negative number', 'recipientCount'));
      });
    });

    describe('create', () => {
      test('should create valid message with generated ID and timestamp', () => {
        const messageData = {
          eventId: 'event-123',
          userId: 'user-123',
          recipientType: 'non_rsvp_members' as const,
          content: 'Test message content',
          scheduledTime: futureDate,
          status: 'sent' as const,
          recipientCount: 15,
          sentCount: 12,
          requiresConfirmation: true
        };

        const message = MessageModel.create(messageData);

        expect(message.messageId).toBeDefined();
        expect(message.recipientType).toBe('non_rsvp_members');
        expect(message.status).toBe('sent');
        expect(message.recipientCount).toBe(15);
        expect(message.sentCount).toBe(12);
        expect(message.requiresConfirmation).toBe(true);
        expect(message.createdAt).toBeInstanceOf(Date);
      });

      test('should set default values for optional fields', () => {
        const messageData = {
          eventId: 'event-123',
          userId: 'user-123',
          recipientType: 'attendees' as const,
          content: 'Test message content',
          scheduledTime: futureDate
        };

        const message = MessageModel.create(messageData);

        expect(message.status).toBe('pending');
        expect(message.recipientCount).toBe(0);
        expect(message.sentCount).toBe(0);
        expect(message.requiresConfirmation).toBe(false);
      });
    });
  });

  describe('SyncRecordModel', () => {
    const syncTime = new Date();

    describe('validate', () => {
      test('should validate valid sync record data', () => {
        const validData: Partial<SyncRecord> = {
          syncId: 'sync-123',
          userId: 'user-123',
          platform: 'meetup',
          lastSyncTime: syncTime,
          status: 'success',
          eventsImported: 5,
          eventsUpdated: 2,
          conflictsDetected: 0
        };

        expect(() => SyncRecordModel.validate(validData)).not.toThrow();
      });

      test('should reject invalid platform', () => {
        const invalidData: Partial<SyncRecord> = {
          syncId: 'sync-123',
          userId: 'user-123',
          platform: 'facebook' as any,
          lastSyncTime: syncTime,
          status: 'success',
          eventsImported: 5,
          eventsUpdated: 2,
          conflictsDetected: 0
        };

        expect(() => SyncRecordModel.validate(invalidData))
          .toThrow(new ValidationError('Invalid platform', 'platform'));
      });

      test('should reject negative events imported', () => {
        const invalidData: Partial<SyncRecord> = {
          syncId: 'sync-123',
          userId: 'user-123',
          platform: 'linkedin',
          lastSyncTime: syncTime,
          status: 'success',
          eventsImported: -1,
          eventsUpdated: 2,
          conflictsDetected: 0
        };

        expect(() => SyncRecordModel.validate(invalidData))
          .toThrow(new ValidationError('Events imported must be a non-negative number', 'eventsImported'));
      });
    });

    describe('create', () => {
      test('should create valid sync record with generated ID and timestamp', () => {
        const syncData = {
          userId: 'user-123',
          platform: 'meetup' as const,
          lastSyncTime: syncTime,
          status: 'failed' as const,
          eventsImported: 3,
          eventsUpdated: 1,
          conflictsDetected: 2,
          errorMessage: 'API rate limit exceeded'
        };

        const syncRecord = SyncRecordModel.create(syncData);

        expect(syncRecord.syncId).toBeDefined();
        expect(syncRecord.platform).toBe('meetup');
        expect(syncRecord.status).toBe('failed');
        expect(syncRecord.errorMessage).toBe('API rate limit exceeded');
        expect(syncRecord.createdAt).toBeInstanceOf(Date);
      });

      test('should set default values for optional fields', () => {
        const syncData = {
          userId: 'user-123',
          platform: 'linkedin' as const,
          lastSyncTime: syncTime,
          status: 'in_progress' as const
        };

        const syncRecord = SyncRecordModel.create(syncData);

        expect(syncRecord.eventsImported).toBe(0);
        expect(syncRecord.eventsUpdated).toBe(0);
        expect(syncRecord.conflictsDetected).toBe(0);
      });
    });
  });

  describe('SyncConflictModel', () => {
    const createdTime = new Date();

    describe('validate', () => {
      test('should validate valid sync conflict data', () => {
        const validData: Partial<SyncConflict> = {
          conflictId: 'conflict-123',
          eventId: 'event-123',
          userId: 'user-123',
          platform: 'meetup',
          conflictType: 'title_mismatch',
          localValue: 'Local Event Title',
          externalValue: 'External Event Title',
          status: 'pending',
          createdAt: createdTime
        };

        expect(() => SyncConflictModel.validate(validData)).not.toThrow();
      });

      test('should reject invalid conflict type', () => {
        const invalidData: Partial<SyncConflict> = {
          conflictId: 'conflict-123',
          eventId: 'event-123',
          userId: 'user-123',
          platform: 'meetup',
          conflictType: 'invalid_type' as any,
          localValue: 'Local Value',
          externalValue: 'External Value',
          status: 'pending',
          createdAt: createdTime
        };

        expect(() => SyncConflictModel.validate(invalidData))
          .toThrow(new ValidationError('Invalid conflict type', 'conflictType'));
      });

      test('should reject empty local value', () => {
        const invalidData: Partial<SyncConflict> = {
          conflictId: 'conflict-123',
          eventId: 'event-123',
          userId: 'user-123',
          platform: 'meetup',
          conflictType: 'description_mismatch',
          localValue: '',
          externalValue: 'External Value',
          status: 'pending',
          createdAt: createdTime
        };

        expect(() => SyncConflictModel.validate(invalidData))
          .toThrow(new ValidationError('Local value is required and must be a string', 'localValue'));
      });
    });

    describe('create', () => {
      test('should create valid sync conflict with generated ID and timestamp', () => {
        const conflictData = {
          eventId: 'event-123',
          userId: 'user-123',
          platform: 'linkedin' as const,
          conflictType: 'date_mismatch' as const,
          localValue: '2024-01-15T10:00:00Z',
          externalValue: '2024-01-15T11:00:00Z',
          status: 'resolved_external' as const,
          resolvedAt: new Date()
        };

        const conflict = SyncConflictModel.create(conflictData);

        expect(conflict.conflictId).toBeDefined();
        expect(conflict.conflictType).toBe('date_mismatch');
        expect(conflict.status).toBe('resolved_external');
        expect(conflict.resolvedAt).toBeInstanceOf(Date);
        expect(conflict.createdAt).toBeInstanceOf(Date);
      });

      test('should set default values for optional fields', () => {
        const conflictData = {
          eventId: 'event-123',
          userId: 'user-123',
          platform: 'meetup' as const,
          conflictType: 'status_mismatch' as const,
          localValue: 'draft',
          externalValue: 'published'
        };

        const conflict = SyncConflictModel.create(conflictData);

        expect(conflict.status).toBe('pending');
        expect(conflict.resolvedAt).toBeUndefined();
      });
    });
  });

  describe('NotificationModel', () => {
    describe('validate', () => {
      test('should validate valid notification data', () => {
        const validData: Partial<Notification> = {
          notificationId: 'notification-123',
          userId: 'user-123',
          type: 'success',
          title: 'Event Created',
          message: 'Your event has been successfully created',
          relatedEntityId: 'event-123',
          relatedEntityType: 'event',
          read: false
        };

        expect(() => NotificationModel.validate(validData)).not.toThrow();
      });

      test('should reject invalid notification type', () => {
        const invalidData: Partial<Notification> = {
          notificationId: 'notification-123',
          userId: 'user-123',
          type: 'invalid-type' as any,
          title: 'Test Title',
          message: 'Test message',
          read: false
        };

        expect(() => NotificationModel.validate(invalidData))
          .toThrow(new ValidationError('Invalid type', 'type'));
      });

      test('should reject empty title', () => {
        const invalidData: Partial<Notification> = {
          notificationId: 'notification-123',
          userId: 'user-123',
          type: 'error',
          title: '',
          message: 'Test message',
          read: false
        };

        expect(() => NotificationModel.validate(invalidData))
          .toThrow(new ValidationError('Title is required and must be a non-empty string', 'title'));
      });

      test('should reject non-boolean read field', () => {
        const invalidData: Partial<Notification> = {
          notificationId: 'notification-123',
          userId: 'user-123',
          type: 'info',
          title: 'Test Title',
          message: 'Test message',
          read: 'false' as any
        };

        expect(() => NotificationModel.validate(invalidData))
          .toThrow(new ValidationError('Read must be a boolean', 'read'));
      });
    });

    describe('create', () => {
      test('should create valid notification with generated ID and timestamp', () => {
        const notificationData = {
          userId: 'user-123',
          type: 'warning' as const,
          title: 'Sync Conflict',
          message: 'A synchronization conflict was detected',
          relatedEntityId: 'event-123',
          relatedEntityType: 'event',
          read: true
        };

        const notification = NotificationModel.create(notificationData);

        expect(notification.notificationId).toBeDefined();
        expect(notification.type).toBe('warning');
        expect(notification.title).toBe('Sync Conflict');
        expect(notification.read).toBe(true);
        expect(notification.createdAt).toBeInstanceOf(Date);
      });

      test('should set default values for optional fields', () => {
        const notificationData = {
          userId: 'user-123',
          type: 'info' as const,
          title: 'Test Notification',
          message: 'Test message'
        };

        const notification = NotificationModel.create(notificationData);

        expect(notification.read).toBe(false);
        expect(notification.relatedEntityId).toBeUndefined();
        expect(notification.relatedEntityType).toBeUndefined();
      });
    });

    describe('serialize and deserialize', () => {
      test('should serialize and deserialize notification correctly', () => {
        const notificationData = {
          userId: 'user-123',
          type: 'error' as const,
          title: 'Test Error',
          message: 'An error occurred',
          read: false
        };

        const notification = NotificationModel.create(notificationData);
        const serialized = NotificationModel.serialize(notification);
        const deserialized = NotificationModel.deserialize(serialized);

        expect(deserialized.notificationId).toBe(notification.notificationId);
        expect(deserialized.type).toBe(notification.type);
        expect(deserialized.createdAt).toEqual(notification.createdAt);
      });
    });
  });

  describe('ValidationError', () => {
    test('should create validation error with message and field', () => {
      const error = new ValidationError('Test error message', 'testField');

      expect(error.message).toBe('Test error message');
      expect(error.field).toBe('testField');
      expect(error.name).toBe('ValidationError');
      expect(error).toBeInstanceOf(Error);
    });

    test('should create validation error without field', () => {
      const error = new ValidationError('Test error message');

      expect(error.message).toBe('Test error message');
      expect(error.field).toBeUndefined();
      expect(error.name).toBe('ValidationError');
    });
  });
});