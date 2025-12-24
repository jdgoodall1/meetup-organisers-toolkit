# Authentication Setup Guide

This document explains how to configure AWS Cognito authentication for the LogiMeet frontend.

## Overview

The frontend uses AWS Amplify with Cognito for authentication, supporting:
- Email/password authentication
- Session management with automatic token refresh
- Protected routes and API authentication

## Configuration

### Environment Variables

Create a `.env.local` file in the frontend directory with the following variables:

```bash
# AWS Cognito Configuration
VITE_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx

# API Configuration
VITE_API_ENDPOINT=https://api.example.com/dev
VITE_AWS_REGION=us-east-1
```

### AWS Infrastructure

The authentication is configured to work with the AWS infrastructure defined in `template.yaml`:

- **Cognito User Pool**: Manages user accounts and authentication
- **User Pool Client**: Configured for email/password authentication

### Getting Configuration Values

After deploying the SAM template, you can get the required values from:

1. **User Pool ID**: From the CloudFormation stack outputs or Cognito console
2. **User Pool Client ID**: From the CloudFormation stack outputs or Cognito console

## Features

### Authentication Flow

1. **Login Page**: Users can sign in with email/password or create new accounts
2. **Protected Routes**: Automatically redirects unauthenticated users to login
3. **Session Management**: Handles token refresh and session expiration

### API Integration

The `ApiService` class automatically includes authentication headers:
- Uses ID tokens from Cognito for API authentication
- Handles token refresh automatically
- Provides methods for all backend API endpoints

### Components

- **AuthContext**: Manages authentication state and provides auth methods
- **Login**: Login form with email/password authentication
- **Protected Routes**: Ensures authentication before accessing protected pages

## Development

### Running Locally

1. Install dependencies: `npm install`
2. Configure environment variables in `.env.local`
3. Start development server: `npm run dev`
4. Access at `http://localhost:3000`

### Testing

Authentication integration tests are included:
```bash
npm test AuthContext.integration.test.tsx
```

## Production Deployment

For production deployment:

1. Set production environment variables
2. Deploy frontend to AWS Amplify or your preferred hosting platform
3. Ensure CORS is configured on API Gateway for your domain

## Troubleshooting

### Common Issues

1. **Token Errors**: Verify User Pool and Client IDs are correct
2. **Environment Variables**: Ensure all required variables are set
3. **CORS Errors**: Check API Gateway CORS configuration

### Debug Mode

Set `VITE_DEBUG_AUTH=true` to enable additional logging for authentication flows.

## Adding Social Login Later

If you want to add Google OAuth or other social providers later:

1. Add identity providers to the Cognito User Pool
2. Update the User Pool Client to support OAuth flows
3. Add OAuth configuration to `aws-config.ts`
4. Update the Login component to include social login buttons

The current implementation is designed to be easily extensible for social authentication.