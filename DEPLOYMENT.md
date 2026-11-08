# Speaker Toolkit AWS Deployment Guide

## Prerequisites

1. **AWS CLI** installed and configured with appropriate permissions
2. **SAM CLI** installed (`brew install aws-sam-cli` or `pip install aws-sam-cli`)
3. **Node.js 22+** (matches the Lambda runtime)

## Backend Deployment (SAM)

### Build and Deploy

```bash
# Install backend dependencies
npm install

# Optional: type check and run tests first
npm run build
npm test

# Build the SAM application
sam build

# First-time deploy (interactive prompts)
sam deploy --guided

# Subsequent deploys (same as: npm run deploy)
sam deploy
```

`npm run deploy` runs `sam build && sam deploy`.

During guided deployment you'll be prompted for:
- **Stack name**: e.g. `speaker-toolkit` or `speaker-toolkit-dev`
- **AWS Region**: e.g. `us-east-1`
- **Environment**: `dev`, `staging`, or `prod` (API Gateway stage name)
- **AllowedOrigin**: the origin of the web app, used for API and S3 CORS. Use your Amplify URL (for example `https://main.xxxx.amplifyapp.com`). The default is `http://localhost:3000`.

### Capture Outputs

After deployment, note these values from the stack outputs:
- `ApiGatewayUrl`: your REST API endpoint
- `UserPoolId`: Cognito User Pool ID
- `UserPoolClientId`: Cognito Client ID
- `HeadshotsBucketName`: private S3 bucket for speaker headshots

### Bootstrap the First Admin

Public sign-up only ever creates `speaker` users, so the very first admin must be added once from the CLI. After that, admins are managed in the app.

1. Sign up through the deployed app (and confirm your email).
2. Get the User Pool ID from the stack outputs:

   ```bash
   aws cloudformation describe-stacks \
     --stack-name <your-stack-name> \
     --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
     --output text
   ```

3. Add your user to the `admin` group:

   ```bash
   aws cognito-idp admin-add-user-to-group \
     --user-pool-id <pool-id> \
     --username <username-or-email> \
     --group-name admin
   ```

4. Sign out and sign in again so your token is refreshed with the `admin` group.

