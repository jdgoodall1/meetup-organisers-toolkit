// Notifications Lambda handler

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createResponse } from '../shared/utils';
import { validateConfig } from '../shared/config';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    validateConfig();

    return createResponse(200, { message: 'Notifications handler' });
  } catch (error) {
    console.error('Notifications handler error:', error);
    return createResponse(500, null, 'Internal server error');
  }
};