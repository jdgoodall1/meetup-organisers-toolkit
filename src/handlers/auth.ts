// Authentication API handlers

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authenticateRequest, getUserProfile, invalidateSession } from '../shared/auth';
import { createResponse, handleError } from '../shared/utils';
import { ApiResponse } from '../shared/types';

/**
 * GET /auth/profile - Get current user profile
 */
export async function getProfile(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const { user, profile } = await authenticateRequest(event);
    
    const response: ApiResponse = {
      success: true,
      data: profile,
      message: 'Profile retrieved successfully',
    };

    return createResponse(200, response);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PUT /auth/profile - Update user profile
 */
export async function updateProfile(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const { user, profile } = await authenticateRequest(event);
    
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
      ...profile,
      ...filteredUpdates,
      updatedAt: new Date(),
    };

    // Save to database (this would be implemented in the auth service)
    // For now, we'll return the updated profile
    
    const response: ApiResponse = {
      success: true,
      data: updatedProfile,
      message: 'Profile updated successfully',
    };

    return createResponse(200, response);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /auth/logout - Logout user
 */
export async function logout(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const { user } = await authenticateRequest(event);
    
    await invalidateSession(user.userId);
    
    const response: ApiResponse = {
      success: true,
      message: 'Logged out successfully',
    };

    return createResponse(200, response);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Main handler for authentication routes
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { httpMethod, resource } = event;
  
  try {
    switch (`${httpMethod} ${resource}`) {
      case 'GET /auth/profile':
        return await getProfile(event);
      case 'PUT /auth/profile':
        return await updateProfile(event);
      case 'POST /auth/logout':
        return await logout(event);
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