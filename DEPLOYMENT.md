# LogiMeet AWS Deployment Guide

This guide will help you deploy LogiMeet to AWS and get it running in the cloud.

## Prerequisites

1. **AWS CLI** installed and configured with appropriate permissions
2. **SAM CLI** installed (`pip install aws-sam-cli` or via package manager)
3. **Node.js 18+** for building the frontend

## Step 1: Prepare for Deployment

### 1.1 Build the Backend
```bash
# Install dependencies and build
npm install
npm run build
```

## Step 2: Deploy Backend Infrastructure

### 2.1 Deploy with SAM
```bash
# Deploy the SAM template
sam build
sam deploy --guided
```

During the guided deployment, you'll be prompted for:
- **Stack name**: `logimeet-dev` (or your preference)
- **AWS Region**: Choose your preferred region (e.g., `us-east-1`)
- **Environment**: `dev`

### 2.2 Note the Outputs
After deployment, SAM will output important values:
- **ApiGatewayUrl**: Your API endpoint
- **UserPoolId**: Cognito User Pool ID
- **UserPoolClientId**: Cognito User Pool Client ID

## Step 3: Deploy Frontend

### 3.1 Configure Frontend Environment
Create `frontend/.env.production`:
```bash
# Replace with your actual values from SAM deployment
VITE_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_API_ENDPOINT=https://your-api-id.execute-api.region.amazonaws.com/dev
VITE_AWS_REGION=us-east-1
```

### 3.2 Deploy to AWS Amplify

#### Option A: Using AWS Console (Recommended)
1. Go to AWS Console → AWS Amplify
2. Click "New app" → "Host web app"
3. Connect your GitHub repository
4. Choose the branch (usually `main`)
5. Build settings should auto-detect React/Vite
6. Add environment variables from your `.env.production`
7. Deploy!

#### Option B: Using Amplify CLI
```bash
# Install Amplify CLI
npm install -g @aws-amplify/cli

# Initialize Amplify in frontend directory
cd frontend
amplify init

# Add hosting
amplify add hosting
# Choose "Amazon CloudFront and S3"

# Deploy
amplify publish
```

## Step 4: Test Your Deployment

1. **Visit your Amplify URL**
2. **Create a new account** with email/password
3. **Sign in** with your credentials
4. **Check the dashboard** loads after authentication
5. **Verify API calls** work (check browser network tab)

## Step 5: What You'll Have

After successful deployment:
- ✅ **Live authentication system** with email/password
- ✅ **Protected dashboard** requiring login
- ✅ **Real AWS backend** with DynamoDB and Lambda
- ✅ **API endpoints** ready for event management
- ✅ **Scalable infrastructure** that can handle real users

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify User Pool and Client IDs are correct
   - Check that environment variables are set properly

2. **CORS Errors**
   - API Gateway CORS is configured in the SAM template
   - If issues persist, check the API Gateway console

3. **Build Failures**
   - Ensure all environment variables are set
   - Check that Node.js version is 18+

### Getting Help

If you run into issues:
1. Check CloudWatch logs for Lambda functions
2. Check browser console for frontend errors
3. Verify all environment variables are set correctly

## Next Steps

Once deployed, you can:
1. **Continue with Task 6** (Meetup.com integration)
2. **Add real event management features**
3. **Invite others to test the authentication**
4. **Monitor usage in AWS CloudWatch**

## Cost Estimation

For development/testing with light usage:
- **Cognito**: ~$0 (free tier covers 50,000 MAUs)
- **Lambda**: ~$0-5/month (free tier covers 1M requests)
- **DynamoDB**: ~$0-2/month (free tier covers 25GB)
- **API Gateway**: ~$0-3/month (free tier covers 1M requests)
- **Amplify Hosting**: ~$0-1/month (free tier covers 15GB)

**Total estimated cost: $0-10/month for development**

---

Ready to deploy? The process is now much simpler without OAuth setup!