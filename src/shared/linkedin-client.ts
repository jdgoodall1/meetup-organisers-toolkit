// LinkedIn API client with OAuth authentication and event management

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { EncryptedCredentials } from './types';

export interface LinkedInEvent {
  id?: string;
  name: string;
  description: string;
  startDateTime: string; // ISO 8601 format
  endDateTime?: string; // ISO 8601 format
  location?: {
    name: string;
    address?: string;
    city?: string;
    country?: string;
  };
  status?: 'draft' | 'published' | 'cancelled';
  visibility?: 'public' | 'members_only';
  organizationId?: string; // For company page events
  groupId?: string; // For group events
  eventType?: 'online' | 'in_person' | 'hybrid';
  registrationRequired?: boolean;
}

export interface LinkedInPost {
  id?: string;
  content: string;
  visibility: 'public' | 'connections' | 'logged_in_members';
  organizationId?: string; // For company page posts
  scheduledTime?: string; // ISO 8601 format for scheduled posts
  status?: 'draft' | 'published' | 'scheduled';
}

export interface LinkedInOrganization {
  id: string;
  name: string;
  type: 'company' | 'group';
  permissions: string[];
  canCreateEvents: boolean;
  canCreatePosts: boolean;
}

export interface LinkedInProfile {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  profilePicture?: string;
}

export class LinkedInApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'LinkedInApiError';
  }
}

export class LinkedInClient {
  private client: AxiosInstance;
  private accessToken: string;

