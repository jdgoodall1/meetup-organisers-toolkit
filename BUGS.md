# LogiMeet - Bug Tracking

## Active Bugs

### 🔴 High Priority

#### API-001: CORS errors preventing API communication
- **Status**: Open
- **Priority**: High
- **Component**: API Gateway / Frontend Integration
- **Description**: Frontend receives CORS errors when making authenticated requests to API Gateway, preventing event loading and other API operations
- **Technical Details**: 
  - Frontend correctly sends Authorization header with valid JWT token
  - API Gateway configured with CORS settings and GatewayResponses for 4XX/5XX errors
  - Issue persists even with Cognito authorizer disabled (Auth: NONE)
  - Error: "Access to fetch at 'https://30o3c2c9le.execute-api.us-east-1.amazonaws.com/dev/events' from origin 'http://localhost:4173' has been blocked by CORS policy"
- **Key Findings**:
  - ✅ JWT token is valid - manual authorizer test returns 200 with correct claims
  - ✅ Cognito User Pool configuration is correct
  - ✅ API Gateway Cognito authorizer successfully validates the token when tested manually
  - ❌ API Gateway console shows "Enable CORS" button, indicating CORS is not enabled at resource level
  - ❌ SAM template CORS configuration is not being applied to actual resources
  - ❌ Manual CORS enablement in console did not resolve the issue
- **Root Cause**: Issue is purely CORS configuration, NOT authentication/authorization
- **Attempted Solutions**:
  - Added GatewayResponses with CORS headers for DEFAULT_4XX and DEFAULT_5XX
  - Updated SAM template CORS configuration
  - Verified environment variables and API endpoint configuration
  - Tested with and without Cognito authorizer
  - Manual authorizer testing confirms token validation works
- **Next Steps**: 
  - Deploy API Gateway logging to see actual browser request flow vs manual test
  - Investigate why SAM template CORS configuration isn't being applied
  - Consider implementing CORS headers directly in Lambda function responses
  - Investigate CORS preflight (OPTIONS) request handling

### 🟡 Medium Priority

### 🟢 Low Priority

## Resolved Bugs

### ✅ AUTH-001: Auto-login after email confirmation fails
- **Status**: Resolved
- **Priority**: High
- **Component**: Authentication Flow
- **Description**: After user confirms their email, the automatic login attempt fails, requiring manual login
- **Resolution**: Implemented retry logic with exponential backoff (2s, 4s, 8s delays) and proper loading states
- **Technical Details**: 
  - Added 3 retry attempts with exponential backoff
  - Added loading screen during auto-login process
  - Improved error handling for UserNotConfirmedException
  - Better user feedback during the process
- **Resolved Date**: 2024-12-29

### ✅ AUTH-002: Confirmation page not showing after signup
- **Status**: Resolved
- **Priority**: High
- **Component**: Authentication Flow
- **Description**: After signup, user was not automatically redirected to confirmation page
- **Resolution**: Fixed AuthContext signup method to not throw error when confirmation required
- **Resolved Date**: 2024-12-29

### ✅ AUTH-003: Manual confirmation missing email input
- **Status**: Resolved
- **Priority**: Medium
- **Component**: Confirmation Page
- **Description**: When accessing confirmation page manually, no email input field was provided
- **Resolution**: Added conditional email input field and proper state management
- **Resolved Date**: 2024-12-29

### ✅ AUTH-004: Missing resend confirmation code functionality
- **Status**: Resolved
- **Priority**: Medium
- **Component**: Confirmation Page
- **Description**: "Resend Code" button was not implemented
- **Resolution**: Implemented resend functionality with cooldown timer
- **Resolved Date**: 2024-12-29

## Bug Categories

- **AUTH**: Authentication and user management
- **UI**: User interface and experience
- **API**: Backend API issues
- **PERF**: Performance issues
- **DATA**: Data handling and persistence

## Priority Levels

- 🔴 **High**: Blocks core functionality, affects user signup/login
- 🟡 **Medium**: Impacts user experience but has workarounds
- 🟢 **Low**: Minor issues, cosmetic problems

## Status Types

- **Open**: Bug identified, not yet assigned
- **In Progress**: Currently being worked on
- **Testing**: Fix implemented, needs verification
- **Resolved**: Bug fixed and verified
- **Closed**: Resolved and deployed