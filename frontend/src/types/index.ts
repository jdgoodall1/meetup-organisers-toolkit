// User and Authentication Types
export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  meetupCredentials?: EncryptedCredentials;
  linkedinCredentials?: EncryptedCredentials;
  notificationPreferences: NotificationSettings;
  manualConfirmationEnabled: boolean;
  lastSyncTime: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface EncryptedCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

export interface NotificationSettings {
  email: boolean;
  inApp: boolean;
  successNotifications: boolean;
  errorNotifications: boolean;
  reminderNotifications: boolean;
}

// Event Types
export interface Event {
  eventId: string;
  userId: string;
  title: string;
  description: string;
  dateTime: Date;
  location: string;
  meetupEventId?: string;
  meetupEventStatus: 'draft' | 'published' | 'cancelled';
  linkedinEventId?: string;
  linkedinEventStatus?: 'draft' | 'published' | 'cancelled';
  platformStatus: 'pending_confirmation' | 'confirmed' | 'cancelled';
  source: 'platform' | 'meetup_import' | 'linkedin_import';
  requiresConfirmation: boolean;
  publishToMeetup: boolean;
  publishToLinkedIn: boolean;
  socialPostsScheduled: boolean;
  messagesScheduled: boolean;
  lastSyncTime: Date;
  externallyModified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Social Media Types
export interface ScheduledPost {
  postId: string;
  eventId: string;
  userId: string;
  platform: 'linkedin';
  content: string;
  scheduledTime: Date;
  status: 'pending' | 'pending_confirmation' | 'published' | 'failed' | 'cancelled';
  externalPostId?: string;
  errorMessage?: string;
  requiresConfirmation: boolean;
  createdAt: Date;
}

// Messaging Types
export interface Message {
  messageId: string;
  eventId: string;
  userId: string;
  recipientType: 'attendees' | 'non_rsvp_members';
  content: string;
  scheduledTime: Date;
  status: 'pending' | 'pending_confirmation' | 'sent' | 'failed' | 'cancelled';
  recipientCount: number;
  sentCount: number;
  errorMessage?: string;
  requiresConfirmation: boolean;
  createdAt: Date;
}

export interface MessageTemplate {
  templateId: string;
  name: string;
  recipientType: 'attendees' | 'non_rsvp_members';
  content: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Notification Types
export interface Notification {
  notificationId: string;
  userId: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  read: boolean;
  createdAt: Date;
}

// Authentication Context Types
export interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

// Form Types
export interface EventFormData {
  title: string;
  description: string;
  dateTime: string;
  location: string;
  publishToMeetup: boolean;
  publishToLinkedIn: boolean;
  requiresConfirmation: boolean;
}

export interface MessageTemplateFormData {
  name: string;
  recipientType: 'attendees' | 'non_rsvp_members';
  content: string;
  isDefault: boolean;
}