From then on, admins can promote speakers, invite new admins, and demote admins from the admin UI. No further CLI steps are needed. (An admin cannot demote themselves, so the last admin can't be removed by accident.)

### What Gets Provisioned

The SAM template deploys:
- **9 Lambda functions**: post-confirmation, users, events, speakers-me, speakers-admin, cfps, submissions-me, submissions-admin, bookings
- **API Gateway** with a Cognito authorizer, CORS limited to `AllowedOrigin`, and access logging to CloudWatch
- **Cognito User Pool** with email sign-in, plus `admin` and `speaker` groups and a post-confirmation trigger that adds new users to `speaker`
- **8 DynamoDB tables** (on-demand): events, speakers, speaker-admin, cfps, question-templates, submissions, submission-reviews, bookings
- **S3 bucket** for headshots (private, encrypted, accessed through presigned URLs only)

`speaker-admin` (markers and notes) and `submission-reviews` (ratings and notes) are admin-only. The speaker-facing Lambdas have no IAM access to them.

## Frontend Deployment (Amplify)

### 1. Set Environment Variables

Use your stack output values. For local builds put them in `frontend/.env.production` (see `frontend/.env.example`); in Amplify add them as app environment variables:

```bash
VITE_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_API_ENDPOINT=https://your-api-id.execute-api.us-east-1.amazonaws.com/dev
VITE_AWS_REGION=us-east-1
```

### 2. Connect in Amplify Console

1. Go to **AWS Amplify** â†’ **Create new app** â†’ **Host web app**
2. Connect your Git repository and select the branch
3. Amplify detects `amplify.yml` at the repo root (app root `frontend`)
4. Verify build settings: `npm ci` then `npm run build` (which runs `tsc && vite build`), artifacts from `frontend/dist`
5. Add the environment variables listed above
6. Deploy

Then make sure the stack's `AllowedOrigin` parameter matches the Amplify URL (redeploy with `sam deploy --parameter-overrides AllowedOrigin=https://<your-domain>` if not).

### Build Configuration

The repo includes these Amplify config files:
- **`amplify.yml`**: build spec (preBuild: `npm ci`, build: `npm run build`, artifacts from `dist` under the `frontend` app root)
- **`frontend/customHttp.yml`**: security headers
- **`frontend/public/_redirects`**: SPA rewrite rule for React Router

### Custom Domain (Optional)

In the Amplify console under **Domain management**, you can add a custom domain with automatic SSL certificate provisioning. Update `AllowedOrigin` to match.

## Verification

After both deployments:

1. Visit your Amplify URL
2. Create an account, confirm your email and sign in (you land in the speaker area)
3. Complete your speaker profile and upload a headshot
4. Bootstrap the first admin (above), sign in again and check the admin area loads
5. Create an event and a CFP (leave the close date blank for a standing CFP), then check it appears under open CFPs for a speaker
6. Sign in as an admin who is also a speaker and check the Speaker view / Admin view switch in the header
7. Check the browser network tab: API calls should hit your API Gateway endpoint
8. Check CloudWatch logs for any Lambda errors

## API Endpoints

Admin routes require the `admin` group; `/me/*` routes are for the signed-in user.

| Area | Paths |
|------|-------|
| Identity | `GET /me`, `DELETE /me` (account deletion) |
| Users (admin) | `GET /admin/users`, `POST /admin/users/invite`, `POST /admin/users/{userId}/promote`, `POST /admin/users/{userId}/demote` |
| Events (admin) | `GET, POST /admin/events`, `GET, PUT, DELETE /admin/events/{id}` |
| Speaker profile | `GET, PUT /me/profile`, `POST /me/profile/headshot-url` |
| Speakers (admin) | `GET, POST /admin/speakers`, `GET, PUT /admin/speakers/{id}`, `PUT /admin/speakers/{id}/marker`, `PUT /admin/speakers/{id}/notes`, `POST /admin/speakers/{id}/link` (the account must exist in the user pool), `POST /admin/speakers/{id}/headshot-url` |
| CFPs (admin) | `GET, POST /admin/cfps`, `GET, PUT, DELETE /admin/cfps/{id}`, `POST /admin/cfps/{id}/duplicate`, `PUT /admin/cfps/{id}/questions`, `POST /admin/cfps/{id}/apply-template` |
| Templates (admin) | `GET, POST /admin/templates`, `DELETE /admin/templates/{id}` |
| Open CFPs | `GET /me/cfps`, `GET /me/cfps/{id}` |
| Submissions | `GET, POST /me/submissions`, `GET, PUT, DELETE /me/submissions/{id}`, `POST /me/submissions/{id}/submit` |
| Review (admin) | `GET /admin/cfps/{id}/submissions`, `GET /admin/submissions/{id}`, `PUT /admin/submissions/{id}/status`, `PUT /admin/submissions/{id}/review` |
| Bookings | `GET, POST /admin/bookings`, `PUT, DELETE /admin/bookings/{id}`, `GET /me/bookings` |

## Updating

```bash
# Backend: rebuild and redeploy
npm run deploy

# Frontend: push to Git; Amplify auto-deploys on push
git push origin main
```

## Teardown

```bash
# Empty the headshots bucket first (CloudFormation cannot delete a non-empty bucket)
aws s3 rm s3://<HeadshotsBucketName> --recursive

# Remove backend stack (all resources)
sam delete --stack-name <your-stack-name>

# Frontend: delete the app in the Amplify console
```

## Cost Estimate (Development)

| Service | Estimated Monthly Cost |
|---------|----------------------|
| Cognito | ~$0 (free tier: 50K MAUs) |
| Lambda | ~$0-5 (free tier: 1M requests) |
| DynamoDB | ~$0-2 (free tier: 25GB) |
| API Gateway | ~$0-3 (free tier: 1M requests) |
| S3 | ~$0-1 |
| Amplify Hosting | ~$0-1 (free tier: 15GB served) |
| **Total** | **$0-10/month** |

## Upgrading to standing CFPs

Run `sam build` and `sam deploy` again so the CFP, events and submissions Lambdas pick up the change, then redeploy the frontend. Existing CFPs keep working: items with a `closesAt` behave exactly as before, and a stored `eventId` is ignored. No table or index changes are made (the `StatusIndex` on the CFPs table is left alone); the app now lists CFPs by status with a table scan so CFPs with no close date are included. The events function no longer has access to the CFPs table.
