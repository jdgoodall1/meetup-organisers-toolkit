// Authentication API handlers

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { invalidateSession } from '../shared/auth';
import { createResponse, handleError } from '../shared/utils';
import { ApiResponse } from '../shared/types';
import { withAuthAndCors, AuthenticatedContext } from '../shared/middleware';
import { dynamoDocClient } from '../shared/aws-clients';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../shared/config';

/**
 * GET /auth/profile - Get current user profile
 */
async function getProfile(event: APIGatewayProxyEvent, context: AuthenticatedContext): Promise<APIGatewayProxyResult> {
  const response: ApiResponse = {
    success: true,
    data: context.profile,
    message: 'Profile retrieved successfully',
  };

  return createResponse(200, response);
}

/**
 * PUT /auth/profile - Update user profile
 */
async function updateProfile(event: APIGatewayProxyEvent, context: AuthenticatedContext): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    throw new Error('Request body is required');
  }

  const updates = JSON.parse(event.body);
  
  // Only allow updating certain fields
  const allowedFields = ['name', 'notificationPreferences', 'manualConfirmationEnabled'];
  const filteredUpdates = Object.keys(updates)
    .filter(key => allowedFields.includes(key))
    .reduce((obj, key) => {
      obj[key] = updates[key];
      return obj;
    }, {} as any);

  if (Object.keys(filteredUpdates).length === 0) {
    throw new Error('No valid fields to update');
  }

  // Update profile with new values
  const updatedProfile = {
    ...context.profile,
    ...filteredUpdates,
    updatedAt: new Date(),
  };

  // Save to database
  await dynamoDocClient.send(new PutCommand({
    TableName: config.tables.users,
    Item: updatedProfile,
  }));
  
  const response: ApiResponse = {
    success: true,
    data: updatedProfile,
    message: 'Profile updated successfully',
  };

  return createResponse(200, response);
}

/**
 * POST /auth/logout - Logout user
 */
async function logout(event: APIGatewayProxyEvent, context: AuthenticatedContext): Promise<APIGatewayProxyResult> {
  await invalidateSession(context.user.userId);
  
  const response: ApiResponse = {
    success: true,
    message: 'Logged out successfully',
  };

  return createResponse(200, response);
}

/**
 * Main handler for authentication routes
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { httpMethod, resource } = event;
  
  try {
    switch (`${httpMethod} ${resource}`) {
      case 'GET /auth/profile':
        return await withAuthAndCors(getProfile)(event);
      case 'PUT /auth/profile':
        return await withAuthAndCors(updateProfile)(event);
      case 'POST /auth/logout':
        return await withAuthAndCors(logout)(event);
      default:
        return createResponse(404, {
          success: false,
          error: 'Route not found',
        });
    }
  } catch (error) {
    return handleError(error);
  }
}