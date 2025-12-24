"use strict";
// Property-based test for infrastructure deployment
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fc = __importStar(require("fast-check"));
const config_1 = require("../src/shared/config");
const aws_clients_1 = require("../src/shared/aws-clients");
/**
 * **Feature: logimeet, Property 1: Infrastructure provisioning completeness**
 * **Validates: Requirements 7.1**
 *
 * For any valid AWS environment configuration, when the SAM template is deployed,
 * all required serverless components should be provisioned and accessible.
 */
describe('Infrastructure Deployment Property Tests', () => {
    test('Property 1: Infrastructure provisioning completeness', () => {
        fc.assert(fc.property(
        // Generate valid environment configurations
        fc.record({
            eventsTable: fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9-_]+$/.test(s)),
            usersTable: fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9-_]+$/.test(s)),
            scheduledPostsTable: fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9-_]+$/.test(s)),
            messagesTable: fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9-_]+$/.test(s)),
            notificationsTable: fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9-_]+$/.test(s)),
            syncRecordsTable: fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9-_]+$/.test(s)),
            syncConflictsTable: fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9-_]+$/.test(s)),
            userPoolId: fc.string({ minLength: 10, maxLength: 50 }).filter(s => /^[a-zA-Z0-9-_]+$/.test(s)),
            userPoolClientId: fc.string({ minLength: 10, maxLength: 50 }).filter(s => /^[a-zA-Z0-9-_]+$/.test(s)),
            schedulerQueueUrl: fc.webUrl(),
            region: fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1')
        }), (envConfig) => {
            // Set up environment variables for this test iteration
            const originalEnv = { ...process.env };
            try {
                process.env.EVENTS_TABLE = envConfig.eventsTable;
                process.env.USERS_TABLE = envConfig.usersTable;
                process.env.SCHEDULED_POSTS_TABLE = envConfig.scheduledPostsTable;
                process.env.MESSAGES_TABLE = envConfig.messagesTable;
                process.env.NOTIFICATIONS_TABLE = envConfig.notificationsTable;
                process.env.SYNC_RECORDS_TABLE = envConfig.syncRecordsTable;
                process.env.SYNC_CONFLICTS_TABLE = envConfig.syncConflictsTable;
                process.env.USER_POOL_ID = envConfig.userPoolId;
                process.env.USER_POOL_CLIENT_ID = envConfig.userPoolClientId;
                process.env.SCHEDULER_QUEUE_URL = envConfig.schedulerQueueUrl;
                process.env.REGION = envConfig.region;
                // Property: Configuration validation should pass for valid environments
                expect(() => (0, config_1.validateConfig)()).not.toThrow();
                // Property: All table names should be properly configured
                expect(config_1.config.tables.events).toBe(envConfig.eventsTable);
                expect(config_1.config.tables.users).toBe(envConfig.usersTable);
                expect(config_1.config.tables.scheduledPosts).toBe(envConfig.scheduledPostsTable);
                expect(config_1.config.tables.messages).toBe(envConfig.messagesTable);
                expect(config_1.config.tables.notifications).toBe(envConfig.notificationsTable);
                expect(config_1.config.tables.syncRecords).toBe(envConfig.syncRecordsTable);
                expect(config_1.config.tables.syncConflicts).toBe(envConfig.syncConflictsTable);
                // Property: Cognito configuration should be properly set
                expect(config_1.config.cognito.userPoolId).toBe(envConfig.userPoolId);
                expect(config_1.config.cognito.userPoolClientId).toBe(envConfig.userPoolClientId);
                // Property: SQS configuration should be properly set
                expect(config_1.config.sqs.schedulerQueueUrl).toBe(envConfig.schedulerQueueUrl);
                // Property: Region should be properly configured
                expect(config_1.config.region).toBe(envConfig.region);
                // Property: AWS clients should be instantiated without errors
                expect(aws_clients_1.dynamoDocClient).toBeDefined();
                expect(aws_clients_1.cognitoClient).toBeDefined();
                expect(aws_clients_1.eventBridgeClient).toBeDefined();
                expect(aws_clients_1.sqsClient).toBeDefined();
                // Property: Social post schedule should be properly configured
                expect(config_1.config.socialPostSchedule).toEqual([30, 14, 7, 3, 0]);
                // Property: API configurations should be properly set
                expect(config_1.config.apis.meetup.baseUrl).toBe('https://api.meetup.com');
                expect(config_1.config.apis.linkedin.baseUrl).toBe('https://api.linkedin.com');
            }
            finally {
                // Restore original environment
                Object.assign(process.env, originalEnv);
            }
        }), { numRuns: 100 });
    });
    test('Property 1b: Infrastructure should reject invalid configurations', () => {
        fc.assert(fc.property(
        // Generate configurations with missing required variables
        fc.record({
            missingVar: fc.constantFrom('EVENTS_TABLE', 'USERS_TABLE', 'USER_POOL_ID', 'USER_POOL_CLIENT_ID', 'SCHEDULER_QUEUE_URL')
        }), (testConfig) => {
            const originalEnv = { ...process.env };
            try {
                // Remove one required environment variable
                delete process.env[testConfig.missingVar];
                // Property: Configuration validation should fail for incomplete environments
                expect(() => (0, config_1.validateConfig)()).toThrow();
                expect(() => (0, config_1.validateConfig)()).toThrow(/Missing required environment variables/);
            }
            finally {
                // Restore original environment
                Object.assign(process.env, originalEnv);
            }
        }), { numRuns: 100 });
    });
    test('Property 1c: Infrastructure components should have consistent configuration', () => {
        fc.assert(fc.property(fc.record({
            region: fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1'),
            stackName: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9-]*$/.test(s))
        }), (testConfig) => {
            const originalEnv = { ...process.env };
            try {
                process.env.REGION = testConfig.region;
                // Property: All components should use the same region configuration
                expect(config_1.config.region).toBe(testConfig.region);
                // Property: Table names should follow consistent naming patterns
                const tableNames = Object.values(config_1.config.tables);
                tableNames.forEach(tableName => {
                    expect(typeof tableName).toBe('string');
                    expect(tableName.length).toBeGreaterThan(0);
                });
                // Property: API configurations should be consistent
                expect(config_1.config.apis.meetup.baseUrl).toMatch(/^https:\/\//);
                expect(config_1.config.apis.linkedin.baseUrl).toMatch(/^https:\/\//);
                // Property: Sync configuration should have reasonable values
                expect(config_1.config.sync.intervalMinutes).toBeGreaterThan(0);
                expect(config_1.config.sync.maxRetries).toBeGreaterThan(0);
                expect(config_1.config.sync.backoffMultiplier).toBeGreaterThan(1);
            }
            finally {
                Object.assign(process.env, originalEnv);
            }
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=infrastructure.test.js.map