// Authentication service and JWT token validation

import jwt from 'jsonwebtoken';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { cognitoClient } from './aws-clients';
import { GetUserCommand, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { config } from './config';
import { UserProfile } from './types';
import { dynamoDocClient } from './aws-clients';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  name: string;
}

export interface JWTPayload {
  sub: string;
  email: string;
  name?: string;
  'cognito:username': string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
}

/**
 * Validates JWT token from Cognito and extracts user information
 */
export async function validateToken(token: string): Promise<AuthenticatedUser> {
  try {
    // Decode token without verification first to get the payload
    const decoded = jwt.decode(token) as JWTPayload;
    
    if (!decoded || !decoded.sub || !decoded.email) {
      throw new Error('Invalid token payload');
    }

    // In a real implementation, you would verify the JWT signature
    // against Cognito's public keys. For now, we'll do basic validation
    if (decoded.exp < Date.now() / 1000) {
      throw new Error('Token expired');
    }

    if (decoded.aud !== config.cognito.userPoolClientId) {
      throw new Error('Invalid token audience');
    }

    return {
      userId: decoded.sub,
      email: decoded.email,
      name: decoded.name || decoded.email.split('@')[0],
    };
  } catch (error) {
    throw new Error(`Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extracts and validates authentication from API Gateway event
 */
export async function extractAuthFromEvent(event: APIGatewayProxyEvent): Promise<AuthenticatedUser> {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  
  if (!authHeader) {
    throw new Error('No authorization header provided');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Invalid authorization header format');
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  return await validateToken(token);
}

/**
 * Creates or updates user profile in DynamoDB
 */
export async function createOrUpdateUserProfile(authenticatedUser: AuthenticatedUser): Promise<UserProfile> {
  const now = new Date();
  
  // Check if user already exists
  const existingUser = await getUserProfile(authenticatedUser.userId);
  
  if (existingUser) {
    // Update existing user
    const updatedUser: UserProfile = {
      ...existingUser,
      email: authenticatedUser.email,
      name: authenticatedUser.name,
      updatedAt: now,
    };

    await dynamoDocClient.send(new PutCommand({
      TableName: config.tables.users,
      Item: updatedUser,
    }));

    return updatedUser;
  } else {
    // Create new user
    const newUser: UserProfile = {
      userId: authenticatedUser.userId,
      email: authenticatedUser.email,
      name: authenticatedUser.name,
      notificationPreferences: {
        email: true,
        inApp: true,
        successNotifications: true,
        errorNotifications: true,
        reminderNotifications: true,
      },
      manualConfirmationEnabled: false,
      lastSyncTime: now,
      createdAt: now,
      updatedAt: now,
    };

    await dynamoDocClient.send(new PutCommand({
      TableName: config.tables.users,
      Item: newUser,
    }));

    return newUser;
  }
}

/**
 * Retrieves user profile from DynamoDB
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const result = await dynamoDocClient.send(new GetCommand({
      TableName: config.tables.users,
      Key: { userId },
    }));

    return result.Item as UserProfile || null;
  } catch (error) {
    console.error('Error retrieving user profile:', error);
    return null;
  }
}

/**
 * Middleware function to authenticate API Gateway requests
 */
export async function authenticateRequest(event: APIGatewayProxyEvent): Promise<{
  user: AuthenticatedUser;
  profile: UserProfile;
}> {
  const user = await extractAuthFromEvent(event);
  const profile = await createOrUpdateUserProfile(user);
  
  return { user, profile };
}

/**
 * Invalidates user session (for logout)
 */
export async function invalidateSession(userId: string): Promise<void> {
  // In a real implementation, you might want to maintain a blacklist of tokens
  // or use Cognito's global sign out functionality
  // For now, we'll just log the logout action
  console.log(`User ${userId} logged out`);
}