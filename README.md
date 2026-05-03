# EventPush

A serverless web application built on AWS that provides automated event management for meetup organizers. EventPush integrates with Meetup.com and LinkedIn APIs to create events, schedule social media posts, send automated messages, and provide comprehensive notifications.

## Architecture

- **Backend**: AWS Lambda functions with TypeScript
- **API**: API Gateway with Cognito authentication
- **Database**: DynamoDB for data persistence
- **Messaging**: SQS for async processing
- **Scheduling**: EventBridge for time-based triggers
- **Infrastructure**: AWS SAM for deployment

## Project Structure

```
├── src/
│   ├── handlers/          # Lambda function handlers
│   │   ├── events.ts      # Event management
│   │   ├── social.ts      # Social media posting
│   │   ├── messaging.ts   # Meetup messaging
│   │   ├── notifications.ts # User notifications
│   │   ├── sync.ts        # External platform sync
│   │   └── scheduler.ts   # Scheduled task processing
│   └── shared/            # Shared utilities and types
│       ├── types.ts       # TypeScript interfaces
│       ├── config.ts      # Environment configuration
│       ├── utils.ts       # Utility functions
│       └── aws-clients.ts # AWS SDK clients
├── frontend/              # React frontend application
├── tests/                 # Test files
├── template.yaml          # SAM infrastructure template
├── package.json           # Node.js dependencies
└── tsconfig.json         # TypeScript configuration
```

## Development Setup

### Prerequisites

- Node.js 18+
- AWS CLI configured
- AWS SAM CLI installed

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the project:
   ```bash
   npm run build
   ```

3. Run tests:
   ```bash
   npm test
   ```

4. Start the frontend locally:
   ```bash
   cd frontend
   npm run dev
   ```

### Deployment

1. Build and deploy:
   ```bash
   npm run deploy
   ```

2. For local development:
   ```bash
   npm run local
   ```

## Features

- **Event Management**: Create and manage events on Meetup.com and LinkedIn
- **Draft Mode**: Create draft events on Meetup.com for co-organizer collaboration
- **Social Media Automation**: Scheduled posts at 1 month, 2 weeks, 1 week, 3 days, and day of event
- **Automated Messaging**: Targeted messages to attendees and non-RSVP'd group members
- **Synchronization**: Import and sync existing events from external platforms
- **Manual Confirmation**: Optional approval workflow before publishing events
- **Notifications**: Comprehensive alerts for successes, failures, and required actions

## Environment Variables

Required environment variables (set automatically by SAM template):

- `EVENTS_TABLE`: DynamoDB events table name
- `USERS_TABLE`: DynamoDB users table name
- `SCHEDULED_POSTS_TABLE`: DynamoDB scheduled posts table name
- `MESSAGES_TABLE`: DynamoDB messages table name
- `NOTIFICATIONS_TABLE`: DynamoDB notifications table name
- `SYNC_RECORDS_TABLE`: DynamoDB sync records table name
- `SYNC_CONFLICTS_TABLE`: DynamoDB sync conflicts table name
- `USER_POOL_ID`: Cognito User Pool ID
- `USER_POOL_CLIENT_ID`: Cognito User Pool Client ID
- `SCHEDULER_QUEUE_URL`: SQS queue URL for scheduling
- `REGION`: AWS region

## Testing

The project uses Jest for unit testing and fast-check for property-based testing:

- Unit tests: Verify specific functionality and edge cases
- Property tests: Verify universal properties across many inputs
- Infrastructure tests: Validate AWS resource configuration

Run tests with:
```bash
npm test
```

## License

MIT