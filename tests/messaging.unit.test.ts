// Unit tests for messaging service
// Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5

import { MessagingService, ScheduleMessageRequest, MessageTemplate } from '../src/shared/messaging-service';
import { MeetupClient, MeetupMember, MeetupAttendee } from '../src/shared/meetup-client';
import { Event, UserProfile, Message } from '../src/shared/types';

// Mock AWS clients
jest.mock('../src/shared/aws-clients');

describe('Messaging Service Unit Tests', () => {
  let mockEvent: Event;
  let mockUserProfile: UserProfile;
  let mockMeetupClient: jest.Mocked<MeetupClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    mockEvent = {
      eventId: 'test-event-id',
      userId: 'test-user-id',
      title: 'Test Meetup Event',
      description: 'A great event for testing',
      dateTime: futureDate,
      location: 'Test Venue, 123 Main St',
      meetupEventId: 'meetup-event-123',
      meetupEventStatus: 'published',
      platformStatus: 'confirmed',
      source: 'platform',
      requiresConfirmation: false,
      publishToMeetup: true,
      publishToLinkedIn: false,
      socialPostsScheduled: false,
      messagesScheduled: false,
      lastSyncTime: new Date(),
      externallyModified: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    mockUserProfile = {
      userId: 'test-user-id',
      email: 'organizer@example.com',
      name: 'Test Organizer',
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

    mockMeetupClient = {
      createEvent: jest.fn(),
      publishDraftEvent: jest.fn(),
      updateEvent: jest.fn(),
      cancelEvent: jest.fn(),
      getEvent: jest.fn(),
      getGroupEvents: jest.fn(),
      getGroupMembers: jest.fn(),
      getEventAttendees: jest.fn(),
      getManagedGroups: jest.fn(),
      sendMessage: jest.fn()
    } as any;
  });

  // ============================================================
  // Recipient List Generation Tests (Requirements 5.1, 5.2, 5.3)
  // ============================================================

  describe('Recipient list generation', () => {
    test('scheduleMessage creates message with correct recipientType for attendees', async () => {
      const mockSaveMessage = jest.spyOn(MessagingService as any, 'saveMessage')
        .mockResolvedValue(undefined);

      const request: ScheduleMessageRequest = {
        event: mockEvent,
        userProfile: mockUserProfile,
        recipientType: 'attendees',
        scheduledTime: new Date(Date.now() + 86400000)
      };

      const result = await MessagingService.scheduleMessage(request);

      expect(result.error).toBeUndefined();
      expect(result.message.recipientType).toBe('attendees');
      expect(result.message.eventId).toBe('test-event-id');
      expect(result.message.userId).toBe('test-user-id');

      mockSaveMessage.mockRestore();
    });

    test('scheduleMessage creates message with correct recipientType for non-RSVP members', async () => {
      const mockSaveMessage = jest.spyOn(MessagingService as any, 'saveMessage')
        .mockResolvedValue(undefined);

      const request: ScheduleMessageRequest = {
        event: mockEvent,
        userProfile: mockUserProfile,
        recipientType: 'non_rsvp_members',
        scheduledTime: new Date(Date.now() + 86400000)
      };

      const result = await MessagingService.scheduleMessage(request);

      expect(result.error).toBeUndefined();
      expect(result.message.recipientType).toBe('non_rsvp_members');

      mockSaveMessage.mockRestore();
    });

    test('sendMessage calls getEventAttendees for attendee messages', async () => {
      const mockAttendees: MeetupAttendee[] = [
        { member: { id: 'member-1', name: 'Alice' }, rsvp: { response: 'yes', guests: 0, created: Date.now(), updated: Date.now() } },
        { member: { id: 'member-2', name: 'Bob' }, rsvp: { response: 'yes', guests: 1, created: Date.now(), updated: Date.now() } }
      ];

      mockMeetupClient.getEventAttendees.mockResolvedValue(mockAttendees);
      mockMeetupClient.sendMessage.mockResolvedValue({ messageId: 'ext-msg-1', recipientCount: 2 });

      const mockUpdateMessageRecipientCount = jest.spyOn(MessagingService as any, 'updateMessageRecipientCount')
        .mockResolvedValue(undefined);
      const mockUpdateMessageStatus = jest.spyOn(MessagingService as any, 'updateMessageStatus')
        .mockResolvedValue(undefined);

      const message: Message = {
        messageId: 'msg-1',
        eventId: 'test-event-id',
        userId: 'test-user-id',
        recipientType: 'attendees',
        content: 'Hello attendees!',
        scheduledTime: new Date(),
        status: 'pending',
        recipientCount: 0,
        sentCount: 0,
        requiresConfirmation: false,
        createdAt: new Date()
      };

      await MessagingService.sendMessage({
        message,
        meetupClient: mockMeetupClient,
        groupId: 'test-group'
      });

      expect(mockMeetupClient.getEventAttendees).toHaveBeenCalledWith('test-group', 'test-event-id');

      mockUpdateMessageRecipientCount.mockRestore();
      mockUpdateMessageStatus.mockRestore();
    });

    test('sendMessage calls getGroupMembers for non-RSVP member messages', async () => {
      const mockMembers: MeetupMember[] = [
        { id: 'member-1', name: 'Alice', status: 'active', joined: Date.now(), visited: Date.now() },
        { id: 'member-2', name: 'Bob', status: 'active', joined: Date.now(), visited: Date.now() },
        { id: 'member-3', name: 'Charlie', status: 'active', joined: Date.now(), visited: Date.now() }
      ];

      const mockAttendees: MeetupAttendee[] = [
        { member: { id: 'member-1', name: 'Alice' }, rsvp: { response: 'yes', guests: 0, created: Date.now(), updated: Date.now() } }
      ];

      mockMeetupClient.getGroupMembers.mockResolvedValue(mockMembers);
      mockMeetupClient.getEventAttendees.mockResolvedValue(mockAttendees);
      mockMeetupClient.sendMessage.mockResolvedValue({ messageId: 'ext-msg-2', recipientCount: 2 });

      const mockUpdateMessageRecipientCount = jest.spyOn(MessagingService as any, 'updateMessageRecipientCount')
        .mockResolvedValue(undefined);
      const mockUpdateMessageStatus = jest.spyOn(MessagingService as any, 'updateMessageStatus')
        .mockResolvedValue(undefined);

      const message: Message = {
        messageId: 'msg-2',
        eventId: 'test-event-id',
        userId: 'test-user-id',
        recipientType: 'non_rsvp_members',
        content: 'Hello non-RSVP members!',
        scheduledTime: new Date(),
        status: 'pending',
        recipientCount: 0,
        sentCount: 0,
        requiresConfirmation: false,
        createdAt: new Date()
      };

      await MessagingService.sendMessage({
        message,
        meetupClient: mockMeetupClient,
        groupId: 'test-group'
      });

      expect(mockMeetupClient.getGroupMembers).toHaveBeenCalledWith('test-group');
      expect(mockMeetupClient.getEventAttendees).toHaveBeenCalledWith('test-group', 'test-event-id');

      mockUpdateMessageRecipientCount.mockRestore();
      mockUpdateMessageStatus.mockRestore();
    });

    test('recipient count correctly filters confirmed attendees (rsvp.response === yes)', async () => {
      const mockAttendees: MeetupAttendee[] = [
        { member: { id: 'member-1', name: 'Alice' }, rsvp: { response: 'yes', guests: 0, created: Date.now(), updated: Date.now() } },
        { member: { id: 'member-2', name: 'Bob' }, rsvp: { response: 'no', guests: 0, created: Date.now(), updated: Date.now() } },
        { member: { id: 'member-3', name: 'Charlie' }, rsvp: { response: 'waitlist', guests: 0, created: Date.now(), updated: Date.now() } },
        { member: { id: 'member-4', name: 'Diana' }, rsvp: { response: 'yes', guests: 2, created: Date.now(), updated: Date.now() } }
      ];

      mockMeetupClient.getEventAttendees.mockResolvedValue(mockAttendees);
      mockMeetupClient.sendMessage.mockResolvedValue({ messageId: 'ext-msg-3', recipientCount: 2 });

      const mockUpdateMessageRecipientCount = jest.spyOn(MessagingService as any, 'updateMessageRecipientCount')
        .mockResolvedValue(undefined);
      const mockUpdateMessageStatus = jest.spyOn(MessagingService as any, 'updateMessageStatus')
        .mockResolvedValue(undefined);

      const message: Message = {
        messageId: 'msg-3',
        eventId: 'test-event-id',
        userId: 'test-user-id',
        recipientType: 'attendees',
        content: 'Hello!',
        scheduledTime: new Date(),
        status: 'pending',
        recipientCount: 0,
        sentCount: 0,
        requiresConfirmation: false,
        createdAt: new Date()
      };

      await MessagingService.sendMessage({
        message,
        meetupClient: mockMeetupClient,
        groupId: 'test-group'
      });

      // Only 2 attendees have rsvp.response === 'yes' (Alice and Diana)
      expect(mockUpdateMessageRecipientCount).toHaveBeenCalledWith('msg-3', 2);

      mockUpdateMessageRecipientCount.mockRestore();
      mockUpdateMessageStatus.mockRestore();
    });

    test('non-RSVP count excludes attendees from group members', async () => {
      const mockMembers: MeetupMember[] = [
        { id: 'member-1', name: 'Alice', status: 'active', joined: Date.now(), visited: Date.now() },
        { id: 'member-2', name: 'Bob', status: 'active', joined: Date.now(), visited: Date.now() },
        { id: 'member-3', name: 'Charlie', status: 'active', joined: Date.now(), visited: Date.now() },
        { id: 'member-4', name: 'Diana', status: 'inactive', joined: Date.now(), visited: Date.now() }
      ];

      const mockAttendees: MeetupAttendee[] = [
        { member: { id: 'member-1', name: 'Alice' }, rsvp: { response: 'yes', guests: 0, created: Date.now(), updated: Date.now() } },
        { member: { id: 'member-2', name: 'Bob' }, rsvp: { response: 'no', guests: 0, created: Date.now(), updated: Date.now() } }
      ];

      mockMeetupClient.getGroupMembers.mockResolvedValue(mockMembers);
      mockMeetupClient.getEventAttendees.mockResolvedValue(mockAttendees);
      mockMeetupClient.sendMessage.mockResolvedValue({ messageId: 'ext-msg-4', recipientCount: 1 });

      const mockUpdateMessageRecipientCount = jest.spyOn(MessagingService as any, 'updateMessageRecipientCount')
        .mockResolvedValue(undefined);
      const mockUpdateMessageStatus = jest.spyOn(MessagingService as any, 'updateMessageStatus')
        .mockResolvedValue(undefined);

      const message: Message = {
        messageId: 'msg-4',
        eventId: 'test-event-id',
        userId: 'test-user-id',
        recipientType: 'non_rsvp_members',
        content: 'Hello non-RSVP members!',
        scheduledTime: new Date(),
        status: 'pending',
        recipientCount: 0,
        sentCount: 0,
        requiresConfirmation: false,
        createdAt: new Date()
      };

      await MessagingService.sendMessage({
        message,
        meetupClient: mockMeetupClient,
        groupId: 'test-group'
      });

      // 4 members total, 2 are attendees (member-1, member-2), 1 is inactive (member-4)
      // Non-RSVP active members = member-3 only = 1
      expect(mockUpdateMessageRecipientCount).toHaveBeenCalledWith('msg-4', 1);

      mockUpdateMessageRecipientCount.mockRestore();
      mockUpdateMessageStatus.mockRestore();
    });
  });

  // ============================================================
  // Message Template Processing Tests (Requirements 5.1, 5.5)
  // ============================================================

  describe('Message template processing', () => {
    test('default template generates content with event details', async () => {
      const mockSaveMessage = jest.spyOn(MessagingService as any, 'saveMessage')
        .mockResolvedValue(undefined);

      const request: ScheduleMessageRequest = {
        event: mockEvent,
        userProfile: mockUserProfile,
        recipientType: 'attendees',
        scheduledTime: new Date(Date.now() + 86400000)
      };

      const result = await MessagingService.scheduleMessage(request);

      expect(result.error).toBeUndefined();
      expect(result.message.content).toContain('Test Meetup Event');
      expect(result.message.content).toContain('Test Venue, 123 Main St');
      expect(result.message.content).toContain('A great event for testing');

      mockSaveMessage.mockRestore();
    });

    test('custom attendee template is applied correctly', async () => {
      const mockSaveMessage = jest.spyOn(MessagingService as any, 'saveMessage')
        .mockResolvedValue(undefined);

      const customTemplate: MessageTemplate = {
        attendees: 'Dear attendee, join us for {title} at {location}. Details: {description}'
      };

      const request: ScheduleMessageRequest = {
        event: mockEvent,
        userProfile: mockUserProfile,
        recipientType: 'attendees',
        scheduledTime: new Date(Date.now() + 86400000),
        customTemplate
      };

      const result = await MessagingService.scheduleMessage(request);

      expect(result.error).toBeUndefined();
      expect(result.message.content).toContain('Dear attendee, join us for Test Meetup Event');
      expect(result.message.content).toContain('Test Venue, 123 Main St');
      expect(result.message.content).toContain('A great event for testing');
      // Should not contain raw placeholders
      expect(result.message.content).not.toContain('{title}');
      expect(result.message.content).not.toContain('{location}');
      expect(result.message.content).not.toContain('{description}');

      mockSaveMessage.mockRestore();
    });

    test('custom non-RSVP member template is applied correctly', async () => {
      const mockSaveMessage = jest.spyOn(MessagingService as any, 'saveMessage')
        .mockResolvedValue(undefined);

      const customTemplate: MessageTemplate = {
        nonRsvpMembers: 'You are invited to {title} on {date} at {time}. Location: {location}'
      };

      const request: ScheduleMessageRequest = {
        event: mockEvent,
        userProfile: mockUserProfile,
        recipientType: 'non_rsvp_members',
        scheduledTime: new Date(Date.now() + 86400000),
        customTemplate
      };

      const result = await MessagingService.scheduleMessage(request);

      expect(result.error).toBeUndefined();
      expect(result.message.content).toContain('You are invited to Test Meetup Event');
      expect(result.message.content).toContain('Test Venue, 123 Main St');
      // Should not contain raw placeholders
      expect(result.message.content).not.toContain('{title}');
      expect(result.message.content).not.toContain('{date}');
      expect(result.message.content).not.toContain('{time}');
      expect(result.message.content).not.toContain('{location}');

      mockSaveMessage.mockRestore();
    });

    test('template placeholders ({title}, {date}, {time}, {location}, {description}) are substituted', async () => {
      const mockSaveMessage = jest.spyOn(MessagingService as any, 'saveMessage')
        .mockResolvedValue(undefined);

      const customTemplate: MessageTemplate = {
        attendees: 'Event: {title} | Date: {date} | Time: {time} | Place: {location} | Info: {description}'
      };

      const request: ScheduleMessageRequest = {
        event: mockEvent,
        userProfile: mockUserProfile,
        recipientType: 'attendees',
        scheduledTime: new Date(Date.now() + 86400000),
        customTemplate
      };

      const result = await MessagingService.scheduleMessage(request);

      expect(result.error).toBeUndefined();
      const content = result.message.content;

      // Verify all placeholders are replaced
      expect(content).not.toContain('{title}');
      expect(content).not.toContain('{date}');
      expect(content).not.toContain('{time}');
      expect(content).not.toContain('{location}');
      expect(content).not.toContain('{description}');

      // Verify actual values are present
      expect(content).toContain('Test Meetup Event');
      expect(content).toContain('Test Venue, 123 Main St');
      expect(content).toContain('A great event for testing');

      mockSaveMessage.mockRestore();
    });

    test('attendees and non-RSVP members receive different default content', async () => {
      const mockSaveMessage = jest.spyOn(MessagingService as any, 'saveMessage')
        .mockResolvedValue(undefined);

      const attendeeResult = await MessagingService.scheduleMessage({
        event: mockEvent,
        userProfile: mockUserProfile,
        recipientType: 'attendees',
        scheduledTime: new Date(Date.now() + 86400000)
      });

      const nonRsvpResult = await MessagingService.scheduleMessage({
        event: mockEvent,
        userProfile: mockUserProfile,
        recipientType: 'non_rsvp_members',
        scheduledTime: new Date(Date.now() + 86400000)
      });

      expect(attendeeResult.error).toBeUndefined();
      expect(nonRsvpResult.error).toBeUndefined();

      // Content should be different for the two recipient types
      expect(attendeeResult.message.content).not.toBe(nonRsvpResult.message.content);

      // Both should contain event details
      expect(attendeeResult.message.content).toContain('Test Meetup Event');
      expect(nonRsvpResult.message.content).toContain('Test Meetup Event');

      mockSaveMessage.mockRestore();
    });

    test('updateMessageTemplate updates pending messages with new template', async () => {
      const pendingMessage: Message = {
        messageId: 'pending-msg-1',
        eventId: 'test-event-id',
        userId: 'test-user-id',
        recipientType: 'attendees',
        content: 'Old content',
        scheduledTime: new Date(Date.now() + 86400000),
        status: 'pending',
        recipientCount: 0,
        sentCount: 0,
        requiresConfirmation: false,
        createdAt: new Date()
      };

      const mockGetPendingMessages = jest.spyOn(MessagingService as any, 'getPendingMessagesByUser')
        .mockResolvedValue([pendingMessage]);
      const mockGetEventForMessage = jest.spyOn(MessagingService as any, 'getEventForMessage')
        .mockResolvedValue(mockEvent);
      const mockUpdateMessageContent = jest.spyOn(MessagingService as any, 'updateMessageContent')
        .mockResolvedValue(undefined);

      const newTemplate: MessageTemplate = {
        attendees: 'Updated: {title} at {location}'
      };

      await MessagingService.updateMessageTemplate('test-user-id', newTemplate);

      expect(mockGetPendingMessages).toHaveBeenCalledWith('test-user-id');
      expect(mockGetEventForMessage).toHaveBeenCalledWith('test-event-id');
      expect(mockUpdateMessageContent).toHaveBeenCalledWith(
        'pending-msg-1',
        expect.stringContaining('Test Meetup Event')
      );

      // Verify the updated content uses the new template
      const updatedContent = mockUpdateMessageContent.mock.calls[0][1] as string;
      expect(updatedContent).toContain('Updated:');
      expect(updatedContent).toContain('Test Meetup Event');
      expect(updatedContent).toContain('Test Venue, 123 Main St');
      expect(updatedContent).not.toContain('{title}');
      expect(updatedContent).not.toContain('{location}');

      mockGetPendingMessages.mockRestore();
      mockGetEventForMessage.mockRestore();
      mockUpdateMessageContent.mockRestore();
    });
  });

  // ============================================================
  // Delivery Tracking and Error Handling Tests (Requirements 5.4)
  // ============================================================

  describe('Delivery tracking and error handling', () => {
    test('sendMessage updates status to sent on success', async () => {
      const mockAttendees: MeetupAttendee[] = [
        { member: { id: 'member-1', name: 'Alice' }, rsvp: { response: 'yes', guests: 0, created: Date.now(), updated: Date.now() } }
      ];

      mockMeetupClient.getEventAttendees.mockResolvedValue(mockAttendees);
      mockMeetupClient.sendMessage.mockResolvedValue({ messageId: 'ext-msg-1', recipientCount: 1 });

      const mockUpdateMessageRecipientCount = jest.spyOn(MessagingService as any, 'updateMessageRecipientCount')
        .mockResolvedValue(undefined);
      const mockUpdateMessageStatus = jest.spyOn(MessagingService as any, 'updateMessageStatus')
        .mockResolvedValue(undefined);

      const message: Message = {
        messageId: 'msg-success',
        eventId: 'test-event-id',
        userId: 'test-user-id',
        recipientType: 'attendees',
        content: 'Hello!',
        scheduledTime: new Date(),
        status: 'pending',
        recipientCount: 0,
        sentCount: 0,
        requiresConfirmation: false,
        createdAt: new Date()
      };

      const result = await MessagingService.sendMessage({
        message,
        meetupClient: mockMeetupClient,
        groupId: 'test-group'
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('ext-msg-1');
      expect(result.recipientCount).toBe(1);

      // Verify status was updated to 'sent'
      expect(mockUpdateMessageStatus).toHaveBeenCalledWith(
        'msg-success',
        'sent',
        'ext-msg-1',
        1
      );

      mockUpdateMessageRecipientCount.mockRestore();
      mockUpdateMessageStatus.mockRestore();
    });

    test('sendMessage updates status to failed on error', async () => {
      const mockAttendees: MeetupAttendee[] = [
        { member: { id: 'member-1', name: 'Alice' }, rsvp: { response: 'yes', guests: 0, created: Date.now(), updated: Date.now() } }
      ];

      mockMeetupClient.getEventAttendees.mockResolvedValue(mockAttendees);
      mockMeetupClient.sendMessage.mockRejectedValue(new Error('Meetup API rate limit exceeded'));

      const mockUpdateMessageRecipientCount = jest.spyOn(MessagingService as any, 'updateMessageRecipientCount')
        .mockResolvedValue(undefined);
      const mockUpdateMessageStatus = jest.spyOn(MessagingService as any, 'updateMessageStatus')
        .mockResolvedValue(undefined);

      const message: Message = {
        messageId: 'msg-fail',
        eventId: 'test-event-id',
        userId: 'test-user-id',
        recipientType: 'attendees',
        content: 'Hello!',
        scheduledTime: new Date(),
        status: 'pending',
        recipientCount: 0,
        sentCount: 0,
        requiresConfirmation: false,
        createdAt: new Date()
      };

      const result = await MessagingService.sendMessage({
        message,
        meetupClient: mockMeetupClient,
        groupId: 'test-group'
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Meetup API rate limit exceeded');

      // Verify status was updated to 'failed'
      expect(mockUpdateMessageStatus).toHaveBeenCalledWith(
        'msg-fail',
        'failed',
        undefined,
        0,
        'Meetup API rate limit exceeded'
      );

      mockUpdateMessageRecipientCount.mockRestore();
      mockUpdateMessageStatus.mockRestore();
    });

    test('sendMessages processes all messages even when some fail', async () => {
      const mockSendMessage = jest.spyOn(MessagingService, 'sendMessage');

      // First message succeeds, second fails, third succeeds
      mockSendMessage
        .mockResolvedValueOnce({ success: true, messageId: 'ext-1', recipientCount: 5, sentCount: 5 })
        .mockResolvedValueOnce({ success: false, errorMessage: 'API Error' })
        .mockResolvedValueOnce({ success: true, messageId: 'ext-3', recipientCount: 3, sentCount: 3 });

      const messages: Message[] = [
        {
          messageId: 'msg-a', eventId: 'evt-1', userId: 'user-1', recipientType: 'attendees',
          content: 'Msg A', scheduledTime: new Date(), status: 'pending',
          recipientCount: 0, sentCount: 0, requiresConfirmation: false, createdAt: new Date()
        },
        {
          messageId: 'msg-b', eventId: 'evt-2', userId: 'user-1', recipientType: 'attendees',
          content: 'Msg B', scheduledTime: new Date(), status: 'pending',
          recipientCount: 0, sentCount: 0, requiresConfirmation: false, createdAt: new Date()
        },
        {
          messageId: 'msg-c', eventId: 'evt-3', userId: 'user-1', recipientType: 'non_rsvp_members',
          content: 'Msg C', scheduledTime: new Date(), status: 'pending',
          recipientCount: 0, sentCount: 0, requiresConfirmation: false, createdAt: new Date()
        }
      ];

      const result = await MessagingService.sendMessages(
        messages,
        mockMeetupClient,
        'test-group'
      );

      // All 3 messages were attempted
      expect(mockSendMessage).toHaveBeenCalledTimes(3);

      // Correct counts
      expect(result.totalMessages).toBe(3);
      expect(result.successfulMessages).toBe(2);
      expect(result.failedMessages).toBe(1);

      mockSendMessage.mockRestore();
    });

    test('sendMessages returns correct counts (total, successful, failed)', async () => {
      const mockSendMessage = jest.spyOn(MessagingService, 'sendMessage');

      mockSendMessage
        .mockResolvedValueOnce({ success: false, errorMessage: 'Error 1' })
        .mockResolvedValueOnce({ success: false, errorMessage: 'Error 2' });

      const messages: Message[] = [
        {
          messageId: 'msg-x', eventId: 'evt-1', userId: 'user-1', recipientType: 'attendees',
          content: 'Msg X', scheduledTime: new Date(), status: 'pending',
          recipientCount: 0, sentCount: 0, requiresConfirmation: false, createdAt: new Date()
        },
        {
          messageId: 'msg-y', eventId: 'evt-2', userId: 'user-1', recipientType: 'attendees',
          content: 'Msg Y', scheduledTime: new Date(), status: 'pending',
          recipientCount: 0, sentCount: 0, requiresConfirmation: false, createdAt: new Date()
        }
      ];

      const result = await MessagingService.sendMessages(
        messages,
        mockMeetupClient,
        'test-group'
      );

      expect(result.totalMessages).toBe(2);
      expect(result.successfulMessages).toBe(0);
      expect(result.failedMessages).toBe(2);
      expect(result.successfulMessages + result.failedMessages).toBe(result.totalMessages);

      mockSendMessage.mockRestore();
    });

    test('cancelMessagesForEvent cancels only pending and pending_confirmation messages', async () => {
      const mockMessages: Message[] = [
        {
          messageId: 'msg-pending', eventId: 'test-event-id', userId: 'user-1',
          recipientType: 'attendees', content: 'Pending msg', scheduledTime: new Date(),
          status: 'pending', recipientCount: 0, sentCount: 0,
          requiresConfirmation: false, createdAt: new Date()
        },
        {
          messageId: 'msg-pending-conf', eventId: 'test-event-id', userId: 'user-1',
          recipientType: 'attendees', content: 'Pending confirmation msg', scheduledTime: new Date(),
          status: 'pending_confirmation', recipientCount: 0, sentCount: 0,
          requiresConfirmation: true, createdAt: new Date()
        },
        {
          messageId: 'msg-sent', eventId: 'test-event-id', userId: 'user-1',
          recipientType: 'attendees', content: 'Sent msg', scheduledTime: new Date(),
          status: 'sent', recipientCount: 10, sentCount: 10,
          requiresConfirmation: false, createdAt: new Date()
        },
        {
          messageId: 'msg-failed', eventId: 'test-event-id', userId: 'user-1',
          recipientType: 'non_rsvp_members', content: 'Failed msg', scheduledTime: new Date(),
          status: 'failed', recipientCount: 5, sentCount: 0,
          requiresConfirmation: false, createdAt: new Date()
        }
      ];

      const mockGetMessagesByEvent = jest.spyOn(MessagingService as any, 'getMessagesByEvent')
        .mockResolvedValue(mockMessages);
      const mockUpdateMessageStatus = jest.spyOn(MessagingService as any, 'updateMessageStatus')
        .mockResolvedValue(undefined);

      await MessagingService.cancelMessagesForEvent('test-event-id');

      expect(mockGetMessagesByEvent).toHaveBeenCalledWith('test-event-id');
      // Only pending and pending_confirmation should be cancelled
      expect(mockUpdateMessageStatus).toHaveBeenCalledTimes(2);
      expect(mockUpdateMessageStatus).toHaveBeenCalledWith('msg-pending', 'cancelled');
      expect(mockUpdateMessageStatus).toHaveBeenCalledWith('msg-pending-conf', 'cancelled');
      // Should NOT cancel sent or failed messages
      expect(mockUpdateMessageStatus).not.toHaveBeenCalledWith('msg-sent', 'cancelled');
      expect(mockUpdateMessageStatus).not.toHaveBeenCalledWith('msg-failed', 'cancelled');

      mockGetMessagesByEvent.mockRestore();
      mockUpdateMessageStatus.mockRestore();
    });

    test('confirmMessagesForEvent changes pending_confirmation to pending', async () => {
      const mockMessages: Message[] = [
        {
          messageId: 'msg-conf-1', eventId: 'test-event-id', userId: 'user-1',
          recipientType: 'attendees', content: 'Msg 1', scheduledTime: new Date(),
          status: 'pending_confirmation', recipientCount: 0, sentCount: 0,
          requiresConfirmation: true, createdAt: new Date()
        },
        {
          messageId: 'msg-conf-2', eventId: 'test-event-id', userId: 'user-1',
          recipientType: 'non_rsvp_members', content: 'Msg 2', scheduledTime: new Date(),
          status: 'pending_confirmation', recipientCount: 0, sentCount: 0,
          requiresConfirmation: true, createdAt: new Date()
        },
        {
          messageId: 'msg-already-pending', eventId: 'test-event-id', userId: 'user-1',
          recipientType: 'attendees', content: 'Msg 3', scheduledTime: new Date(),
          status: 'pending', recipientCount: 0, sentCount: 0,
          requiresConfirmation: false, createdAt: new Date()
        }
      ];

      const mockGetMessagesByEvent = jest.spyOn(MessagingService as any, 'getMessagesByEvent')
        .mockResolvedValue(mockMessages);
      const mockUpdateMessageStatus = jest.spyOn(MessagingService as any, 'updateMessageStatus')
        .mockResolvedValue(undefined);

      await MessagingService.confirmMessagesForEvent('test-event-id');

      expect(mockGetMessagesByEvent).toHaveBeenCalledWith('test-event-id');
      // Only pending_confirmation messages should be confirmed
      expect(mockUpdateMessageStatus).toHaveBeenCalledTimes(2);
      expect(mockUpdateMessageStatus).toHaveBeenCalledWith('msg-conf-1', 'pending');
      expect(mockUpdateMessageStatus).toHaveBeenCalledWith('msg-conf-2', 'pending');
      // Already pending message should not be updated
      expect(mockUpdateMessageStatus).not.toHaveBeenCalledWith('msg-already-pending', 'pending');

      mockGetMessagesByEvent.mockRestore();
      mockUpdateMessageStatus.mockRestore();
    });

    test('error messages are captured in delivery results', async () => {
      const mockSendMessage = jest.spyOn(MessagingService, 'sendMessage');

      mockSendMessage
        .mockResolvedValueOnce({ success: true, messageId: 'ext-1', recipientCount: 5, sentCount: 5 })
        .mockResolvedValueOnce({ success: false, errorMessage: 'Network timeout' })
        .mockResolvedValueOnce({ success: false, errorMessage: 'Rate limit exceeded' });

      const messages: Message[] = [
        {
          messageId: 'msg-ok', eventId: 'evt-1', userId: 'user-1', recipientType: 'attendees',
          content: 'OK', scheduledTime: new Date(), status: 'pending',
          recipientCount: 0, sentCount: 0, requiresConfirmation: false, createdAt: new Date()
        },
        {
          messageId: 'msg-err-1', eventId: 'evt-2', userId: 'user-1', recipientType: 'attendees',
          content: 'Err 1', scheduledTime: new Date(), status: 'pending',
          recipientCount: 0, sentCount: 0, requiresConfirmation: false, createdAt: new Date()
        },
        {
          messageId: 'msg-err-2', eventId: 'evt-3', userId: 'user-1', recipientType: 'non_rsvp_members',
          content: 'Err 2', scheduledTime: new Date(), status: 'pending',
          recipientCount: 0, sentCount: 0, requiresConfirmation: false, createdAt: new Date()
        }
      ];

      const result = await MessagingService.sendMessages(
        messages,
        mockMeetupClient,
        'test-group'
      );

      expect(result.errors).toHaveLength(2);
      expect(result.errors.some(e => e.includes('msg-err-1') && e.includes('Network timeout'))).toBe(true);
      expect(result.errors.some(e => e.includes('msg-err-2') && e.includes('Rate limit exceeded'))).toBe(true);

      mockSendMessage.mockRestore();
    });

    test('scheduleMessage sets pending_confirmation status when manual confirmation enabled', async () => {
      const mockSaveMessage = jest.spyOn(MessagingService as any, 'saveMessage')
        .mockResolvedValue(undefined);

      const userWithConfirmation = {
        ...mockUserProfile,
        manualConfirmationEnabled: true
      };

      const result = await MessagingService.scheduleMessage({
        event: mockEvent,
        userProfile: userWithConfirmation,
        recipientType: 'attendees',
        scheduledTime: new Date(Date.now() + 86400000)
      });

      expect(result.error).toBeUndefined();
      expect(result.message.status).toBe('pending_confirmation');
      expect(result.message.requiresConfirmation).toBe(true);

      mockSaveMessage.mockRestore();
    });

    test('scheduleMessage handles database save errors gracefully', async () => {
      const mockSaveMessage = jest.spyOn(MessagingService as any, 'saveMessage')
        .mockRejectedValue(new Error('DynamoDB write capacity exceeded'));

      const result = await MessagingService.scheduleMessage({
        event: mockEvent,
        userProfile: mockUserProfile,
        recipientType: 'attendees',
        scheduledTime: new Date(Date.now() + 86400000)
      });

      expect(result.error).toBeDefined();
      expect(result.error).toContain('DynamoDB write capacity exceeded');

      mockSaveMessage.mockRestore();
    });

    test('cancelMessagesForEvent throws on database error', async () => {
      const mockGetMessagesByEvent = jest.spyOn(MessagingService as any, 'getMessagesByEvent')
        .mockRejectedValue(new Error('Database error'));

      await expect(
        MessagingService.cancelMessagesForEvent('test-event-id')
      ).rejects.toThrow('Failed to cancel messages for event test-event-id: Database error');

      mockGetMessagesByEvent.mockRestore();
    });
  });
});
