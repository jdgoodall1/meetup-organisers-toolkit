// AWS SDK client configurations

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { S3Client } from '@aws-sdk/client-s3';
import { config } from './config';

// DynamoDB client with document client wrapper
const dynamoClient = new DynamoDBClient({ region: config.region });
export const dynamoDocClient = DynamoDBDocumentClient.from(dynamoClient);

// Cognito client
export const cognitoClient = new CognitoIdentityProviderClient({ region: config.region });

// Client configuration options
export const clientConfig = {
  region: config.region,
  maxAttempts: 3,
};
// S3 client (headshots)
export const s3Client = new S3Client({ region: config.region });

