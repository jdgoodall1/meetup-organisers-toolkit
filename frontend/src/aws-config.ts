import { Amplify } from 'aws-amplify';

// Configuration for AWS Amplify
// These values should be set from environment variables in production
const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID || 'us-east-1_XXXXXXXXX',
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID || 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
      loginWith: {
        email: true,
      },
    },
  },
  API: {
    REST: {
      LogiMeetAPI: {
        endpoint: import.meta.env.VITE_API_ENDPOINT || 'https://api.example.com/dev',
        region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
      },
    },
  },
};

// Configure Amplify
Amplify.configure(awsConfig);

export default awsConfig;