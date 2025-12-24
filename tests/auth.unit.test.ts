// Unit tests for authentication service

import { validateToken, createOrUpdateUserProfile, extractAuthFromEvent, getUserProfile, authenticateRequest } from '../src/shared/auth';
import { APIGatewayProxyEvent } from 'aws-lambda';
import jwt from 'jsonwebtoken';
import { config } from '../src/shared/config';

// Mock AWS clients
jest.mock('../src/shared/aws-clients');
jest.mock('@aws-sdk/lib-dynamodb');

describe('Authentication Service Unit Tests', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateToken', () => {
    test('should validate a valid JWT token', async () => {
      const validPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        'cognito:username': 'testuser',
        aud: config.cognito.userPoolClientId || 'test-client-id',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/test',
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        iat: Math.floor(Date.now() / 1000) - 60, // 1 minute ago
      };

      const token = jwt.sign(validPayload, 'mock-secret');
      
      const result = await validateToken(token);
      
      expect(result).toEqual({
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      });
    });

    test('should reject expired token', async () => {
      const expiredPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        'cognito:username': 'testuser',
        aud: config.cognito.userPoolClientId || 'test-client-id',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/test',
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago (expired)
        iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
      };

      const token = jwt.sign(expiredPayload, 'mock-secret');
      
      await expect(validateToken(token)).rejects.toThrow('Token expired');
    });

    test('should reject token with invalid audience', async () => {
      const invalidAudPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        'cognito:username': 'testuser',
        aud: 'wrong-client-id',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/test',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000) - 60,
      };

      const token = jwt.sign(invalidAudPayload, 'mock-secret');
      
      await expect(validateToken(token)).rejects.toThrow('Invalid token audience');
    });

    test('should reject token with missing required fields', async () => {
      const incompletePayload = {
        sub: 'user-123',
        // Missing email
        'cognito:username': 'testuser',
        aud: config.cognito.userPoolClientId || 'test-client-id',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/test',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000) - 60,
      };

      const token = jwt.sign(incompletePayload, 'mock-secret');
      
      await expect(validateToken(token)).rejects.toThrow('Invalid token payload');
    });
  });

  describe('extractAuthFromEvent', () => {
    test('should extract valid auth from API Gateway event', async () => {
      const validPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        'cognito:username': 'testuser',
        aud: config.cognito.userPoolClientId || 'test-client-id',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/test',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000) - 60,
      };

      const token = jwt.sign(validPayload, 'mock-secret');
      
      const event: Partial<APIGatewayProxyEvent> = {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };

      const result = await extractAuthFromEvent(event as APIGatewayProxyEvent);
      
      expect(result).toEqual({
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      });
    });

    test('should handle lowercase authorization header', async () => {
      const validPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        'cognito:username': 'testuser',
        aud: config.cognito.userPoolClientId || 'test-client-id',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/test',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000) - 60,
      };

      const token = jwt.sign(validPayload, 'mock-secret');
      
      const event: Partial<APIGatewayProxyEvent> = {
        headers: {
          authorization: `Bearer ${token}`, // lowercase
        },
      };

      const result = await extractAuthFromEvent(event as APIGatewayProxyEvent);
      
      expect(result).toEqual({
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      });
    });

    test('should reject event without authorization header', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        headers: {},
      };

      await expect(extractAuthFromEvent(event as APIGatewayProxyEvent))
        .rejects.toThrow('No authorization header provided');
    });

    test('should reject event with invalid authorization format', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        headers: {
          Authorization: 'InvalidFormat token',
        },
      };

      await expect(extractAuthFromEvent(event as APIGatewayProxyEvent))
        .rejects.toThrow('Invalid authorization header format');
    });
  });

  describe('createOrUpdateUserProfile', () => {
    test('should create new user profile when user does not exist', async () => {
      const authenticatedUser = {
        userId: 'new-user-123',
        email: 'newuser@example.com',
        name: 'New User',
      };

      // Mock DynamoDB operations
      const mockGet = jest.fn().mockResolvedValue({ Item: null }); // User doesn't exist
      const mockPut = jest.fn().mockResolvedValue({});
      
      const mockDynamoClient = {
        send: jest.fn()
          .mockImplementationOnce(() => mockGet())
          .mockImplementationOnce(() => mockPut())
      };
      
      require('../src/shared/aws-clients').dynamoDocClient = mockDynamoClient;
      require('@aws-sdk/lib-dynamodb').GetCommand = jest.fn();
      require('@aws-sdk/lib-dynamodb').PutCommand = jest.fn();

      const result = await createOrUpdateUserProfile(authenticatedUser);

      expect(result.userId).toBe('new-user-123');
      expect(result.email).toBe('newuser@example.com');
      expect(result.name).toBe('New User');
      expect(result.notificationPreferences).toBeDefined();
      expect(result.manualConfirmationEnabled).toBe(false);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    test('should update existing user profile', async () => {
      const authenticatedUser = {
        userId: 'existing-user-123',
        email: 'updated@example.com',
        name: 'Updated User',
      };

      const existingUser = {
        userId: 'existing-user-123',
        email: 'old@example.com',
        name: 'Old User',
        notificationPreferences: {
          email: false,
          inApp: true,
          successNotifications: false,
          errorNotifications: true,
          reminderNotifications: true,
        },
        manualConfirmationEnabled: true,
        lastSyncTime: new Date('2023-01-01'),
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-01'),
      };

      // Mock DynamoDB operations
      const mockGet = jest.fn().mockResolvedValue({ Item: existingUser });
      const mockPut = jest.fn().mockResolvedValue({});
      
      const mockDynamoClient = {
        send: jest.fn()
          .mockImplementationOnce(() => mockGet())
          .mockImplementationOnce(() => mockPut())
      };
      
      require('../src/shared/aws-clients').dynamoDocClient = mockDynamoClient;

      const result = await createOrUpdateUserProfile(authenticatedUser);

      expect(result.userId).toBe('existing-user-123');
      expect(result.email).toBe('updated@example.com'); // Updated
      expect(result.name).toBe('Updated User'); // Updated
      expect(result.notificationPreferences).toEqual(existingUser.notificationPreferences); // Preserved
      expect(result.manualConfirmationEnabled).toBe(true); // Preserved
      expect(result.createdAt).toEqual(existingUser.createdAt); // Preserved
      expect(result.updatedAt).toBeInstanceOf(Date); // Updated
    });
  });

  describe('getUserProfile', () => {
    test('should return user profile when it exists', async () => {
      const existingUser = {
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      };

      const mockGet = jest.fn().mockResolvedValue({ Item: existingUser });
      const mockDynamoClient = {
        send: mockGet
      };
      
      require('../src/shared/aws-clients').dynamoDocClient = mockDynamoClient;
      require('@aws-sdk/lib-dynamodb').GetCommand = jest.fn();

      const result = await getUserProfile('user-123');

      expect(result).toEqual(existingUser);
    });

    test('should return null when user does not exist', async () => {
      const mockGet = jest.fn().mockResolvedValue({ Item: null });
      const mockDynamoClient = {
        send: mockGet
      };
      
      require('../src/shared/aws-clients').dynamoDocClient = mockDynamoClient;

      const result = await getUserProfile('nonexistent-user');

      expect(result).toBeNull();
    });

    test('should handle DynamoDB errors gracefully', async () => {
      const mockGet = jest.fn().mockRejectedValue(new Error('DynamoDB error'));
      const mockDynamoClient = {
        send: mockGet
      };
      
      require('../src/shared/aws-clients').dynamoDocClient = mockDynamoClient;

      // Mock console.error to avoid noise in test output
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await getUserProfile('user-123');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Error retrieving user profile:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('authenticateRequest', () => {
    test('should authenticate valid request and return user and profile', async () => {
      const validPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        'cognito:username': 'testuser',
        aud: config.cognito.userPoolClientId || 'test-client-id',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/test',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000) - 60,
      };

      const token = jwt.sign(validPayload, 'mock-secret');
      
      const event: Partial<APIGatewayProxyEvent> = {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };

      // Mock DynamoDB operations for createOrUpdateUserProfile
      const mockGet = jest.fn().mockResolvedValue({ Item: null });
      const mockPut = jest.fn().mockResolvedValue({});
      
      const mockDynamoClient = {
        send: jest.fn()
          .mockImplementationOnce(() => mockGet())
          .mockImplementationOnce(() => mockPut())
      };
      
      require('../src/shared/aws-clients').dynamoDocClient = mockDynamoClient;
      require('@aws-sdk/lib-dynamodb').GetCommand = jest.fn();
      require('@aws-sdk/lib-dynamodb').PutCommand = jest.fn();

      const result = await authenticateRequest(event as APIGatewayProxyEvent);

      expect(result.user).toEqual({
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      });
      expect(result.profile).toBeDefined();
      expect(result.profile.userId).toBe('user-123');
      expect(result.profile.email).toBe('test@example.com');
    });
  });
});