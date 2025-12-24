import { fetchAuthSession } from 'aws-amplify/auth';

const API_BASE_URL = import.meta.env.VITE_API_ENDPOINT || 'https://api.example.com/dev';

class ApiService {
  private async getAuthHeaders(): Promise<HeadersInit> {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      
      return {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
      };
    } catch (error) {
      console.error('Failed to get auth headers:', error);
      return {
        'Content-Type': 'application/json',
      };
    }
  }

  private async makeRequest<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const headers = await this.getAuthHeaders();
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  // Auth endpoints
  async getUserProfile() {
    return this.makeRequest('/auth/profile');
  }

  async updateUserProfile(profile: any) {
    return this.makeRequest('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
  }

  // Event endpoints
  async getEvents() {
    return this.makeRequest('/events');
  }

  async createEvent(eventData: any) {
    return this.makeRequest('/events', {
      method: 'POST',
      body: JSON.stringify(eventData),
    });
  }

  async updateEvent(eventId: string, eventData: any) {
    return this.makeRequest(`/events/${eventId}`, {
      method: 'PUT',
      body: JSON.stringify(eventData),
    });
  }

  async deleteEvent(eventId: string) {
    return this.makeRequest(`/events/${eventId}`, {
      method: 'DELETE',
    });
  }

  async confirmEvent(eventId: string) {
    return this.makeRequest(`/events/${eventId}/confirm`, {
      method: 'POST',
    });
  }

  // Social media endpoints
  async getScheduledPosts() {
    return this.makeRequest('/social/posts');
  }

  async schedulePost(postData: any) {
    return this.makeRequest('/social/schedule', {
      method: 'POST',
      body: JSON.stringify(postData),
    });
  }

  async cancelScheduledPost(postId: string) {
    return this.makeRequest(`/social/posts/${postId}`, {
      method: 'DELETE',
    });
  }

  // Messaging endpoints
  async getMessages() {
    return this.makeRequest('/messages');
  }

  async scheduleMessage(messageData: any) {
    return this.makeRequest('/messages/schedule', {
      method: 'POST',
      body: JSON.stringify(messageData),
    });
  }

  async updateMessageTemplates(templates: any) {
    return this.makeRequest('/messages/templates', {
      method: 'PUT',
      body: JSON.stringify(templates),
    });
  }

  // Notification endpoints
  async getNotifications() {
    return this.makeRequest('/notifications');
  }

  async updateNotificationPreferences(preferences: any) {
    return this.makeRequest('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
  }

  // Sync endpoints
  async getSyncStatus() {
    return this.makeRequest('/sync/status');
  }

  async triggerSync() {
    return this.makeRequest('/events/sync', {
      method: 'POST',
    });
  }

  async resolveSyncConflict(conflictId: string, resolution: any) {
    return this.makeRequest('/sync/resolve-conflict', {
      method: 'POST',
      body: JSON.stringify({ conflictId, ...resolution }),
    });
  }
}

export const apiService = new ApiService();
export default apiService;