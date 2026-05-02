// Property-based tests for notification service
// **Feature: logimeet**

import * as fc from 'fast-check';
import { NotificationSettings, Notification } from '../src/shared/types';

// Mock AWS clients before importing service
jest.mock('../src/shared/aws-clients');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const awsClients = require('../src/shared/aws-clients');
const mockSend = jest.fn();
awsClients.dynamoDocClient = { send: mockSend };

// Import service after mock setup
import { NotificationService } from '../src/shared/notification-service';

describe('Notification Service Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: return default preferences (all enabled)
    mockSend.mockResolvedValue({
      Item: {
        notificationPreferences: {
          email: true,
          inApp: true,
          successNotifications: true,
          errorNotifications: true,
          reminderNotifications: true
        }
      }
    });
  });

  // --- Generators ---

  const safeString = (opts: { minLength?: number; maxLength?: number } = {}) =>
    fc.string({ minLength: opts.minLength ?? 1, maxLength: opts.maxLength ?? 100 })
      .filter(s => s.trim().replace(/[<>]/g, '').length > 0);

  const userIdArb = safeString({ maxLength: 50 });

  const notificationTypeArb = fc.constantFrom('success' as const, 'error' as const, 'warning' as const, 'info' as const);

  const notificationPrefsArb: fc.Arbitrary<NotificationSettings> = fc.record({
    email: fc.boolean(),
    inApp: fc.boolean(),
    successNotifications: fc.boolean(),
    errorNotifications: fc.boolean(),
    reminderNotifications: fc.boolean()
  });

  const upcomingEventArb = fc.record({
    eventId: safeString({ maxLength: 50 }),
    title: safeString({ maxLength: 100 }),
    dateTime: fc.date({ min: new Date(Date.now() + 86400000), max: new Date(Date.now() + 30 * 86400000) })
  });

  // **Feature: logimeet, Property 14: Comprehensive notification delivery**
  // **Validates: Requirements 6.1, 6.2, 6.3**
  describe('Property 14: Comprehensive notification delivery', () => {
    it('should send appropriate notifications for any automated action type', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          safeString({ maxLength: 100 }),
          safeString({ maxLength: 500 }),
          notificationTypeArb,
          fc.option(safeString({ maxLength: 50 })),
          async (userId, title, message, type, relatedEntityId) => {
            jest.clearAllMocks();

            // Mock preferences: all enabled
            mockSend.mockResolvedValue({
              Item: {
                notificationPreferences: {
                  email: true,
                  inApp: true,
                  successNotifications: true,
                  errorNotifications: true,
                  reminderNotifications: true
                }
              }
            });

            let result;
            switch (type) {
              case 'success':
                result = await NotificationService.sendSuccessNotification(
                  userId, title, message, relatedEntityId ?? undefined
                );
                break;
              case 'error':
                result = await NotificationService.sendErrorNotification(
                  userId, title, message, relatedEntityId ?? undefined
                );
                break;
              case 'warning':
                result = await NotificationService.sendPriorityNotification(
                  userId, title, message, relatedEntityId ?? undefined
                );
                break;
              case 'info':
                result = await NotificationService.sendNotification({
                  userId, type: 'info', title, message, relatedEntityId: relatedEntityId ?? undefined
                });
                break;
            }

            // Notification should always be created
            expect(result.notification).toBeDefined();
            expect(result.notification.userId).toBe(userId);

            // Type mapping: success->success, error->error, warning (priority)->warning, info->info
            const expectedType = type;
            expect(result.notification.type).toBe(expectedType);

            // With all preferences enabled, notification should be delivered
            expect(result.skippedByPreference).toBe(false);
            expect(result.inAppStored).toBe(true);
            expect(result.emailSent).toBe(true);

            // Title and message should be present (sanitized)
            expect(result.notification.title.length).toBeGreaterThan(0);
            expect(result.notification.message.length).toBeGreaterThan(0);

            // Notification should start as unread
            expect(result.notification.read).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include actionable information in error notifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          safeString({ maxLength: 100 }),
          safeString({ maxLength: 500 }),
          safeString({ maxLength: 50 }),
          async (userId, title, errorMessage, entityId) => {
            jest.clearAllMocks();
            mockSend.mockResolvedValue({
              Item: {
                notificationPreferences: {
                  email: true,
                  inApp: true,
                  successNotifications: true,
                  errorNotifications: true,
                  reminderNotifications: true
                }
              }
            });

            const result = await NotificationService.sendErrorNotification(
              userId, title, errorMessage, entityId, 'event'
            );

            // Error notifications should have type 'error'
            expect(result.notification.type).toBe('error');
            // Should include the error message (actionable information)
            expect(result.notification.message.length).toBeGreaterThan(0);
            // Should reference the related entity
            expect(result.notification.relatedEntityId).toBe(entityId);
            expect(result.notification.relatedEntityType).toBe('event');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always deliver priority notifications for manual interventions', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          safeString({ maxLength: 100 }),
          safeString({ maxLength: 500 }),
          async (userId, title, message) => {
            jest.clearAllMocks();
            // Even with some preferences disabled, priority notifications should be delivered
            mockSend.mockResolvedValue({
              Item: {
                notificationPreferences: {
                  email: true,
                  inApp: true,
                  successNotifications: false,
                  errorNotifications: false,
                  reminderNotifications: false
                }
              }
            });

            const result = await NotificationService.sendPriorityNotification(
              userId, title, message
            );

            // Priority notifications should never be skipped
            expect(result.skippedByPreference).toBe(false);
            expect(result.notification.type).toBe('warning');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: logimeet, Property 15: Notification preference enforcement**
  // **Validates: Requirements 6.4**
  describe('Property 15: Notification preference enforcement', () => {
    it('should respect organizer communication preferences for all subsequent notifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          notificationPrefsArb,
          notificationTypeArb,
          safeString({ maxLength: 100 }),
          safeString({ maxLength: 500 }),
          async (userId, preferences, type, title, message) => {
            jest.clearAllMocks();

            // Mock the preferences the user has set
            mockSend.mockResolvedValue({
              Item: {
                notificationPreferences: preferences
              }
            });

            const result = await NotificationService.sendNotification({
              userId, type, title, message
            });

            // Determine expected behavior based on preferences
            const shouldSkip = NotificationService.shouldSkipNotification(type, preferences);

            if (shouldSkip) {
              // Notification should be skipped
              expect(result.skippedByPreference).toBe(true);
              expect(result.emailSent).toBe(false);
              expect(result.inAppStored).toBe(false);
            } else {
              // Notification should be delivered
              expect(result.skippedByPreference).toBe(false);

              // Email delivery depends on email preference
              expect(result.emailSent).toBe(preferences.email);

              // In-app delivery depends on inApp preference
              expect(result.inAppStored).toBe(preferences.inApp);
            }

            // Warning/priority notifications should never be skipped regardless of preferences
            if (type === 'warning') {
              expect(result.skippedByPreference).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly determine skip behavior for each notification type', async () => {
      await fc.assert(
        fc.asyncProperty(
          notificationPrefsArb,
          async (preferences) => {
            // Success notifications respect successNotifications preference
            expect(NotificationService.shouldSkipNotification('success', preferences))
              .toBe(!preferences.successNotifications);

            // Error notifications respect errorNotifications preference
            expect(NotificationService.shouldSkipNotification('error', preferences))
              .toBe(!preferences.errorNotifications);

            // Info/reminder notifications respect reminderNotifications preference
            expect(NotificationService.shouldSkipNotification('info', preferences))
              .toBe(!preferences.reminderNotifications);

            // Warning/priority notifications are never skipped
            expect(NotificationService.shouldSkipNotification('warning', preferences))
              .toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: logimeet, Property 16: Inactivity reminder system**
  // **Validates: Requirements 6.5**
  describe('Property 16: Inactivity reminder system', () => {
    it('should send reminder notifications for inactive organizers with upcoming events', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          fc.integer({ min: 1, max: 10 }).chain(count =>
            fc.array(upcomingEventArb, { minLength: count, maxLength: count })
          ),
          fc.integer({ min: 1, max: 90 }),
          async (userId, upcomingEvents, thresholdDays) => {
            jest.clearAllMocks();

            // Mock user as inactive (last activity well before threshold)
            const inactiveDate = new Date(Date.now() - (thresholdDays + 10) * 86400000);
            mockSend.mockImplementation((command: any) => {
              const commandName = command.constructor.name;
              if (commandName === 'GetCommand') {
                return Promise.resolve({
                  Item: {
                    lastActivityDate: inactiveDate.toISOString(),
                    notificationPreferences: {
                      email: true,
                      inApp: true,
                      successNotifications: true,
                      errorNotifications: true,
                      reminderNotifications: true
                    }
                  }
                });
              }
              return Promise.resolve({});
            });

            // Check inactivity
            const inactivityResult = await NotificationService.checkInactivity(userId, thresholdDays);
            expect(inactivityResult.isInactive).toBe(true);
            expect(inactivityResult.daysSinceActivity).toBeGreaterThanOrEqual(thresholdDays);

            // Send reminder
            const reminderResult = await NotificationService.sendInactivityReminder(userId, upcomingEvents);

            // Should send a reminder when there are upcoming events
            expect(reminderResult).not.toBeNull();
            expect(reminderResult!.notification.type).toBe('info');
            expect(reminderResult!.notification.title).toContain('Attention');

            // Message should mention the number of events
            expect(reminderResult!.notification.message).toContain(
              `${upcomingEvents.length}`
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not send reminders when there are no upcoming events', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          async (userId) => {
            jest.clearAllMocks();
            mockSend.mockResolvedValue({
              Item: {
                notificationPreferences: {
                  email: true,
                  inApp: true,
                  successNotifications: true,
                  errorNotifications: true,
                  reminderNotifications: true
                }
              }
            });

            const result = await NotificationService.sendInactivityReminder(userId, []);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly detect active vs inactive organizers', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          fc.integer({ min: 1, max: 90 }),
          fc.boolean(),
          async (userId, thresholdDays, shouldBeInactive) => {
            jest.clearAllMocks();

            const daysAgo = shouldBeInactive
              ? thresholdDays + 5  // Inactive: beyond threshold
              : Math.max(0, thresholdDays - 5); // Active: within threshold

            const activityDate = new Date(Date.now() - daysAgo * 86400000);

            mockSend.mockResolvedValue({
              Item: {
                lastActivityDate: activityDate.toISOString()
              }
            });

            const result = await NotificationService.checkInactivity(userId, thresholdDays);

            if (shouldBeInactive) {
              expect(result.isInactive).toBe(true);
              expect(result.daysSinceActivity).toBeGreaterThanOrEqual(thresholdDays);
            } else {
              expect(result.isInactive).toBe(false);
              expect(result.daysSinceActivity).toBeLessThan(thresholdDays);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
