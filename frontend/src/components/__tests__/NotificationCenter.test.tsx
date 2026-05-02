import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationCenter from '../NotificationCenter';
import { apiService } from '../../services/api';
import { Notification, NotificationSettings } from '../../types';

jest.mock('../../services/api', () => ({
  apiService: {
    getNotifications: jest.fn(),
    getNotificationPreferences: jest.fn(),
    updateNotificationPreferences: jest.fn(),
    markNotificationAsRead: jest.fn(),
    markAllNotificationsAsRead: jest.fn(),
  },
}));

const mockApiService = apiService as jest.Mocked<typeof apiService>;

const mockNotifications: Notification[] = [
  {
    notificationId: 'notif-1',
    userId: 'user-1',
    type: 'success',
    title: 'Event Created Successfully',
    message: 'Your event "React Meetup" has been created.',
    relatedEntityId: 'event-1',
    relatedEntityType: 'event',
    read: false,
    createdAt: new Date('2024-01-15T10:00:00'),
  },
  {
    notificationId: 'notif-2',
    userId: 'user-1',
    type: 'warning',
    title: 'Draft Event Pending',
    message: 'Your event "TypeScript Workshop" requires confirmation.',
    relatedEntityId: 'event-2',
    relatedEntityType: 'event',
    read: false,
    createdAt: new Date('2024-01-20T15:30:00'),
  },
  {
    notificationId: 'notif-3',
    userId: 'user-1',
    type: 'info',
    title: 'Social Post Published',
    message: 'Your LinkedIn post has been published.',
    relatedEntityId: 'post-1',
    relatedEntityType: 'post',
    read: true,
    createdAt: new Date('2024-01-15T09:05:00'),
  },
];

const mockPreferences: NotificationSettings = {
  email: true,
  inApp: true,
  successNotifications: true,
  errorNotifications: true,
  reminderNotifications: true,
};

