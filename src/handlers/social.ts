// Social media Lambda handler

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createResponse, handleError } from '../shared/utils';
import { validateConfig } from '../shared/config';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    validateConfig();

    return createResponse(200, { message: 'Social media handler' });
  } catch (error) {
    return handleError(error);
  }
};