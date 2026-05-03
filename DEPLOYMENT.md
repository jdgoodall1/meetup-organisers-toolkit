# EventPush AWS Deployment Guide

## Prerequisites

1. **AWS CLI** installed and configured with appropriate permissions
2. **SAM CLI** installed (`brew install aws-sam-cli` or `pip install aws-sam-cli`)
3. **Node.js 22+** (matches the Lambda runtime)

## Backend Deployment (SAM)

### Build and Deploy

```bash
# Install backend dependencies
npm install

# Build the SAM application
sam build

# First-time deploy (interactive prompts)
sam deploy --guided

# Subsequent deploys
sam deploy
```

During guided deployment you'll be prompted for:
- **Stack name**: e.g. `eventpush` or `eventpush-dev`
- **AWS Region**: e.g. `us-east-1`
- **Environment**: `dev`, `staging`, or `prod`

### Capture Outputs

After deployment, note these values from the stack outputs:
- `ApiGatewayUrl` — your REST API endpoint
- `UserPoolId` — Cognito User Pool ID
- `UserPoolClientId` — Cognito Client ID

### What Gets Provisioned

The SAM template deploys:
- **7 Lambda functions** (auth, events, social, messaging, notifications, sync, scheduler)
- **API Gateway** with Cognito authorizer and CORS
- **Cognito User Pool** with email-based auth
- **7 DynamoDB tables** (events, users, scheduled-posts, messages, notifications, sync-records, sync-conflicts)
- **SQS queue** for scheduled task processing
- **EventBridge rules** for periodic sync (15 min) and post scheduling (5 min)
- **CloudWatch** log groups with API Gateway access logging

## Frontend Deployment (Amplify)

### 1. Update Environment Variables

Edit `frontend/.env.production` with your SAM output values:

```bash
VITE_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_API_ENDPOINT=https://your-api-id.execute-api.us-east-1.amazonaws.com/dev
VITE_AWS_REGION=us-east-1
```

### 2. Connect in Amplify Console

1. Go to **AWS Amplify** → **Create new app** → **Host web app**
2. Connect your Git repository and select the branch
3. Amplify auto-detects the `amplify.yml` build spec at the repo root
4. Verify build settings: installs from `frontend/`, builds with `tsc && vite build`, serves from `frontend/dist`
5. Add the environment variables listed above
6. Deploy

### Build Configuration

The repo includes these Amplify config files:
- **`amplify.yml`** — Build spec (preBuild: `npm ci`, build: `npm run build`, artifacts from `frontend/dist`)
- **`frontend/customHttp.yml`** — Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, CSP)
- **`frontend/public/_redirects`** — SPA rewrite rule for React Router

### Custom Domain (Optional)

In the Amplify console under **Domain management**, you can add a custom domain with automatic SSL certificate provisioning.

## Verification

After both deployments:

1. Visit your Amplify URL
2. Create an account and sign in
3. Verify the dashboard loads
4. Check browser network tab — API calls should hit your API Gateway endpoint
5. Check CloudWatch logs for any Lambda errors

## API Endpoints

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | /auth/profile | auth | Get user profile |
| PUT | /auth/profile | auth | Update profile |
| POST | /auth/logout | auth | Logout |
| GET | /events | events | List events |
| GET | /events/{id} | events | Get event |
| POST | /events | events | Create event |
| PUT | /events/{id} | events | Update event |
| DELETE | /events/{id} | events | Cancel event |
| POST | /events/{id}/confirm | events | Confirm draft |
| POST | /events/{id}/reject | events | Reject draft |
| POST | /events/sync | sync | Trigger sync |
| GET | /sync/status | sync | Sync status |
| POST | /sync/resolve-conflict | sync | Resolve conflict |
| POST | /social/schedule | social | Schedule posts |
| GET | /social/posts | social | List posts |
| DELETE | /social/posts/{id} | social | Cancel post |
| POST | /messages/schedule | messaging | Schedule message |
| GET | /messages | messaging | List messages |
| PUT | /messages/templates | messaging | Update templates |
| DELETE | /messages/{id} | messaging | Cancel message |
| GET | /notifications | notifications | List notifications |
| GET | /notifications/preferences | notifications | Get preferences |
| PUT | /notifications/preferences | notifications | Update preferences |
| PUT | /notifications/{id}/read | notifications | Mark as read |

## Updating

```bash
# Backend: rebuild and redeploy
sam build && sam deploy

# Frontend: push to Git — Amplify auto-deploys on push
git push origin main
```

## Teardown

```bash
# Remove backend stack (all resources)
sam delete --stack-name eventpush

# Frontend: delete the app in the Amplify console
```

## Cost Estimate (Development)

| Service | Estimated Monthly Cost |
|---------|----------------------|
| Cognito | ~$0 (free tier: 50K MAUs) |
| Lambda | ~$0-5 (free tier: 1M requests) |
| DynamoDB | ~$0-2 (free tier: 25GB) |
| API Gateway | ~$0-3 (free tier: 1M requests) |
| Amplify Hosting | ~$0-1 (free tier: 15GB served) |
| SQS | ~$0 (free tier: 1M requests) |
| EventBridge | ~$0 (free tier: 14M events) |
| **Total** | **$0-10/month** |
