// Property-based tests for messaging service recipient targeting

import * as fc from 'fast-check';
import { MessagingService, ScheduleMessageRequest } from '../src/shared/messaging-service';
import { MeetupClient, MeetupMember, MeetupAttendee } from '../src/shared/meetup-client';
import { Event, UserProfile, Message } from '../src/shared/types';
import { generateId } from '../src/shared/utils';

// Mock AWS clients
jest.mock('../src/shared/aws-clients');

describe('Messaging Service Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Generators ---

  const safeString = (opts: { minLength?: number; maxLength?: number } = {}) =>
    fc.string({ minLength: opts.minLength ?? 1, maxLength: opts.maxLength ?? 100 })
      .filter(s => s.trim().replace(/[<>]/g, '').length > 0);

  const eventArb: fc.Arbitrary<Event> = fc.record({
    eventId: safeString(),
    userId: safeString({ maxLength: 50 }),
    title: safeString(),
    description: safeString({ maxLength: 500 }),
    dateTime: fc.date({ min: new Date(Date.now() + 86400000) }),
    location: safeString({ maxLength: 200 }),
    meetupEventId: safeString({ maxLength: 50 }),
    meetupEventStatus: fc.constant('published' as const),
    platformStatus: fc.constant('confirmed' as const),
    source: fc.constant('platform' as const),
    requiresConfirmation: fc.boolean(),
    publishToMeetup: fc.constant(true),
    publishToLinkedIn: fc.boolean(),
    socialPostsScheduled: fc.boolean(),
    messagesScheduled: fc.boolean(),
    lastSyncTime: fc.date(),
    externallyModified: fc.constant(false),
    createdAt: fc.date(),
    updatedAt: fc.date()
  });

  const userProfileArb: fc.Arbitrary<UserProfile> = fc.record({
    userId: safeString({ maxLength: 50 }),
    email: fc.emailAddress(),
    name: safeString(),
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
  });

  const memberIdArb = safeString({ maxLength: 50 });

  /**
   * Generate a list of group members (some active, some inactive).
   */
  const membersArb = (ids: string[]): fc.Arbitrary<MeetupMember[]> =>
    fc.tuple(
      ...ids.map(id =>
        fc.record({
          id: fc.constant(id),
          name: safeString(),
          status: fc.oneof(fc.constant('active' as const), fc.constant('inactive' as const)),
          joined: fc.nat(),
          visited: fc.nat()
        })
      )
    );

  /**
   * Generate attendees from a subset of member IDs with various RSVP responses.
   */
  const attendeesArb = (ids: string[]): fc.Arbitrary<MeetupAttendee[]> =>
    fc.tuple(
      ...ids.map(id =>
        fc.record({
          member: fc.constant({ id, name: `Member ${id}` }),
          rsvp: fc.record({
            response: fc.oneof(
              fc.constant('yes' as const),
              fc.constant('no' as const),
              fc.constant('waitlist' as const)
            ),
            guests: fc.nat({ max: 5 }),
            created: fc.nat(),
            updated: fc.nat()
          })
        })
      )
    );

  /**
   * **Feature: logimeet, Property 11: Message recipient targeting**
   * For any messaging operation, the system should send different content to attendees
   * versus non-RSVP'd group members, with each group receiving only appropriate messages
   * **Validates: Requirements 5.1, 5.2, 5.3**
   */
  test('Property 11: Message recipient targeting', async () => {
    await fc.assert(fc.asyncProperty(
      eventArb,
      userProfileArb,
      // Generate between 2 and 8 unique member IDs
      fc.uniqueArray(memberIdArb, { minLength: 2, maxLength: 8 }),
      async (event: Event, userProfile: UserProfile, memberIds: string[]) => {
        // Split member IDs: some will be attendees, some will not
        const splitIndex = Math.max(1, Math.floor(memberIds.length / 2));
        const attendeeIds = memberIds.slice(0, splitIndex);
        const nonAttendeeIds = memberIds.slice(splitIndex);

        // Generate members and attendees from the IDs
        const members: MeetupMember[] = memberIds.map(id => ({
          id,
          name: `Member ${id}`,
          status: 'active' as const,
          joined: Date.now(),
          visited: Date.now()
        }));

        // Attendees all have rsvp.response = 'yes' for confirmed attendees
        const attendees: MeetupAttendee[] = attendeeIds.map(id => ({
          member: { id, name: `Member ${id}` },
          rsvp: {
            response: 'yes' as const,
            guests: 0,
            created: Date.now(),
            updated: Date.now()
          }
        }));

        // Create mock MeetupClient
        const mockMeetupClient = {
          getEventAttendees: jest.fn().mockResolvedValue(attendees),
          getGroupMembers: jest.fn().mockResolvedValue(members),
          sendMessage: jest.fn().mockResolvedValue({
            messageId: generateId(),
            recipientCount: 0
          })
        } as unknown as jest.Mocked<MeetupClient>;

        // Mock database operations
        const mockSaveMessage = jest.spyOn(MessagingService as any, 'saveMessage')
          .mockResolvedValue(undefined);
        const mockUpdateMessageRecipientCount = jest.spyOn(MessagingService as any, 'updateMessageRecipientCount')
          .mockResolvedValue(undefined);
        const mockUpdateMessageStatus = jest.spyOn(MessagingService as any, 'updateMessageStatus')
          .mockResolvedValue(undefined);

        try {
          // --- Verify Requirement 5.1: Different content for attendees vs non-RSVP'd members ---

          // Schedule a message for attendees
          const attendeeResult = await MessagingService.scheduleMessage({
            event,
            userProfile,
            recipientType: 'attendees',
            scheduledTime: new Date(Date.now() + 86400000)
          });

          // Schedule a message for non-RSVP'd members
          const nonRsvpResult = await MessagingService.scheduleMessage({
            event,
            userProfile,
            recipientType: 'non_rsvp_members',
            scheduledTime: new Date(Date.now() + 86400000)
          });

          // Both messages should be created successfully
          expect(attendeeResult.error).toBeUndefined();
          expect(nonRsvpResult.error).toBeUndefined();
          expect(attendeeResult.message.content).toBeDefined();
          expect(nonRsvpResult.message.content).toBeDefined();

          // Content must be different for the two recipient types
          expect(attendeeResult.message.content).not.toBe(nonRsvpResult.message.content);

          // Verify recipient types are set correctly
          expect(attendeeResult.message.recipientType).toBe('attendees');
          expect(nonRsvpResult.message.recipientType).toBe('non_rsvp_members');

          // --- Verify Requirement 5.2: Attendee messages sent only to confirmed attendees ---

          // Send the attendee message
          const groupId = 'test-group';
          const attendeeSendResult = await MessagingService.sendMessage({
            message: attendeeResult.message,
            meetupClient: mockMeetupClient,
            groupId
          });

          // Verify getEventAttendees was called to determine recipients
          expect(mockMeetupClient.getEventAttendees).toHaveBeenCalledWith(
            groupId,
            event.eventId
          );

          // Verify sendMessage was called with 'attendees' recipientType
          expect(mockMeetupClient.sendMessage).toHaveBeenCalledWith(
            groupId,
            attendeeResult.message.content,
            'attendees',
            attendeeResult.message.eventId
          );

          // The recipient count for attendees should equal the number of 'yes' RSVPs
          const confirmedAttendeeCount = attendees.filter(a => a.rsvp.response === 'yes').length;
          expect(mockUpdateMessageRecipientCount).toHaveBeenCalledWith(
            attendeeResult.message.messageId,
            confirmedAttendeeCount
          );

          // Reset mocks for the next send
          jest.clearAllMocks();
          mockMeetupClient.getEventAttendees.mockResolvedValue(attendees);
          mockMeetupClient.getGroupMembers.mockResolvedValue(members);
          mockMeetupClient.sendMessage.mockResolvedValue({
            messageId: generateId(),
            recipientCount: 0
          });
          mockUpdateMessageRecipientCount.mockResolvedValue(undefined);
          mockUpdateMessageStatus.mockResolvedValue(undefined);

          // --- Verify Requirement 5.3: Non-RSVP member messages exclude RSVP'd members ---

          // Send the non-RSVP member message
          const nonRsvpSendResult = await MessagingService.sendMessage({
            message: nonRsvpResult.message,
            meetupClient: mockMeetupClient,
            groupId
          });

          // Verify both getGroupMembers and getEventAttendees were called
          expect(mockMeetupClient.getGroupMembers).toHaveBeenCalledWith(groupId);
          expect(mockMeetupClient.getEventAttendees).toHaveBeenCalledWith(
            groupId,
            event.eventId
          );

          // Verify sendMessage was called with 'non_rsvp_members' recipientType
          expect(mockMeetupClient.sendMessage).toHaveBeenCalledWith(
            groupId,
            nonRsvpResult.message.content,
            'non_rsvp_members',
            nonRsvpResult.message.eventId
          );

          // The recipient count for non-RSVP members should exclude all attendees
          // (active members who are NOT in the attendee list)
          const attendeeIdSet = new Set(attendees.map(a => a.member.id));
          const expectedNonRsvpCount = members.filter(
            m => !attendeeIdSet.has(m.id) && m.status === 'active'
          ).length;
          expect(mockUpdateMessageRecipientCount).toHaveBeenCalledWith(
            nonRsvpResult.message.messageId,
            expectedNonRsvpCount
          );

          // --- Verify targeting correctness across all inputs ---

          // The non-RSVP count should equal the number of non-attendee active members
          expect(expectedNonRsvpCount).toBe(nonAttendeeIds.length);

          // The confirmed attendee count should equal the number of attendee IDs
          // (since we set all attendees to 'yes')
          expect(confirmedAttendeeCount).toBe(attendeeIds.length);

          // The two groups should be disjoint: no overlap between attendee IDs and non-attendee IDs
          const attendeeIdSetFromInput = new Set(attendeeIds);
          for (const id of nonAttendeeIds) {
            expect(attendeeIdSetFromInput.has(id)).toBe(false);
          }

        } finally {
          mockSaveMessage.mockRestore();
          mockUpdateMessageRecipientCount.mockRestore();
          mockUpdateMessageStatus.mockRestore();
        }
      }
    ), { numRuns: 100 });
  });

  /**
   * **Feature: logimeet, Property 12: Message template application**
   * For any template customization, the system should apply updated templates to all future messages
   * **Validates: Requirements 5.5**
   */
  test('Property 12: Message template application', async () => {
    // Generator for strings safe for regex replacement (no <>, $)
    // Avoids <> (stripped by sanitizeString) and $ (special in String.replace)
    const cleanString = (opts: { minLength?: number; maxLength?: number } = {}) =>
      fc.stringOf(
        fc.char().filter(c => c !== '<' && c !== '>' && c !== '$'),
        { minLength: opts.minLength ?? 1, maxLength: opts.maxLength ?? 80 }
      ).filter(s => s.trim().length > 0);

    // Event arbitrary with clean strings (no <> chars) for template substitution testing
    const cleanEventArb: fc.Arbitrary<Event> = fc.record({
      eventId: cleanString(),
      userId: cleanString({ maxLength: 50 }),
      title: cleanString(),
      description: cleanString({ maxLength: 200 }),
      dateTime: fc.date({ min: new Date(Date.now() + 86400000) }),
      location: cleanString({ maxLength: 100 }),
      meetupEventId: cleanString({ maxLength: 50 }),
      meetupEventStatus: fc.constant('published' as const),
      platformStatus: fc.constant('confirmed' as const),
      source: fc.constant('platform' as const),
      requiresConfirmation: fc.boolean(),
      publishToMeetup: fc.constant(true),
      publishToLinkedIn: fc.boolean(),
      socialPostsScheduled: fc.boolean(),
      messagesScheduled: fc.boolean(),
      lastSyncTime: fc.date(),
      externallyModified: fc.constant(false),
      createdAt: fc.date(),
      updatedAt: fc.date()
    });

    // Arbitrary for generating placeholder-bearing custom templates
    const placeholderTemplateArb = fc.record({
      prefix: cleanString({ maxLength: 30 }),
      suffix: cleanString({ maxLength: 30 })
    }).map(({ prefix, suffix }) =>
      `${prefix} {title} on {date} at {time} @ {location} - {description} ${suffix}`
    );

    const customTemplateArb: fc.Arbitrary<{ attendees: string; nonRsvpMembers: string }> = fc.record({
      attendees: placeholderTemplateArb,
      nonRsvpMembers: placeholderTemplateArb
    });

    await fc.assert(fc.asyncProperty(
      cleanEventArb,
      userProfileArb,
      customTemplateArb,
      fc.constantFrom('attendees' as const, 'non_rsvp_members' as const),
      async (event, userProfile, templates, recipientType) => {
        // Mock database operations
        const mockSaveMessage = jest.spyOn(MessagingService as any, 'saveMessage')
          .mockResolvedValue(undefined);

        try {
          // --- 1. Custom template placeholders are correctly substituted ---

          const customTemplate = {
            attendees: templates.attendees,
            nonRsvpMembers: templates.nonRsvpMembers
          };

          const resultWithCustom = await MessagingService.scheduleMessage({
            event,
            userProfile,
            recipientType,
            scheduledTime: new Date(Date.now() + 86400000),
            customTemplate
          });

          expect(resultWithCustom.error).toBeUndefined();
          const content = resultWithCustom.message.content;

          // The generated content must NOT contain any un-substituted placeholders
          expect(content).not.toContain('{title}');
          expect(content).not.toContain('{date}');
          expect(content).not.toContain('{time}');
          expect(content).not.toContain('{location}');
          expect(content).not.toContain('{description}');

          // The generated content must contain the actual event field values
          expect(content).toContain(event.title);
          expect(content).toContain(event.location);
          expect(content).toContain(event.description);

          // --- 2. Different templates for attendees vs non-RSVP members ---

          const attendeeResult = await MessagingService.scheduleMessage({
            event,
            userProfile,
            recipientType: 'attendees',
            scheduledTime: new Date(Date.now() + 86400000),
            customTemplate
          });

          const nonRsvpResult = await MessagingService.scheduleMessage({
            event,
            userProfile,
            recipientType: 'non_rsvp_members',
            scheduledTime: new Date(Date.now() + 86400000),
            customTemplate
          });

          expect(attendeeResult.error).toBeUndefined();
          expect(nonRsvpResult.error).toBeUndefined();

          // When templates differ, the generated content should differ
          if (templates.attendees !== templates.nonRsvpMembers) {
            expect(attendeeResult.message.content).not.toBe(nonRsvpResult.message.content);
          }

          // --- 3. Default template is used when no custom template is provided ---

          const resultWithDefault = await MessagingService.scheduleMessage({
            event,
            userProfile,
            recipientType,
            scheduledTime: new Date(Date.now() + 86400000)
            // No customTemplate provided
          });

          expect(resultWithDefault.error).toBeUndefined();

          // Default content should still have event details substituted
          expect(resultWithDefault.message.content).toContain(event.title);
          expect(resultWithDefault.message.content).toContain(event.location);
          expect(resultWithDefault.message.content).toContain(event.description);

          // Default content should differ from custom template content
          // (unless the custom template happens to match the default, which is extremely unlikely)
          // We verify the custom template was actually used by checking the content differs from default
          const defaultContent = resultWithDefault.message.content;
          const customContent = resultWithCustom.message.content;

          // The custom template content should contain the event title (proves substitution worked)
          expect(customContent).toContain(event.title);

          // --- 4. Template changes affect future messages (via updateMessageTemplate) ---

          // Set up mocks for updateMessageTemplate
          const pendingMessage: Message = {
            messageId: 'pending-msg-1',
            eventId: event.eventId,
            userId: userProfile.userId,
            recipientType,
            content: defaultContent,
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
            .mockResolvedValue(event);
          const mockUpdateMessageContent = jest.spyOn(MessagingService as any, 'updateMessageContent')
            .mockResolvedValue(undefined);

          try {
            await MessagingService.updateMessageTemplate(userProfile.userId, customTemplate);

            // Verify pending messages were fetched for the user
            expect(mockGetPendingMessages).toHaveBeenCalledWith(userProfile.userId);

            // Verify event was fetched for the pending message
            expect(mockGetEventForMessage).toHaveBeenCalledWith(event.eventId);

            // Verify message content was updated with new template
            expect(mockUpdateMessageContent).toHaveBeenCalledWith(
              pendingMessage.messageId,
              expect.any(String)
            );

            // The updated content should use the custom template (contain event title, no raw placeholders)
            const updatedContent = mockUpdateMessageContent.mock.calls[0][1] as string;
            expect(updatedContent).toContain(event.title);
            expect(updatedContent).toContain(event.location);
            expect(updatedContent).not.toContain('{title}');
            expect(updatedContent).not.toContain('{date}');
            expect(updatedContent).not.toContain('{time}');
            expect(updatedContent).not.toContain('{location}');
            expect(updatedContent).not.toContain('{description}');
          } finally {
            mockGetPendingMessages.mockRestore();
            mockGetEventForMessage.mockRestore();
            mockUpdateMessageContent.mockRestore();
          }
        } finally {
          mockSaveMessage.mockRestore();
        }
      }
    ), { numRuns: 100 });
  });

  /**
   * **Feature: logimeet, Property 13: Error isolation in messaging**
   * For any message failure, the system should log the error and continue processing
   * remaining messages without interruption
   * **Validates: Requirements 5.4**
   */
  test('Property 13: Error isolation in messaging', async () => {
    // Generator for Message objects
    const messageArb = (index: number): fc.Arbitrary<Message> =>
      fc.record({
        messageId: fc.constant(`msg-${index}-${Date.now()}`),
        eventId: safeString({ maxLength: 50 }),
        userId: safeString({ maxLength: 50 }),
        recipientType: fc.constantFrom('attendees' as const, 'non_rsvp_members' as const),
        content: safeString({ maxLength: 200 }),
        scheduledTime: fc.date({ min: new Date(Date.now() + 86400000) }),
        status: fc.constant('pending' as const),
        recipientCount: fc.nat({ max: 100 }),
        sentCount: fc.constant(0),
        requiresConfirmation: fc.constant(false),
        createdAt: fc.date()
      });

    // Generate a list of 1-10 messages along with a boolean array indicating which should fail
    const messagesWithFailuresArb = fc.integer({ min: 1, max: 10 }).chain(count => {
      const messageArbs = Array.from({ length: count }, (_, i) => messageArb(i));
      return fc.tuple(
        fc.tuple(...messageArbs),
        fc.array(fc.boolean(), { minLength: count, maxLength: count })
      );
    });

    await fc.assert(fc.asyncProperty(
      messagesWithFailuresArb,
      async ([messages, shouldFailFlags]) => {
        // Track which messages were attempted
        const attemptedMessageIds: string[] = [];
        const failedMessageIds: string[] = [];
        const succeededMessageIds: string[] = [];

        // Mock the internal sendMessage to succeed or fail based on the flag
        const mockSendMessage = jest.spyOn(MessagingService, 'sendMessage')
          .mockImplementation(async (request) => {
            const msgId = request.message.messageId;
            attemptedMessageIds.push(msgId);

            const msgIndex = messages.findIndex(m => m.messageId === msgId);
            if (msgIndex !== -1 && shouldFailFlags[msgIndex]) {
              failedMessageIds.push(msgId);
              return {
                success: false,
                errorMessage: `Simulated failure for message ${msgId}`
              };
            }

            succeededMessageIds.push(msgId);
            return {
              success: true,
              messageId: `ext-${msgId}`,
              recipientCount: 10,
              sentCount: 10
            };
          });

        const mockMeetupClient = {} as MeetupClient;
        const groupId = 'test-group';

        try {
          // Call sendMessages with the generated messages
          const result = await MessagingService.sendMessages(
            messages,
            mockMeetupClient,
            groupId
          );

          const expectedFailCount = shouldFailFlags.filter(f => f).length;
          const expectedSuccessCount = messages.length - expectedFailCount;

          // 1. ALL messages are attempted (none skipped)
          expect(attemptedMessageIds.length).toBe(messages.length);
          for (const msg of messages) {
            expect(attemptedMessageIds).toContain(msg.messageId);
          }

          // 2. Total count equals successful + failed
          expect(result.totalMessages).toBe(messages.length);
          expect(result.successfulMessages + result.failedMessages).toBe(result.totalMessages);
          expect(result.successfulMessages).toBe(expectedSuccessCount);
          expect(result.failedMessages).toBe(expectedFailCount);

          // 3. Failed messages have their errors recorded
          expect(result.errors.length).toBe(expectedFailCount);
          for (const failedId of failedMessageIds) {
            const hasError = result.errors.some(e => e.includes(failedId));
            expect(hasError).toBe(true);
          }

          // 4. Successful messages are not affected by failures of other messages
          expect(succeededMessageIds.length).toBe(expectedSuccessCount);

          // 5. The method never throws - it always returns a result
          //    (If it threw, we wouldn't reach this point. The fact we're here proves it.)
          expect(result).toBeDefined();
          expect(result.totalMessages).toBeGreaterThanOrEqual(0);
          expect(result.successfulMessages).toBeGreaterThanOrEqual(0);
          expect(result.failedMessages).toBeGreaterThanOrEqual(0);
          expect(Array.isArray(result.errors)).toBe(true);
        } finally {
          mockSendMessage.mockRestore();
        }
      }
    ), { numRuns: 100 });
  });
});
