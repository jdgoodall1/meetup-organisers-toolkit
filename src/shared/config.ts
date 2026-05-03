// Environment configuration and constants

export const config = {
  // DynamoDB table names from environment variables
  tables: {
    events: process.env.EVENTS_TABLE || 'events',
    users: process.env.USERS_TABLE || 'users',
    scheduledPosts: process.env.SCHEDULED_POSTS_TABLE || 'scheduled-posts',
    messages: process.env.MESSAGES_TABLE || 'messages',
    notifications: process.env.NOTIFICATIONS_TABLE || 'notifications',
    syncRecords: process.env.SYNC_RECORDS_TABLE || 'sync-records',
    syncConflicts: process.env.SYNC_CONFLICTS_TABLE || 'sync-conflicts',
  },

  // Cognito configuration
  cognito: {
    userPoolId: process.env.USER_POOL_ID || '',
    userPoolClientId: process.env.USER_POOL_CLIENT_ID || '',
  },

  // SQS configuration
  sqs: {
    schedulerQueueUrl: process.env.SCHEDULER_QUEUE_URL || '',
  },

  // AWS region
  region: process.env.REGION || process.env.AWS_REGION || 'us-east-1',

  // Social media posting schedule (in days before event)
  socialPostSchedule: [30, 14, 7, 3, 0], // 1 month, 2 weeks, 1 week, 3 days, day of

  // LinkedIn OAuth configuration
  linkedin: {
    clientId: process.env.LINKEDIN_CLIENT_ID || '',
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
    redirectUri: process.env.LINKEDIN_REDIRECT_URI || '',
  },

  // External API endpoints
  apis: {
    meetup: {
      baseUrl: 'https://api.meetup.com',
      version: '3',
    },
    linkedin: {
      baseUrl: 'https://api.linkedin.com',
      version: 'v2',
    },
  },

  // Sync configuration
  sync: {
    intervalMinutes: 15,
    maxRetries: 3,
    backoffMultiplier: 2,
  },

  // Notification configuration
  notifications: {
    fromEmail: process.env.FROM_EMAIL || 'noreply@meetup-platform.com',
    maxRetries: 3,
  },
};

// Validation function for required environment variables
export function validateConfig(): void {
  const required = [
    'EVENTS_TABLE',
    'USERS_TABLE',
    'USER_POOL_ID',
    'USER_POOL_CLIENT_ID',
    'SCHEDULER_QUEUE_URL',
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}