  constructor(credentials: EncryptedCredentials) {
    this.accessToken = credentials.accessToken;
    
    this.client = axios.create({
      baseURL: 'https://api.linkedin.com/v2',
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const { status, data } = error.response;
          throw new LinkedInApiError(
            data.message || `HTTP ${status} error`,
            data.code || 'HTTP_ERROR',
            status,
            data
          );
        } else if (error.request) {
          throw new LinkedInApiError(
            'Network error - no response received',
            'NETWORK_ERROR'
          );
        } else {
          throw new LinkedInApiError(
            error.message || 'Unknown error',
            'UNKNOWN_ERROR'
          );
        }
      }
    );
  }

  /**
   * Get user's profile information
   */
  async getProfile(): Promise<LinkedInProfile> {
    try {
      const response: AxiosResponse<any> = await this.client.get(
        '/people/~:(id,firstName,lastName,emailAddress,profilePicture(displayImage~:playableStreams))'
      );

      const profile = response.data;
      return {
        id: profile.id,
        firstName: profile.firstName?.localized?.en_US || '',
        lastName: profile.lastName?.localized?.en_US || '',
        email: profile.emailAddress,
        profilePicture: profile.profilePicture?.displayImage?.elements?.[0]?.identifiers?.[0]?.identifier
      };
    } catch (error) {
      if (error instanceof LinkedInApiError) {
        throw error;
      }
      throw new LinkedInApiError(
        `Failed to get profile: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_PROFILE_ERROR'
      );
    }
  }

  /**
   * Get user's organizations (companies and groups) with permissions
   */
  async getOrganizations(): Promise<LinkedInOrganization[]> {
    try {
      // Get organizations where user has admin permissions
      const response: AxiosResponse<any> = await this.client.get(
        '/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,name,organizationType),roleAssignee,role))'
      );

      const organizations: LinkedInOrganization[] = [];

      if (response.data.elements) {
        for (const element of response.data.elements) {
          const org = element.organization;
          if (org) {
            // Check specific permissions for events and posts
            const permissions = await this.getOrganizationPermissions(org.id);
            
            organizations.push({
              id: org.id,
              name: org.name?.localized?.en_US || org.name || 'Unknown Organization',
              type: org.organizationType === 'COMPANY' ? 'company' : 'group',
              permissions: permissions,
              canCreateEvents: permissions.includes('CREATE_EVENTS'),
              canCreatePosts: permissions.includes('CREATE_POSTS')
            });
          }
        }
      }

      return organizations;
    } catch (error) {
      if (error instanceof LinkedInApiError) {
        throw error;
      }
      throw new LinkedInApiError(
        `Failed to get organizations: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_ORGANIZATIONS_ERROR'
      );
    }
  }

  /**
   * Get specific permissions for an organization
   */
  private async getOrganizationPermissions(organizationId: string): Promise<string[]> {
    try {
      // Check for event creation permissions
      const eventPermissions = await this.checkEventPermissions(organizationId);
      
      // Check for post creation permissions
      const postPermissions = await this.checkPostPermissions(organizationId);
      
      const permissions: string[] = [];
      if (eventPermissions) permissions.push('CREATE_EVENTS');
      if (postPermissions) permissions.push('CREATE_POSTS');
      
      return permissions;
    } catch (error) {
      // If permission check fails, assume no permissions
      return [];
    }
  }

  /**
   * Check if user can create events for an organization
   */
  private async checkEventPermissions(organizationId: string): Promise<boolean> {
    try {
      // LinkedIn doesn't have a direct event permissions endpoint
      // We'll try to get organization details and infer permissions
      const response = await this.client.get(`/organizations/${organizationId}`);
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if user can create posts for an organization
   */
  private async checkPostPermissions(organizationId: string): Promise<boolean> {
    try {
      // Check if we can access the organization's posts endpoint
      const response = await this.client.get(`/shares?q=owners&owners=urn:li:organization:${organizationId}&count=1`);
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create an event on LinkedIn (company page or group)
   * Note: LinkedIn's event API is limited and may require special permissions
   */
  async createEvent(eventData: LinkedInEvent): Promise<LinkedInEvent> {
    try {
      // LinkedIn's event creation is limited and varies by organization type
      // This is a simplified implementation
      const payload = {
        name: eventData.name,
        description: eventData.description,
        startDateTime: eventData.startDateTime,
        endDateTime: eventData.endDateTime,
        location: eventData.location,
        eventType: eventData.eventType || 'in_person',
        registrationRequired: eventData.registrationRequired || false,
        visibility: eventData.visibility || 'public'
      };

      let endpoint = '/events';
      if (eventData.organizationId) {
        endpoint = `/organizations/${eventData.organizationId}/events`;
      } else if (eventData.groupId) {
        endpoint = `/groups/${eventData.groupId}/events`;
      }

      const response: AxiosResponse<LinkedInEvent> = await this.client.post(
        endpoint,
        payload
      );

      return response.data;
    } catch (error) {
      if (error instanceof LinkedInApiError) {
        throw error;
      }
      throw new LinkedInApiError(
        `Failed to create event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_EVENT_ERROR'
      );
    }
  }

  /**
   * Create a social media post on LinkedIn
   */
  async createPost(postData: LinkedInPost): Promise<LinkedInPost> {
    try {
      const payload: any = {
        content: {
          contentEntities: [],
          title: postData.content.substring(0, 200), // LinkedIn title limit
          description: postData.content
        },
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: []
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': postData.visibility.toUpperCase()
        }
      };

      // Set the author (person or organization)
      if (postData.organizationId) {
        payload.author = `urn:li:organization:${postData.organizationId}`;
      } else {
        // Get current user's profile for personal posts
        const profile = await this.getProfile();
        payload.author = `urn:li:person:${profile.id}`;
      }

      const response: AxiosResponse<any> = await this.client.post(
        '/ugcPosts',
        payload
      );

      return {
        id: response.data.id,
        content: postData.content,
        visibility: postData.visibility,
        organizationId: postData.organizationId,
        status: 'published'
      };
    } catch (error) {
      if (error instanceof LinkedInApiError) {
        throw error;
      }
      throw new LinkedInApiError(
        `Failed to create post: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_POST_ERROR'
      );
    }
  }

  /**
   * Schedule a social media post on LinkedIn
   * Note: LinkedIn's scheduling API may require special permissions
   */
  async schedulePost(postData: LinkedInPost): Promise<LinkedInPost> {
    try {
      if (!postData.scheduledTime) {
        throw new LinkedInApiError('Scheduled time is required for scheduled posts', 'MISSING_SCHEDULED_TIME');
      }

      const payload: any = {
        content: {
          contentEntities: [],
          title: postData.content.substring(0, 200),
          description: postData.content
        },
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: []
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': postData.visibility.toUpperCase()
        },
        publishedAt: new Date(postData.scheduledTime).getTime() // Convert to timestamp
      };

      // Set the author
      if (postData.organizationId) {
        payload.author = `urn:li:organization:${postData.organizationId}`;
      } else {
        const profile = await this.getProfile();
        payload.author = `urn:li:person:${profile.id}`;
      }

      const response: AxiosResponse<any> = await this.client.post(
        '/ugcPosts',
        payload
      );

      return {
        id: response.data.id,
        content: postData.content,
        visibility: postData.visibility,
        organizationId: postData.organizationId,
        scheduledTime: postData.scheduledTime,
        status: 'scheduled'
      };
    } catch (error) {
      if (error instanceof LinkedInApiError) {
        throw error;
      }
      throw new LinkedInApiError(
        `Failed to schedule post: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SCHEDULE_POST_ERROR'
      );
    }
  }

  /**
   * Update an existing event
   */
  async updateEvent(eventId: string, updates: Partial<LinkedInEvent>): Promise<LinkedInEvent> {
    try {
      const response: AxiosResponse<LinkedInEvent> = await this.client.patch(
        `/events/${eventId}`,
        updates
      );

      return response.data;
    } catch (error) {
      if (error instanceof LinkedInApiError) {
        throw error;
      }
      throw new LinkedInApiError(
        `Failed to update event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UPDATE_EVENT_ERROR'
      );
    }
  }

  /**
   * Cancel an event
   */
  async cancelEvent(eventId: string): Promise<LinkedInEvent> {
    try {
      const response: AxiosResponse<LinkedInEvent> = await this.client.patch(
        `/events/${eventId}`,
        { status: 'cancelled' }
      );

      return response.data;
    } catch (error) {
      if (error instanceof LinkedInApiError) {
        throw error;
      }
      throw new LinkedInApiError(
        `Failed to cancel event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CANCEL_EVENT_ERROR'
      );
    }
  }

  /**
   * Get event details
   */
  async getEvent(eventId: string): Promise<LinkedInEvent> {
    try {
      const response: AxiosResponse<LinkedInEvent> = await this.client.get(
        `/events/${eventId}`
      );

      return response.data;
    } catch (error) {
      if (error instanceof LinkedInApiError) {
        throw error;
      }
      throw new LinkedInApiError(
        `Failed to get event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_EVENT_ERROR'
      );
    }
  }

  /**
   * Get events for an organization
   */
  async getOrganizationEvents(organizationId: string): Promise<LinkedInEvent[]> {
    try {
      const response: AxiosResponse<{ elements: LinkedInEvent[] }> = await this.client.get(
        `/organizations/${organizationId}/events`
      );

      return response.data.elements || [];
    } catch (error) {
      if (error instanceof LinkedInApiError) {
        throw error;
      }
      throw new LinkedInApiError(
        `Failed to get organization events: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_ORGANIZATION_EVENTS_ERROR'
      );
    }
  }
}