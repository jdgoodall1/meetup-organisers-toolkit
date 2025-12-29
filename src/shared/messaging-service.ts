// Messaging service for Meetup.com attendee communication

import { Message, Event, UserProfile } from './types';
import { MessageModel } from './models';
import { MeetupClient, MeetupMember, MeetupAttendee } from './meetup-client';
import { generateId } from './utils';
import { dynamoDocClient } from './aws-clients';
import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { config } from './config';

export interface MessageTemplate {
  attendees?: string;
  nonRsvpMembers?: string;
}

export interface ScheduleMessageRequest {
  event: Event;
  userProfile: UserProfile;
  recipientType: 'attendees' | 'non_rsvp_members';
  scheduledTime: Date;
  customTemplate?: MessageTemplate;
}

export interface ScheduleMessageResult {
  message: Message;
  error?: string;
}

export interface SendMessageRequest {
  message: Message;
  meetupClient: MeetupClient;
  groupId: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  recipientCount?: number;
  sentCount?: number;
  errorMessage?: string;
}

export interface MessageDeliveryResult {
  totalMessages: number;
  successfulMessages: number;
  failedMessages: number;
  errors: string[];
}

export class MessagingService {
  /**
   * Schedule a message for an event
   */
  static async scheduleMessage(request: ScheduleMessageRequest): Promise<ScheduleMessageResult> {
    try {
      const { event, userProfile, recipientType, scheduledTime, customTemplate } = request;

      // Generate message content
      const content = this.generateMessageContent(event, recipientType, customTemplate);

      // Create message object
      const message = MessageModel.create({
        eventId: event.eventId,
        userId: event.userId,
        recipientType,
        content,
        scheduledTime,
        status: (event.requiresConfirmation || userProfile.manualConfirmationEnabled) 
          ? 'pending_confirmation' 
          : 'pending',
        requiresConfirmation: event.requiresConfirmation || userProfile.manualConfirmationEnabled,
        recipientCount: 0, // Will be updated when message is sent
        sentCount: 0
      });

      // Save to database
      await this.saveMessage(message);

      return { message };
    } catch (error) {
      return {
        message: {} as Message,
        error: `Failed to schedule message: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Send a scheduled message via Meetup.com API
   */
  static async sendMessage(request: SendMessageRequest): Promise<SendMessageResult> {
    try {
      const { message, meetupClient, groupId } = request;

      // Get recipient count before sending
      const recipientCount = await this.getRecipientCount(
        meetupClient,
        groupId,
        message.recipientType,
        message.eventId
      );

      // Update message with recipient count
      await this.updateMessageRecipientCount(message.messageId, recipientCount);

      // Send message via Meetup API
      const result = await meetupClient.sendMessage(
        groupId,
        message.content,
        message.recipientType,
        message.eventId
      );

      // Update message status to sent
      await this.updateMessageStatus(
        message.messageId,
        'sent',
        result.messageId,
        result.recipientCount
      );

      return {
        success: true,
        messageId: result.messageId,
        recipientCount: result.recipientCount,
        sentCount: result.recipientCount
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update message status to failed
      await this.updateMessageStatus(
        message.messageId,
        'failed',
        undefined,
        0,
        errorMessage
      );

      return {
        success: false,
        errorMessage
      };
    }
  }

  /**
   * Send multiple messages with error isolation
   */
  static async sendMessages(
    messages: Message[],
    meetupClient: MeetupClient,
    groupId: string
  ): Promise<MessageDeliveryResult> {
    const result: MessageDeliveryResult = {
      totalMessages: messages.length,
      successfulMessages: 0,
      failedMessages: 0,
      errors: []
    };

    // Process each message independently to ensure error isolation
    for (const message of messages) {
      try {
        const sendResult = await this.sendMessage({
          message,
          meetupClient,
          groupId
        });

        if (sendResult.success) {
          result.successfulMessages++;
        } else {
          result.failedMessages++;
          if (sendResult.errorMessage) {
            result.errors.push(`Message ${message.messageId}: ${sendResult.errorMessage}`);
          }
        }
      } catch (error) {
        result.failedMessages++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Message ${message.messageId}: ${errorMessage}`);
      }
    }

