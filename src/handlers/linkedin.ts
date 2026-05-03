// LinkedIn API handler

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createResponse, handleError, parseJSON } from '../shared/utils';
import { validateConfig } from '../shared/config';
import { getUserFromEvent, getUserProfile } from '../shared/auth';
import { LinkedInClient } from '../shared/linkedin-client';
import { dynamoDocClient } from '../shared/aws-clients';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../shared/config';
import axios from 'axios';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    validateConfig();

    const { httpMethod, resource, body } = event;

    // Get authenticated user
    const user = await getUserFromEvent(event);
    if (!user) {
      return createResponse(401, { error: 'Unauthorized' });
    }

    switch (`${httpMethod} ${resource}`) {
      case 'POST /linkedin/connect':
        return await connectLinkedIn(body, user.userId);

      case 'GET /linkedin/profile':
        return await getLinkedInProfile(user.userId);

      case 'GET /linkedin/organizations':
        return await getLinkedInOrganizations(user.userId);

      case 'POST /linkedin/disconnect':
        return await disconnectLinkedIn(user.userId);

      default:
        return createResponse(405, { error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in LinkedIn handler:', error);
    return handleError(error);
  }
};

async function connectLinkedIn(body: string | null, userId: string): Promise<APIGatewayProxyResult> {
  if (!body) {
    return createResponse(400, { error: 'Request body is required' });
  }

  const data = parseJSON<{ authCode?: string; code?: string }>(body);
  if (!data) {
    return createResponse(400, { error: 'Invalid JSON in request body' });
  }

  const code = data.authCode || data.code;
  if (!code) {
    return createResponse(400, { error: 'Authorization code is required' });
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.LINKEDIN_CLIENT_ID || '',
        client_secret: process.env.LINKEDIN_CLIENT_SECRET || '',
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI || '',
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const { access_token, expires_in } = tokenResponse.data;

    if (!access_token) {
      return createResponse(400, { error: 'Failed to obtain access token from LinkedIn' });
    }

    // Store the credentials in the user profile
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    await dynamoDocClient.send(new UpdateCommand({
      TableName: config.tables.users,
      Key: { userId },
      UpdateExpression: 'SET linkedinCredentials = :creds, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':creds': {
          accessToken: access_token,
          expiresAt,
          encryptedData: access_token, // In production, encrypt this
        },
        ':updatedAt': new Date().toISOString(),
      },
    }));

    // Fetch the user's LinkedIn profile
    const linkedinClient = new LinkedInClient({
      accessToken: access_token,
      encryptedData: access_token,
    });

    let profile = null;
    try {
      profile = await linkedinClient.getProfile();
    } catch (err) {
      // Profile fetch failed but connection succeeded
      console.error('Failed to fetch LinkedIn profile:', err);
    }

    return createResponse(200, {
      message: 'LinkedIn connected successfully',
      profile,
    });
  } catch (error) {
    console.error('LinkedIn OAuth error:', error);
    const message = axios.isAxiosError(error)
      ? error.response?.data?.error_description || error.message
      : error instanceof Error ? error.message : 'Unknown error';
    return createResponse(400, { error: `LinkedIn connection failed: ${message}` });
  }
}

async function getLinkedInProfile(userId: string): Promise<APIGatewayProxyResult> {
  const userProfile = await getUserProfile(userId);
  if (!userProfile?.linkedinCredentials?.accessToken) {
    return createResponse(404, { error: 'LinkedIn not connected' });
  }

  try {
    const linkedinClient = new LinkedInClient(userProfile.linkedinCredentials);
    const profile = await linkedinClient.getProfile();
    return createResponse(200, { profile });
  } catch (error) {
    console.error('Failed to get LinkedIn profile:', error);
    return createResponse(502, { error: 'Failed to fetch LinkedIn profile' });
  }
}

async function getLinkedInOrganizations(userId: string): Promise<APIGatewayProxyResult> {
  const userProfile = await getUserProfile(userId);
  if (!userProfile?.linkedinCredentials?.accessToken) {
    return createResponse(404, { error: 'LinkedIn not connected' });
  }

  try {
    const linkedinClient = new LinkedInClient(userProfile.linkedinCredentials);
    const organizations = await linkedinClient.getOrganizations();
    return createResponse(200, { organizations });
  } catch (error) {
    console.error('Failed to get LinkedIn organizations:', error);
    return createResponse(502, { error: 'Failed to fetch LinkedIn organizations' });
  }
}

async function disconnectLinkedIn(userId: string): Promise<APIGatewayProxyResult> {
  try {
    await dynamoDocClient.send(new UpdateCommand({
      TableName: config.tables.users,
      Key: { userId },
      UpdateExpression: 'REMOVE linkedinCredentials SET updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':updatedAt': new Date().toISOString(),
      },
    }));

    return createResponse(200, { message: 'LinkedIn disconnected successfully' });
  } catch (error) {
    console.error('Failed to disconnect LinkedIn:', error);
    return handleError(error);
  }
}
