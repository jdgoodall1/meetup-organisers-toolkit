// Events Lambda handler

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createResponse } from '../shared/utils';
import { validateConfig } from '../shared/config';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Validate configuration on cold start
    validateConfig();

    const { httpMethod, pathParameters } = event;

    switch (httpMethod) {
      case 'GET':
        return createResponse(200, { message: 'Events handler - GET' });
      case 'POST':
        return createResponse(200, { message: 'Events handler - POST' });
      case 'PUT':
        return createResponse(200, { message: 'Events handler - PUT' });
      case 'DELETE':
        return createResponse(200, { message: 'Events handler - DELETE' });
      default:
        return createResponse(405, null, 'Method not allowed');
    }
  } catch (error) {
    console.error('Events handler error:', error);
    return createResponse(500, null, 'Internal server error');
  }
};