// Environment configuration and constants
export const config = {
  // DynamoDB table names from environment variables
  tables: {
    events: process.env.EVENTS_TABLE || 'events',
    speakers: process.env.SPEAKERS_TABLE || 'speakers',
    speakerAdmin: process.env.SPEAKER_ADMIN_TABLE || 'speaker-admin',
    cfps: process.env.CFPS_TABLE || 'cfps',
    questionTemplates: process.env.QUESTION_TEMPLATES_TABLE || 'question-templates',
    submissions: process.env.SUBMISSIONS_TABLE || 'submissions',
    submissionReviews: process.env.SUBMISSION_REVIEWS_TABLE || 'submission-reviews',
    bookings: process.env.BOOKINGS_TABLE || 'bookings',
  },
  // Cognito configuration
  cognito: {
    userPoolId: process.env.USER_POOL_ID || '',
    userPoolClientId: process.env.USER_POOL_CLIENT_ID || '',
  },
  // Private S3 bucket for speaker headshots
  headshotsBucket: process.env.HEADSHOTS_BUCKET || 'headshots',
  // AWS region
  region: process.env.REGION || process.env.AWS_REGION || 'us-east-1',
};