    return result;
  }

  /**
   * Get recipient count for a message type
   */
  private static async getRecipientCount(
    meetupClient: MeetupClient,
    groupId: string,
    recipientType: 'attendees' | 'non_rsvp_members',
    eventId?: string
  ): Promise<number> {
    try {
      if (recipientType === 'attendees' && eventId) {
        const attendees = await meetupClient.getEventAttendees(groupId, eventId);
        return attendees.filter(a => a.rsvp.response === 'yes').length;
      } else if (recipientType === 'non_rsvp_members') {
        const allMembers = await meetupClient.getGroupMembers(groupId);
        
        if (eventId) {
          const attendees = await meetupClient.getEventAttendees(groupId, eventId);
          const attendeeIds = new Set(attendees.map(a => a.member.id));
          return allMembers.filter(m => !attendeeIds.has(m.id) && m.status === 'active').length;
        } else {
          return allMembers.filter(m => m.status === 'active').length;
        }
      }
      
      return 0;
    } catch (error) {
      // Return 0 if we can't get recipient count
      return 0;
    }
  }

  /**
   * Generate message content based on event and recipient type
   */
  private static generateMessageContent(
    event: Event,
    recipientType: 'attendees' | 'non_rsvp_members',
    customTemplate?: MessageTemplate
  ): string {
    const eventDate = event.dateTime.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const eventTime = event.dateTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    if (recipientType === 'attendees') {
      const template = customTemplate?.attendees || 
        `Hi there! 👋\n\nJust a friendly reminder about our upcoming event:\n\n📅 {title}\n🗓️ {date} at {time}\n📍 {location}\n\n{description}\n\nLooking forward to seeing you there!\n\nBest regards,\nThe Organizers`;

      return template
        .replace(/{title}/g, event.title)
        .replace(/{date}/g, eventDate)
        .replace(/{time}/g, eventTime)
        .replace(/{location}/g, event.location)
        .replace(/{description}/g, event.description);
    } else {
      const template = customTemplate?.nonRsvpMembers || 
        `Hello! 👋\n\nWe have an exciting event coming up that you might be interested in:\n\n📅 {title}\n🗓️ {date} at {time}\n📍 {location}\n\n{description}\n\nWe'd love to have you join us! Please RSVP if you're interested.\n\nBest regards,\nThe Organizers`;

      return template
        .replace(/{title}/g, event.title)
        .replace(/{date}/g, eventDate)
        .replace(/{time}/g, eventTime)
        .replace(/{location}/g, event.location)
        .replace(/{description}/g, event.description);
    }
  }

  /**
   * Cancel messages for an event
   */
  static async cancelMessagesForEvent(eventId: string): Promise<void> {
    try {
      const messages = await this.getMessagesByEvent(eventId);
      
      // Cancel only pending and pending_confirmation messages
      const cancellableMessages = messages.filter(m => 
        m.status === 'pending' || m.status === 'pending_confirmation'
      );

      for (const message of cancellableMessages) {
        await this.updateMessageStatus(message.messageId, 'cancelled');
      }
    } catch (error) {
      throw new Error(`Failed to cancel messages for event ${eventId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Confirm messages for an event (change pending_confirmation to pending)
   */
  static async confirmMessagesForEvent(eventId: string): Promise<void> {
    try {
      const messages = await this.getMessagesByEvent(eventId);
      
      // Confirm only pending_confirmation messages
      const confirmableMessages = messages.filter(m => 
        m.status === 'pending_confirmation'
      );

      for (const message of confirmableMessages) {
        await this.updateMessageStatus(message.messageId, 'pending');
      }
    } catch (error) {
      throw new Error(`Failed to confirm messages for event ${eventId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update message template for future messages
   */
  static async updateMessageTemplate(
    userId: string,
    template: MessageTemplate
  ): Promise<void> {
    try {
      // Store template in user preferences or separate table
      // For now, we'll store it as part of user profile
      // This would typically be stored in a separate templates table
      
      // Get pending messages for this user
      const pendingMessages = await this.getPendingMessagesByUser(userId);
      
      // Update content for pending messages using new template
      for (const message of pendingMessages) {
        // Get event details to regenerate content
        const event = await this.getEventForMessage(message.eventId);
        if (event) {
          const newContent = this.generateMessageContent(
            event,
            message.recipientType,
            template
          );
          await this.updateMessageContent(message.messageId, newContent);
        }
      }
    } catch (error) {
      throw new Error(`Failed to update message template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get messages by event ID
   */
  private static async getMessagesByEvent(eventId: string): Promise<Message[]> {
    try {
      const result = await dynamoDocClient.send(new QueryCommand({
        TableName: config.tables.messages,
        IndexName: 'EventIndex',
        KeyConditionExpression: 'eventId = :eventId',
        ExpressionAttributeValues: {
          ':eventId': eventId
        }
      }));

      if (!result.Items) {
        return [];
      }

      return result.Items.map(item => MessageModel.deserialize(item));
    } catch (error) {
      throw new Error(`Failed to get messages for event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get pending messages by user ID
   */
  private static async getPendingMessagesByUser(userId: string): Promise<Message[]> {
    try {
      const result = await dynamoDocClient.send(new QueryCommand({
        TableName: config.tables.messages,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: '#status IN (:pending, :pendingConfirmation)',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'MESSAGE#',
          ':pending': 'pending',
          ':pendingConfirmation': 'pending_confirmation'
        }
      }));

      if (!result.Items) {
        return [];
      }

      return result.Items.map(item => {
        const { PK, SK, ...messageData } = item;
        return MessageModel.deserialize(messageData);
      });
    } catch (error) {
      throw new Error(`Failed to get pending messages for user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get event for message (helper method)
   */
  private static async getEventForMessage(eventId: string): Promise<Event | null> {
    // This would typically import EventModel, but to avoid circular dependencies
    // we'll implement a simple query here
    try {
      const result = await dynamoDocClient.send(new QueryCommand({
        TableName: config.tables.events,
        IndexName: 'EventIndex',
        KeyConditionExpression: 'eventId = :eventId',
        ExpressionAttributeValues: {
          ':eventId': eventId
        },
        Limit: 1
      }));

      if (!result.Items || result.Items.length === 0) {
        return null;
      }

      const { PK, SK, ...eventData } = result.Items[0];
      return {
        ...eventData,
        dateTime: new Date(eventData.dateTime),
        lastSyncTime: new Date(eventData.lastSyncTime),
        createdAt: new Date(eventData.createdAt),
        updatedAt: new Date(eventData.updatedAt)
      } as Event;
    } catch (error) {
      return null;
    }
  }

  /**
   * Save message to database
   */
  private static async saveMessage(message: Message): Promise<void> {
    const serializedMessage = MessageModel.serialize(message);
    
    await dynamoDocClient.send(new PutCommand({
      TableName: config.tables.messages,
      Item: {
        PK: `USER#${message.userId}`,
        SK: `MESSAGE#${message.messageId}`,
        ...serializedMessage
      }
    }));
  }

  /**
   * Update message status
   */
  private static async updateMessageStatus(
    messageId: string,
    status: Message['status'],
    externalMessageId?: string,
    sentCount?: number,
    errorMessage?: string
  ): Promise<void> {
    const updateExpression = ['#status = :status'];
    const expressionAttributeNames: Record<string, string> = {
      '#status': 'status'
    };
    const expressionAttributeValues: Record<string, any> = {
      ':status': status
    };

    if (externalMessageId !== undefined) {
      updateExpression.push('externalMessageId = :externalMessageId');
      expressionAttributeValues[':externalMessageId'] = externalMessageId;
    }

    if (sentCount !== undefined) {
      updateExpression.push('sentCount = :sentCount');
      expressionAttributeValues[':sentCount'] = sentCount;
    }

    if (errorMessage !== undefined) {
      updateExpression.push('errorMessage = :errorMessage');
      expressionAttributeValues[':errorMessage'] = errorMessage;
    }

    // We need to find the message first to get the PK
    // This is a limitation of the current design - we should store userId in the message
    // For now, we'll use a scan operation (not ideal for production)
    const result = await dynamoDocClient.send(new QueryCommand({
      TableName: config.tables.messages,
      IndexName: 'MessageIndex',
      KeyConditionExpression: 'messageId = :messageId',
      ExpressionAttributeValues: {
        ':messageId': messageId
      },
      Limit: 1
    }));

    if (!result.Items || result.Items.length === 0) {
      throw new Error(`Message ${messageId} not found`);
    }

    const message = result.Items[0];

    await dynamoDocClient.send(new UpdateCommand({
      TableName: config.tables.messages,
      Key: {
        PK: `USER#${message.userId}`,
        SK: `MESSAGE#${messageId}`
      },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames,
      ExpressionAttributeValues
    }));
  }

  /**
   * Update message recipient count
   */
  private static async updateMessageRecipientCount(
    messageId: string,
    recipientCount: number
  ): Promise<void> {
    // Find the message first
    const result = await dynamoDocClient.send(new QueryCommand({
      TableName: config.tables.messages,
      IndexName: 'MessageIndex',
      KeyConditionExpression: 'messageId = :messageId',
      ExpressionAttributeValues: {
        ':messageId': messageId
      },
      Limit: 1
    }));

    if (!result.Items || result.Items.length === 0) {
      throw new Error(`Message ${messageId} not found`);
    }

    const message = result.Items[0];

    await dynamoDocClient.send(new UpdateCommand({
      TableName: config.tables.messages,
      Key: {
        PK: `USER#${message.userId}`,
        SK: `MESSAGE#${messageId}`
      },
      UpdateExpression: 'SET recipientCount = :recipientCount',
      ExpressionAttributeValues: {
        ':recipientCount': recipientCount
      }
    }));
  }

  /**
   * Update message content
   */
  private static async updateMessageContent(
    messageId: string,
    content: string
  ): Promise<void> {
    // Find the message first
    const result = await dynamoDocClient.send(new QueryCommand({
      TableName: config.tables.messages,
      IndexName: 'MessageIndex',
      KeyConditionExpression: 'messageId = :messageId',
      ExpressionAttributeValues: {
        ':messageId': messageId
      },
      Limit: 1
    }));

    if (!result.Items || result.Items.length === 0) {
      throw new Error(`Message ${messageId} not found`);
    }

    const message = result.Items[0];

    await dynamoDocClient.send(new UpdateCommand({
      TableName: config.tables.messages,
      Key: {
        PK: `USER#${message.userId}`,
        SK: `MESSAGE#${messageId}`
      },
      UpdateExpression: 'SET content = :content',
      ExpressionAttributeValues: {
        ':content': content
      }
    }));
  }
}