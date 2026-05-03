# Building EventPush: A Serverless Event Management Platform on AWS

## Introduction

<!-- Hook: The problem of managing meetups across multiple platforms -->
<!-- Brief overview of what EventPush does -->
<!-- Why serverless was the right choice -->

## The Architecture

<!-- High-level diagram: React frontend → API Gateway → Lambda → DynamoDB -->
<!-- Why SAM over CDK/Terraform for this project -->
<!-- Single-template deployment philosophy -->

### What Gets Deployed

<!-- Walk through the SAM template resources -->
<!-- 7 Lambda functions, 7 DynamoDB tables, Cognito, API Gateway, SQS, EventBridge -->
<!-- Cost breakdown: $0-10/month for development -->

## Authentication with Cognito

<!-- Social login setup (Google) -->
<!-- JWT validation in Lambda handlers -->
<!-- The middleware pattern: withAuth, withCors, withAuthAndCors -->
<!-- Lesson learned: keeping auth consistent across all handlers -->

## Integrating External APIs

### Meetup.com

<!-- API client design with error handling -->
<!-- Draft event workflow: create unpublished → review → publish or reject -->
<!-- Rate limiting and retry with exponential backoff -->

### LinkedIn

<!-- OAuth flow and permission checking -->
<!-- Permission-based feature gating -->
<!-- Handling partial failures (Meetup succeeds, LinkedIn fails) -->

## The Scheduling System

<!-- EventBridge rules for periodic tasks -->
<!-- SQS for decoupling scheduled post execution -->
<!-- The 5-post schedule: 1 month, 2 weeks, 1 week, 3 days, day of -->
<!-- How cancellation cascades through scheduled posts and messages -->

## Event Synchronization

<!-- Polling Meetup.com for external changes -->
<!-- Conflict detection and resolution (external platform priority) -->
<!-- Detecting when co-organizers publish draft events externally -->
<!-- The sync record pattern for tracking sync state -->

## Draft Event Workflow

<!-- Why draft mode matters for organizer teams -->
<!-- Create draft on Meetup → schedule posts/messages as pending → confirm or reject -->
<!-- Rejection cleanup: cancelling posts, messages, and sending notifications -->
<!-- External publication detection during sync -->

## Messaging and Notifications

<!-- Targeting: attendees vs non-RSVP'd group members -->
<!-- Template system with variable substitution -->
<!-- Error isolation: one failed message doesn't block the rest -->
<!-- Notification preferences and the shouldSkipNotification pattern -->

## Testing Strategy

### Unit Tests

<!-- Jest for all backend services -->
<!-- Mocking AWS SDK clients -->
<!-- Testing error paths as thoroughly as happy paths -->

### Property-Based Testing with fast-check

<!-- What property-based testing is and why it matters -->
<!-- 23 correctness properties derived from requirements -->
<!-- Example: Property 23 — draft rejection cleanup -->
<!-- How PBT found edge cases unit tests missed -->
<!-- The 100-iteration minimum and what it catches -->

### Integration Tests

<!-- Testing Lambda handlers end-to-end with mock events -->
<!-- Verifying status codes, response shapes, auth enforcement -->
<!-- 69 integration tests covering all API endpoints -->

## Frontend: React on Amplify

<!-- Vite + TypeScript + React setup -->
<!-- Amplify hosting with amplify.yml build spec -->
<!-- Security headers via customHttp.yml -->
<!-- SPA routing with _redirects -->
<!-- Environment variable management across dev/prod -->

## Lessons Learned

<!-- 1. Start with the SAM template — infrastructure shapes everything -->
<!-- 2. Consistent error handling patterns save debugging time -->
<!-- 3. Property-based testing is worth the setup cost -->
<!-- 4. Draft workflows add complexity but organizers need them -->
<!-- 5. External API integration is where most edge cases live -->

## What's Next

<!-- Custom domain setup -->
<!-- Real Meetup.com and LinkedIn API credentials -->
<!-- SES integration for email notifications -->
<!-- Monitoring dashboards in CloudWatch -->

## Conclusion

<!-- Recap: what was built and the serverless approach -->
<!-- Link to the repo -->
<!-- Call to action -->

---

*Built with AWS SAM, React, TypeScript, and a lot of property-based tests.*
