// Middleware utilities for Lambda functions

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authenticateRequest, AuthenticatedUser } from './auth';
import { UserProfile } from './types';
import { createResponse, handleError } from './utils';

export interface AuthenticatedContext {
  user: AuthenticatedUser;
  profile: UserProfile;
}

/**
 * Higher-order function that wraps Lambda handlers with authentication
 */
export function withAuth<T = any>(
  handler: (event: APIGatewayProxyEvent, context: AuthenticatedContext) => Promise<APIGatewayProxyResult>
) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      // Authenticate the request
      const { user, profile } = await authenticateRequest(event);
      
      // Call the wrapped handler with authenticated context
      return await handler(event, { user, profile });
    } catch (error) {
      return handleError(error);
    }
  };
}

/**
 * CORS middleware for handling preflight requests
 */
export function withCors(
  handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>
) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
      return createResponse(200, {}, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      });
    }

    // Call the wrapped handler
    const result = await handler(event);
    
    // Add CORS headers to the response
    return {
      ...result,
      headers: {
        ...result.headers,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      },
    };
  };
}

/**
 * Combined middleware for authentication and CORS
 */
export function withAuthAndCors<T = any>(
  handler: (event: APIGatewayProxyEvent, context: AuthenticatedContext) => Promise<APIGatewayProxyResult>
) {
  return withCors(withAuth(handler));
}