// AWS SDK client configurations

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { SQSClient } from '@aws-sdk/client-sqs';
import { config } from './config';

// DynamoDB client with document client wrapper
const dynamoClient = new DynamoDBClient({ region: config.region });
export const dynamoDocClient = DynamoDBDocumentClient.from(dynamoClient);

// Cognito client
export const cognitoClient = new CognitoIdentityProviderClient({ region: config.region });

// EventBridge client
export const eventBridgeClient = new EventBridgeClient({ region: config.region });

// SQS client
export const sqsClient = new SQSClient({ region: config.region });

// Client configuration options
export const clientConfig = {
  region: config.region,
  maxAttempts: 3,
};