describe('NotificationCenter Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockApiService.getNotifications.mockResolvedValue({ notifications: mockNotifications } as any);
    mockApiService.getNotificationPreferences.mockResolvedValue({ preferences: mockPreferences } as any);
    mockApiService.markNotificationAsRead.mockResolvedValue({} as any);
    mockApiService.markAllNotificationsAsRead.mockResolvedValue({} as any);
    mockApiService.updateNotificationPreferences.mockResolvedValue({ preferences: mockPreferences } as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows loading state initially', () => {
    render(<NotificationCenter />);
    expect(screen.getByText('Loading notifications...')).toBeInTheDocument();
  });

  it('loads notifications and preferences from the API on mount', async () => {
    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading notifications...')).not.toBeInTheDocument();
    });

    expect(mockApiService.getNotifications).toHaveBeenCalledTimes(1);
    expect(mockApiService.getNotificationPreferences).toHaveBeenCalledTimes(1);

    expect(screen.getByText('Event Created Successfully')).toBeInTheDocument();
    expect(screen.getByText('Draft Event Pending')).toBeInTheDocument();
    expect(screen.getByText('Social Post Published')).toBeInTheDocument();
  });

  it('displays error state when API fails and no data loaded', async () => {
    mockApiService.getNotifications.mockRejectedValue(new Error('Network error'));

    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.getByText('Error: Network error')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('retries loading data when Retry button is clicked', async () => {
    mockApiService.getNotifications.mockRejectedValueOnce(new Error('Network error'));
    mockApiService.getNotificationPreferences.mockRejectedValueOnce(new Error('Network error'));

    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.getByText('Error: Network error')).toBeInTheDocument();
    });

    // Set up success for retry
    mockApiService.getNotifications.mockResolvedValue({ notifications: mockNotifications } as any);
    mockApiService.getNotificationPreferences.mockResolvedValue({ preferences: mockPreferences } as any);

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText('Event Created Successfully')).toBeInTheDocument();
    });
  });

  it('marks a notification as read via API when clicked', async () => {
    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.getByText('Event Created Successfully')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    // Click on the unread notification card
    const notifCard = screen.getByText('Event Created Successfully').closest('.notification-card');
    await user.click(notifCard!);

    expect(mockApiService.markNotificationAsRead).toHaveBeenCalledWith('notif-1');
  });

  it('marks all notifications as read via API', async () => {
    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.getByText('Event Created Successfully')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: /mark all read/i }));

    expect(mockApiService.markAllNotificationsAsRead).toHaveBeenCalledTimes(1);
  });

  it('filters notifications by unread status', async () => {
    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.getByText('Event Created Successfully')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    // Click unread filter
    await user.click(screen.getByRole('button', { name: /unread/i }));

    // Unread notifications should be visible
    expect(screen.getByText('Event Created Successfully')).toBeInTheDocument();
    expect(screen.getByText('Draft Event Pending')).toBeInTheDocument();
    // Read notification should be hidden
    expect(screen.queryByText('Social Post Published')).not.toBeInTheDocument();
  });

  it('shows notification count in filter buttons', async () => {
    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading notifications...')).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /all \(3\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unread \(2\)/i })).toBeInTheDocument();
  });

  it('displays notification preferences with correct initial state', async () => {
    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading notifications...')).not.toBeInTheDocument();
    });

    const emailCheckbox = screen.getByLabelText('Email notifications') as HTMLInputElement;
    const inAppCheckbox = screen.getByLabelText('In-app notifications') as HTMLInputElement;
    const successCheckbox = screen.getByLabelText('Success notifications') as HTMLInputElement;
    const errorCheckbox = screen.getByLabelText('Error notifications') as HTMLInputElement;
    const reminderCheckbox = screen.getByLabelText('Reminder notifications') as HTMLInputElement;

    expect(emailCheckbox.checked).toBe(true);
    expect(inAppCheckbox.checked).toBe(true);
    expect(successCheckbox.checked).toBe(true);
    expect(errorCheckbox.checked).toBe(true);
    expect(reminderCheckbox.checked).toBe(true);
  });

  it('toggles notification preferences', async () => {
    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading notifications...')).not.toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const emailCheckbox = screen.getByLabelText('Email notifications') as HTMLInputElement;

    await user.click(emailCheckbox);
    expect(emailCheckbox.checked).toBe(false);

    await user.click(emailCheckbox);
    expect(emailCheckbox.checked).toBe(true);
  });

  it('saves notification preferences via API', async () => {
    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading notifications...')).not.toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    // Toggle a preference
    await user.click(screen.getByLabelText('Email notifications'));

    // Save preferences
    await user.click(screen.getByRole('button', { name: /save preferences/i }));

    expect(mockApiService.updateNotificationPreferences).toHaveBeenCalledWith({
      email: false,
      inApp: true,
      successNotifications: true,
      errorNotifications: true,
      reminderNotifications: true,
    });
  });

  it('shows save confirmation after saving preferences', async () => {
    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading notifications...')).not.toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(screen.getByText('Preferences saved successfully!')).toBeInTheDocument();
    });
  });

  it('handles save preferences API error gracefully', async () => {
    mockApiService.updateNotificationPreferences.mockRejectedValue(new Error('Save failed'));

    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading notifications...')).not.toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(screen.getByText('Error: Save failed')).toBeInTheDocument();
    });
  });

  it('handles mark as read API error gracefully', async () => {
    mockApiService.markNotificationAsRead.mockRejectedValue(new Error('Mark read failed'));

    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.getByText('Event Created Successfully')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const notifCard = screen.getByText('Event Created Successfully').closest('.notification-card');
    await user.click(notifCard!);

    await waitFor(() => {
      expect(screen.getByText('Error: Mark read failed')).toBeInTheDocument();
    });
  });

  it('handles mark all as read API error gracefully', async () => {
    mockApiService.markAllNotificationsAsRead.mockRejectedValue(new Error('Mark all failed'));

    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.getByText('Event Created Successfully')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: /mark all read/i }));

    await waitFor(() => {
      expect(screen.getByText('Error: Mark all failed')).toBeInTheDocument();
    });
  });

  it('shows empty state when no notifications exist', async () => {
    mockApiService.getNotifications.mockResolvedValue({ notifications: [] } as any);

    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading notifications...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('No notifications found.')).toBeInTheDocument();
  });

  it('shows empty unread state when all notifications are read', async () => {
    const allRead = mockNotifications.map(n => ({ ...n, read: true }));
    mockApiService.getNotifications.mockResolvedValue({ notifications: allRead } as any);

    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading notifications...')).not.toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: /unread/i }));

    expect(screen.getByText("No unread notifications. You're all caught up!")).toBeInTheDocument();
  });

  it('does not show Mark All Read button when no unread notifications', async () => {
    const allRead = mockNotifications.map(n => ({ ...n, read: true }));
    mockApiService.getNotifications.mockResolvedValue({ notifications: allRead } as any);

    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading notifications...')).not.toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /mark all read/i })).not.toBeInTheDocument();
  });

  it('handles notifications response as array directly', async () => {
    // Backend may return array directly instead of { notifications: [...] }
    mockApiService.getNotifications.mockResolvedValue(mockNotifications as any);

    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.getByText('Event Created Successfully')).toBeInTheDocument();
    });
  });

  it('handles preferences response as object directly', async () => {
    // Backend may return preferences directly instead of { preferences: {...} }
    mockApiService.getNotificationPreferences.mockResolvedValue(mockPreferences as any);

    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading notifications...')).not.toBeInTheDocument();
    });

    const emailCheckbox = screen.getByLabelText('Email notifications') as HTMLInputElement;
    expect(emailCheckbox.checked).toBe(true);
  });

  it('polls for new notifications at regular intervals', async () => {
    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading notifications...')).not.toBeInTheDocument();
    });

    // Initial load
    expect(mockApiService.getNotifications).toHaveBeenCalledTimes(1);

    // Advance timer by 30 seconds to trigger polling
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });

    // Should have been called again for polling
    expect(mockApiService.getNotifications).toHaveBeenCalledTimes(2);

    // Advance another 30 seconds
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });

    expect(mockApiService.getNotifications).toHaveBeenCalledTimes(3);
  });

  it('does not show error banner when polling fails silently', async () => {
    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading notifications...')).not.toBeInTheDocument();
    });

    // Make polling fail
    mockApiService.getNotifications.mockRejectedValue(new Error('Polling error'));

    await act(async () => {
      jest.advanceTimersByTime(30000);
    });

    // Error banner should not appear from polling failure
    expect(screen.queryByText('Error: Polling error')).not.toBeInTheDocument();
    // Original notifications should still be displayed
    expect(screen.getByText('Event Created Successfully')).toBeInTheDocument();
  });

  it('displays View Details button for notifications with related entities', async () => {
    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading notifications...')).not.toBeInTheDocument();
    });

    const viewDetailsButtons = screen.getAllByRole('button', { name: /view details/i });
    expect(viewDetailsButtons.length).toBe(3); // All mock notifications have relatedEntityId
  });

  it('does not call markAsRead for already-read notifications', async () => {
    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.getByText('Social Post Published')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    // Click on the read notification
    const readNotifCard = screen.getByText('Social Post Published').closest('.notification-card');
    await user.click(readNotifCard!);

    expect(mockApiService.markNotificationAsRead).not.toHaveBeenCalled();
  });

  it('loads preferences with some disabled from backend', async () => {
    const customPrefs: NotificationSettings = {
      email: false,
      inApp: true,
      successNotifications: false,
      errorNotifications: true,
      reminderNotifications: false,
    };
    mockApiService.getNotificationPreferences.mockResolvedValue({ preferences: customPrefs } as any);

    render(<NotificationCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading notifications...')).not.toBeInTheDocument();
    });

    expect((screen.getByLabelText('Email notifications') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('In-app notifications') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Success notifications') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Error notifications') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Reminder notifications') as HTMLInputElement).checked).toBe(false);
  });
});
