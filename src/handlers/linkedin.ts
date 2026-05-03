// LinkedIn API handler

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createResponse, handleError } from '../shared/utils';
import { validateConfig, config } from '../shared/config';
import { getUserFromEvent, getUserProfile } from '../shared/auth';
import { dynamoDocClient } from '../shared/aws-clients';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import axios from 'axios';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    validateConfig();

    const { httpMethod, resource } = event;

    // Get authenticated user
    const user = await getUserFromEvent(event);
    if (!user) {
      return createResponse(401, { error: 'Unauthorized' });
    }

    switch (`${httpMethod} ${resource}`) {
      case 'POST /linkedin/connect':
        return await connectLinkedIn(event.body, user.userId);

      case 'GET /linkedin/profile':
        return await getLinkedInProfile(user.userId);

      case 'GET /linkedin/organizations':
        return await getLinkedInOrganizations(user.userId);

      case 'POST /linkedin/disconnect':
        return await disconnectLinkedIn(user.userId);

      default:
        return createResponse(404, {
          error: 'Route not found',
        });
    }
  } catch (error) {
    console.error('Error in LinkedIn handler:', error);
    return handleError(error);
  }
};

/**
 * POST /linkedin/connect
 * Exchange OAuth auth code for access token, store in user profile,
 * and return the LinkedIn profile info.
 */
async function connectLinkedIn(
  body: string | null,
  userId: string
): Promise<APIGatewayProxyResult> {
  if (!body) {
    return createResponse(400, { error: 'Request body is required' });
  }

  let parsed: { authCode?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    return createResponse(400, { error: 'Invalid JSON in request body' });
  }

  const authCode = parsed.authCode;
  if (!authCode) {
    return createResponse(400, { error: 'authCode is required' });
  }

  try {
    // Exchange the auth code for an access token
    const tokenResponse = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        client_id: config.linkedin.clientId,
        client_secret: config.linkedin.clientSecret,
        redirect_uri: config.linkedin.redirectUri,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const { access_token, expires_in } = tokenResponse.data;

    if (!access_token) {
      return createResponse(400, {
        error: 'Failed to obtain access token from LinkedIn',
      });
    }

    // Calculate expiry and store credentials
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    await dynamoDocClient.send(
      new UpdateCommand({
        TableName: config.tables.users,
        Key: { userId },
        UpdateExpression:
          'SET linkedinCredentials = :creds, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':creds': {
            accessToken: access_token,
            expiresAt,
            encryptedData: access_token, // In production, encrypt this
          },
          ':updatedAt': new Date().toISOString(),
        },
      })
    );

    // Fetch profile from LinkedIn's userinfo endpoint using the new token
    let profile = null;
    try {
      const userinfoResponse = await axios.get(
        'https://api.linkedin.com/v2/userinfo',
        {
          headers: { Authorization: `Bearer ${access_token}` },
        }
      );
      const info = userinfoResponse.data;
      profile = {
        firstName: info.given_name || '',
        lastName: info.family_name || '',
        email: info.email || '',
        profilePicture: info.picture || '',
      };
    } catch (err) {
      // Profile fetch failed but connection succeeded — still return success
      console.error('Failed to fetch LinkedIn profile after connect:', err);
    }

    return createResponse(200, {
      message: 'LinkedIn connected successfully',
      profile,
    });
  } catch (error) {
    console.error('LinkedIn OAuth error:', error);
    const message = axios.isAxiosError(error)
      ? error.response?.data?.error_description || error.message
      : error instanceof Error
        ? error.message
        : 'Unknown error';
    return createResponse(400, {
      error: `LinkedIn connection failed: ${message}`,
    });
  }
}

/**
 * GET /linkedin/profile
 * Return the connected LinkedIn profile, or { connected: false } if none.
 */
async function getLinkedInProfile(
  userId: string
): Promise<APIGatewayProxyResult> {
  const userProfile = await getUserProfile(userId);

  if (!userProfile?.linkedinCredentials?.accessToken) {
    return createResponse(200, { connected: false });
  }

  try {
    const userinfoResponse = await axios.get(
      'https://api.linkedin.com/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${userProfile.linkedinCredentials.accessToken}`,
        },
      }
    );
    const info = userinfoResponse.data;

    return createResponse(200, {
      connected: true,
      firstName: info.given_name || '',
      lastName: info.family_name || '',
      email: info.email || '',
      profilePicture: info.picture || '',
    });
  } catch (error) {
    console.error('Failed to get LinkedIn profile:', error);
    // Token may be expired — treat as disconnected
    return createResponse(200, { connected: false });
  }
}

/**
 * GET /linkedin/organizations
 * Return the list of organizations the user can post to, or empty array.
 */
async function getLinkedInOrganizations(
  userId: string
): Promise<APIGatewayProxyResult> {
  const userProfile = await getUserProfile(userId);

  if (!userProfile?.linkedinCredentials?.accessToken) {
    return createResponse(200, { organizations: [] });
  }

  try {
    const response = await axios.get(
      'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee',
      {
        headers: {
          Authorization: `Bearer ${userProfile.linkedinCredentials.accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );

    const organizations = (response.data.elements || []).map((el: any) => ({
      id: el.organization,
      role: el.role,
      state: el.state,
    }));

    return createResponse(200, { organizations });
  } catch (error) {
    console.error('Failed to get LinkedIn organizations:', error);
    return createResponse(200, { organizations: [] });
  }
}

/**
 * POST /linkedin/disconnect
 * Remove LinkedIn credentials from the user's profile.
 */
async function disconnectLinkedIn(
  userId: string
): Promise<APIGatewayProxyResult> {
  await dynamoDocClient.send(
    new UpdateCommand({
      TableName: config.tables.users,
      Key: { userId },
      UpdateExpression: 'REMOVE linkedinCredentials SET updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':updatedAt': new Date().toISOString(),
      },
    })
  );

  return createResponse(200, { message: 'LinkedIn disconnected successfully' });
}
