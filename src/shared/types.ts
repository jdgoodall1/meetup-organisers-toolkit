// Core data model interfaces

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
  expiresAt?: Date;
  encryptedData: string;
}

export interface NotificationSettings {
  email: boolean;
  inApp: boolean;
  successNotifications: boolean;
  errorNotifications: boolean;
  reminderNotifications: boolean;
}

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

export interface SyncRecord {
  syncId: string;
  userId: string;
  platform: 'meetup' | 'linkedin';
  lastSyncTime: Date;
  status: 'success' | 'failed' | 'in_progress';
  eventsImported: number;
  eventsUpdated: number;
  conflictsDetected: number;
  errorMessage?: string;
  createdAt: Date;
}

export interface SyncConflict {
  conflictId: string;
  eventId: string;
  userId: string;
  platform: 'meetup' | 'linkedin';
  conflictType: 'title_mismatch' | 'date_mismatch' | 'description_mismatch' | 'status_mismatch';
  localValue: string;
  externalValue: string;
  status: 'pending' | 'resolved_local' | 'resolved_external';
  createdAt: Date;
  resolvedAt?: Date;
}

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

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Lambda event types
export interface AuthenticatedEvent {
  userId: string;
  email: string;
  name: string;
}