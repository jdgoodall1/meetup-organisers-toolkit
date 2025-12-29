// Meetup.com API client with authentication and event management

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { EncryptedCredentials } from './types';

export interface MeetupEvent {
  id?: string;
  name: string;
  description: string;
  time: number; // Unix timestamp in milliseconds
  duration?: number; // Duration in milliseconds
  venue?: {
    name: string;
    address_1?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  status?: 'draft' | 'published' | 'cancelled';
  visibility?: 'public' | 'public_limited' | 'members';
  group_id?: string;
  how_to_find_us?: string;
  guest_limit?: number;
}

export interface MeetupGroup {
  id: string;
  name: string;
  urlname: string;
  description?: string;
  members: number;
  status: string;
}

export interface MeetupMember {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  joined: number;
  visited: number;
  role?: string;
}

export interface MeetupAttendee {
  member: {
    id: string;
    name: string;
  };
  rsvp: {
    response: 'yes' | 'no' | 'waitlist';
    guests: number;
    created: number;
    updated: number;
  };
}

export interface MeetupApiError {
  code: string;
  message: string;
  details?: any;
}

export class MeetupApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'MeetupApiError';
  }
}

export class MeetupClient {
  private client: AxiosInstance;
  private accessToken: string;

  constructor(credentials: EncryptedCredentials) {
    this.accessToken = credentials.accessToken;
    
    this.client = axios.create({
      baseURL: 'https://api.meetup.com',
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const { status, data } = error.response;
          throw new MeetupApiError(
            data.message || `HTTP ${status} error`,
            data.code || 'HTTP_ERROR',
            status,
            data
          );
        } else if (error.request) {
          throw new MeetupApiError(
            'Network error - no response received',
            'NETWORK_ERROR'
          );
        } else {
          throw new MeetupApiError(
            error.message || 'Unknown error',
            'UNKNOWN_ERROR'
          );
        }
      }
    );
  }

  /**
   * Create a new event on Meetup.com
   * @param groupId - The ID of the group to create the event in
   * @param eventData - Event details
   * @param isDraft - Whether to create as draft (default: false)
   */
  async createEvent(groupId: string, eventData: MeetupEvent, isDraft: boolean = false): Promise<MeetupEvent> {
    try {
      const payload = {
        ...eventData,
        group_id: groupId,
        status: isDraft ? 'draft' : 'published'
      };

      const response: AxiosResponse<MeetupEvent> = await this.client.post(
        `/${groupId}/events`,
        payload
      );

      return response.data;
    } catch (error) {
      if (error instanceof MeetupApiError) {
        throw error;
      }
      throw new MeetupApiError(
        `Failed to create event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_EVENT_ERROR'
      );
    }
  }

  /**
   * Publish a draft event
   * @param groupId - The ID of the group
   * @param eventId - The ID of the draft event to publish
   */
  async publishDraftEvent(groupId: string, eventId: string): Promise<MeetupEvent> {
    try {
      const response: AxiosResponse<MeetupEvent> = await this.client.patch(
        `/${groupId}/events/${eventId}`,
        { status: 'published' }
      );

      return response.data;
    } catch (error) {
      if (error instanceof MeetupApiError) {
        throw error;
      }
      throw new MeetupApiError(
        `Failed to publish draft event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PUBLISH_EVENT_ERROR'
      );
    }
  }

  /**
   * Update an existing event
   * @param groupId - The ID of the group
   * @param eventId - The ID of the event to update
   * @param updates - Event updates
   */
  async updateEvent(groupId: string, eventId: string, updates: Partial<MeetupEvent>): Promise<MeetupEvent> {
    try {
      const response: AxiosResponse<MeetupEvent> = await this.client.patch(
        `/${groupId}/events/${eventId}`,
        updates
      );

      return response.data;
    } catch (error) {
      if (error instanceof MeetupApiError) {
        throw error;
      }
      throw new MeetupApiError(
        `Failed to update event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UPDATE_EVENT_ERROR'
      );
    }
  }

  /**
   * Cancel an event
   * @param groupId - The ID of the group
   * @param eventId - The ID of the event to cancel
   */
  async cancelEvent(groupId: string, eventId: string): Promise<MeetupEvent> {
    try {
      const response: AxiosResponse<MeetupEvent> = await this.client.patch(
        `/${groupId}/events/${eventId}`,
        { status: 'cancelled' }
      );

      return response.data;
    } catch (error) {
      if (error instanceof MeetupApiError) {
        throw error;
      }
      throw new MeetupApiError(
        `Failed to cancel event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CANCEL_EVENT_ERROR'
      );
    }
  }

  /**
   * Get event details
   * @param groupId - The ID of the group
   * @param eventId - The ID of the event
   */
  async getEvent(groupId: string, eventId: string): Promise<MeetupEvent> {
    try {
      const response: AxiosResponse<MeetupEvent> = await this.client.get(
        `/${groupId}/events/${eventId}`
      );

      return response.data;
    } catch (error) {
      if (error instanceof MeetupApiError) {
        throw error;
      }
      throw new MeetupApiError(
        `Failed to get event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_EVENT_ERROR'
      );
    }
  }

  /**
   * Get all events for a group
   * @param groupId - The ID of the group
   * @param status - Filter by event status (optional)
   */
  async getGroupEvents(groupId: string, status?: 'draft' | 'published' | 'cancelled'): Promise<MeetupEvent[]> {
    try {
      const params: any = {};
      if (status) {
        params.status = status;
      }

      const response: AxiosResponse<{ events: MeetupEvent[] }> = await this.client.get(
        `/${groupId}/events`,
        { params }
      );

      return response.data.events || [];
    } catch (error) {
      if (error instanceof MeetupApiError) {
        throw error;
      }
      throw new MeetupApiError(
        `Failed to get group events: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_GROUP_EVENTS_ERROR'
      );
    }
  }

  /**
   * Get group members
   * @param groupId - The ID of the group
   */
  async getGroupMembers(groupId: string): Promise<MeetupMember[]> {
    try {
      const response: AxiosResponse<{ members: MeetupMember[] }> = await this.client.get(
        `/${groupId}/members`
      );

      return response.data.members || [];
    } catch (error) {
      if (error instanceof MeetupApiError) {
        throw error;
      }
      throw new MeetupApiError(
        `Failed to get group members: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_GROUP_MEMBERS_ERROR'
      );
    }
  }

  /**
   * Get event attendees (RSVPs)
   * @param groupId - The ID of the group
   * @param eventId - The ID of the event
   */
  async getEventAttendees(groupId: string, eventId: string): Promise<MeetupAttendee[]> {
    try {
      const response: AxiosResponse<{ attendees: MeetupAttendee[] }> = await this.client.get(
        `/${groupId}/events/${eventId}/rsvps`
      );

      return response.data.attendees || [];
    } catch (error) {
      if (error instanceof MeetupApiError) {
        throw error;
      }
      throw new MeetupApiError(
        `Failed to get event attendees: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_EVENT_ATTENDEES_ERROR'
      );
    }
  }

  /**
   * Get user's managed groups
   */
  async getManagedGroups(): Promise<MeetupGroup[]> {
    try {
      const response: AxiosResponse<{ groups: MeetupGroup[] }> = await this.client.get(
        '/self/groups',
        { params: { role: 'organizer' } }
      );

      return response.data.groups || [];
    } catch (error) {
      if (error instanceof MeetupApiError) {
        throw error;
      }
      throw new MeetupApiError(
        `Failed to get managed groups: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_MANAGED_GROUPS_ERROR'
      );
    }
  }

  /**
   * Send message to event attendees or group members
   * @param groupId - The ID of the group
   * @param eventId - The ID of the event (optional, for attendee-specific messages)
   * @param message - Message content
   * @param recipientType - Type of recipients
   */
  async sendMessage(
    groupId: string,
    message: string,
    recipientType: 'attendees' | 'non_rsvp_members',
    eventId?: string
  ): Promise<{ messageId: string; recipientCount: number }> {
    try {
      let endpoint: string;
      let payload: any = {
        message: message
      };

      if (recipientType === 'attendees' && eventId) {
        endpoint = `/${groupId}/events/${eventId}/messages`;
        payload.recipients = 'attendees';
      } else if (recipientType === 'non_rsvp_members') {
        endpoint = `/${groupId}/messages`;
        payload.recipients = 'members';
        if (eventId) {
          payload.exclude_rsvp_event_id = eventId;
        }
      } else {
        throw new MeetupApiError(
          'Invalid recipient type or missing event ID for attendee messages',
          'INVALID_RECIPIENT_TYPE'
        );
      }

      const response: AxiosResponse<{ id: string; recipient_count: number }> = await this.client.post(
        endpoint,
        payload
      );

      return {
        messageId: response.data.id,
        recipientCount: response.data.recipient_count
      };
    } catch (error) {
      if (error instanceof MeetupApiError) {
        throw error;
      }
      throw new MeetupApiError(
        `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SEND_MESSAGE_ERROR'
      );
    }
  }
}