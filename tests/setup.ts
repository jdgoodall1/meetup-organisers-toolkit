// Jest test setup

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-cognito-identity-provider');

// Set test environment variables
process.env.EVENTS_TABLE = 'test-events';
process.env.USER_POOL_ID = 'test-user-pool';
process.env.USER_POOL_CLIENT_ID = 'test-client-id';
process.env.REGION = 'us-east-1';

// Global test timeout
jest.setTimeout(30000);