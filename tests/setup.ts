// Jest test setup

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-cognito-identity-provider');
jest.mock('@aws-sdk/client-eventbridge');
jest.mock('@aws-sdk/client-sqs');

// Set test environment variables
process.env.EVENTS_TABLE = 'test-events';
process.env.USERS_TABLE = 'test-users';
process.env.SCHEDULED_POSTS_TABLE = 'test-scheduled-posts';
process.env.MESSAGES_TABLE = 'test-messages';
process.env.NOTIFICATIONS_TABLE = 'test-notifications';
process.env.SYNC_RECORDS_TABLE = 'test-sync-records';
process.env.SYNC_CONFLICTS_TABLE = 'test-sync-conflicts';
process.env.USER_POOL_ID = 'test-user-pool';
process.env.USER_POOL_CLIENT_ID = 'test-client-id';
process.env.SCHEDULER_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';
process.env.REGION = 'us-east-1';

// Global test timeout
jest.setTimeout(30000);