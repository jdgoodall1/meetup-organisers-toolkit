import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessagingCenter from '../MessagingCenter';
import { apiService } from '../../services/api';
import { Message, MessageTemplate, Event } from '../../types';

jest.mock('../../services/api', () => ({
  apiService: {
    getMessages: jest.fn(),
    getMessageTemplates: jest.fn(),
    getEvents: jest.fn(),
    cancelMessage: jest.fn(),
    retryMessage: jest.fn(),
    createMessageTemplate: jest.fn(),
    updateMessageTemplate: jest.fn(),
    setDefaultMessageTemplate: jest.fn(),
    scheduleMessage: jest.fn(),
  },
}));

const mockApiService = apiService as jest.Mocked<typeof apiService>;

const mockMessages: Message[] = [
  {
    messageId: 'msg-1',
    eventId: 'event-1',
    userId: 'user-1',
    recipientType: 'attendees',
    content: 'Welcome to the event!',
    scheduledTime: new Date('2024-06-01T10:00:00'),
    status: 'sent',
    recipientCount: 25,
    sentCount: 25,
    requiresConfirmation: false,
    createdAt: new Date('2024-05-01T10:00:00'),
  },
  {
    messageId: 'msg-2',
    eventId: 'event-1',
    userId: 'user-1',
    recipientType: 'non_rsvp_members',
    content: 'Don\'t miss out on our event!',
    scheduledTime: new Date('2024-06-01T14:00:00'),
    status: 'pending',
    recipientCount: 150,
    sentCount: 0,
    requiresConfirmation: false,
    createdAt: new Date('2024-05-01T10:00:00'),
  },
  {
    messageId: 'msg-3',
    eventId: 'event-2',
    userId: 'user-1',
    recipientType: 'attendees',
    content: 'Reminder about the workshop',
    scheduledTime: new Date('2024-06-10T09:00:00'),
    status: 'failed',
    recipientCount: 15,
    sentCount: 0,
    errorMessage: 'SMTP connection failed',
    requiresConfirmation: false,
    createdAt: new Date('2024-05-15T10:00:00'),
  },
];

const mockTemplates: MessageTemplate[] = [
  {
    templateId: 'tpl-1',
    name: 'Welcome Attendees',
    recipientType: 'attendees',
    content: 'Welcome to {{eventTitle}} on {{eventDate}}!',
    isDefault: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    templateId: 'tpl-2',
    name: 'Invite Non-RSVPs',
    recipientType: 'non_rsvp_members',
    content: 'Join us for {{eventTitle}} at {{eventLocation}}!',
    isDefault: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    templateId: 'tpl-3',
    name: 'Custom Reminder',
    recipientType: 'attendees',
    content: 'Reminder: {{eventTitle}} is coming up!',
    isDefault: false,
    createdAt: new Date('2024-01-05'),
    updatedAt: new Date('2024-01-05'),
  },
];

const mockEvents: Event[] = [
  {
    eventId: 'event-1',
    userId: 'user-1',
    title: 'React Meetup',
    description: 'A meetup about React',
    dateTime: new Date('2024-07-01T18:00:00'),
    location: 'Tech Hub',
    meetupEventStatus: 'published',
    platformStatus: 'confirmed',
    source: 'platform',
    requiresConfirmation: false,
    publishToMeetup: true,
    publishToLinkedIn: false,
    socialPostsScheduled: true,
    messagesScheduled: true,
    lastSyncTime: new Date(),
    externallyModified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe('MessagingCenter Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiService.getMessages.mockResolvedValue(mockMessages as any);
    mockApiService.getMessageTemplates.mockResolvedValue(mockTemplates as any);
    mockApiService.getEvents.mockResolvedValue(mockEvents as any);
  });

  it('shows loading state initially', () => {
    render(<MessagingCenter />);
    expect(screen.getByText('Loading messaging data...')).toBeInTheDocument();
  });

  it('loads messages from the API on mount', async () => {
    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading messaging data...')).not.toBeInTheDocument();
    });

    expect(mockApiService.getMessages).toHaveBeenCalledTimes(1);
    expect(mockApiService.getMessageTemplates).toHaveBeenCalledTimes(1);
    expect(mockApiService.getEvents).toHaveBeenCalledTimes(1);

    expect(screen.getByText('Welcome to the event!')).toBeInTheDocument();
    expect(screen.getByText("Don't miss out on our event!")).toBeInTheDocument();
  });

  it('displays error state when API fails and no data loaded', async () => {
    mockApiService.getMessages.mockRejectedValue(new Error('Network error'));
    mockApiService.getMessageTemplates.mockRejectedValue(new Error('Network error'));
    mockApiService.getEvents.mockRejectedValue(new Error('Network error'));

    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.getByText('Error: Network error')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('retries loading data when Retry button is clicked', async () => {
    mockApiService.getMessages.mockRejectedValueOnce(new Error('Network error'));
    mockApiService.getMessageTemplates.mockRejectedValueOnce(new Error('Network error'));
    mockApiService.getEvents.mockRejectedValueOnce(new Error('Network error'));

    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.getByText('Error: Network error')).toBeInTheDocument();
    });

    // Now set up success for retry
    mockApiService.getMessages.mockResolvedValue(mockMessages as any);
    mockApiService.getMessageTemplates.mockResolvedValue(mockTemplates as any);
    mockApiService.getEvents.mockResolvedValue(mockEvents as any);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText('Welcome to the event!')).toBeInTheDocument();
    });
  });

  it('cancels a pending message', async () => {
    mockApiService.cancelMessage.mockResolvedValue({} as any);

    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.getByText("Don't miss out on our event!")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const cancelButton = screen.getByRole('button', { name: /cancel message/i });
    await user.click(cancelButton);

    expect(mockApiService.cancelMessage).toHaveBeenCalledWith('msg-2');
  });

  it('retries a failed message', async () => {
    mockApiService.retryMessage.mockResolvedValue({} as any);

    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.getByText('Reminder about the workshop')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const retryButton = screen.getByRole('button', { name: /retry message/i });
    await user.click(retryButton);

    expect(mockApiService.retryMessage).toHaveBeenCalledWith('msg-3');
  });

  it('displays error message for failed messages', async () => {
    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.getByText('SMTP connection failed')).toBeInTheDocument();
    });
  });

  it('filters messages by recipient type', async () => {
    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.getByText('Welcome to the event!')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const filterSelect = screen.getByLabelText(/filter by recipient/i);

    // Filter to attendees only
    await user.selectOptions(filterSelect, 'attendees');

    expect(screen.getByText('Welcome to the event!')).toBeInTheDocument();
    expect(screen.getByText('Reminder about the workshop')).toBeInTheDocument();
    expect(screen.queryByText("Don't miss out on our event!")).not.toBeInTheDocument();

    // Filter to non-RSVP members only
    await user.selectOptions(filterSelect, 'non_rsvp_members');

    expect(screen.queryByText('Welcome to the event!')).not.toBeInTheDocument();
    expect(screen.getByText("Don't miss out on our event!")).toBeInTheDocument();
  });

  it('shows templates tab with template list', async () => {
    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading messaging data...')).not.toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /templates/i }));

    expect(screen.getByText('Welcome Attendees')).toBeInTheDocument();
    expect(screen.getByText('Invite Non-RSVPs')).toBeInTheDocument();
    expect(screen.getByText('Custom Reminder')).toBeInTheDocument();
  });

  it('opens template creation form', async () => {
    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading messaging data...')).not.toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /templates/i }));
    await user.click(screen.getByRole('button', { name: /create new template/i }));

    expect(screen.getByText('Create New Template')).toBeInTheDocument();
    expect(screen.getByLabelText(/template name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/content/i)).toBeInTheDocument();
  });

  it('creates a new template via API', async () => {
    const newTemplate: MessageTemplate = {
      templateId: 'tpl-new',
      name: 'My New Template',
      recipientType: 'attendees',
      content: 'Hello {{eventTitle}}!',
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockApiService.createMessageTemplate.mockResolvedValue(newTemplate as any);

    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading messaging data...')).not.toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /templates/i }));
    await user.click(screen.getByRole('button', { name: /create new template/i }));

    await user.type(screen.getByLabelText(/template name/i), 'My New Template');
    // Use keyboard with escaped braces to avoid userEvent interpreting { as special key
    await user.type(screen.getByLabelText(/content/i), 'Hello World!');
    await user.click(screen.getByRole('button', { name: /save template/i }));

    expect(mockApiService.createMessageTemplate).toHaveBeenCalledWith({
      name: 'My New Template',
      recipientType: 'attendees',
      content: 'Hello World!',
      isDefault: false,
    });
  });

  it('opens edit form for existing template', async () => {
    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading messaging data...')).not.toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /templates/i }));

    const editButtons = screen.getAllByRole('button', { name: /edit template/i });
    await user.click(editButtons[0]);

    expect(screen.getByText('Edit Template')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Welcome Attendees')).toBeInTheDocument();
  });

  it('updates an existing template via API', async () => {
    mockApiService.updateMessageTemplate.mockResolvedValue({} as any);

    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading messaging data...')).not.toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /templates/i }));

    const editButtons = screen.getAllByRole('button', { name: /edit template/i });
    await user.click(editButtons[0]);

    const nameInput = screen.getByLabelText(/template name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Name');

    await user.click(screen.getByRole('button', { name: /update template/i }));

    expect(mockApiService.updateMessageTemplate).toHaveBeenCalledWith('tpl-1', expect.objectContaining({
      name: 'Updated Name',
    }));
  });

  it('sets a template as default', async () => {
    mockApiService.setDefaultMessageTemplate.mockResolvedValue({} as any);

    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading messaging data...')).not.toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /templates/i }));

    // Only non-default templates have "Set as Default" button
    const setDefaultButton = screen.getByRole('button', { name: /set as default/i });
    await user.click(setDefaultButton);

    expect(mockApiService.setDefaultMessageTemplate).toHaveBeenCalledWith('tpl-3');
  });

  it('shows schedule message tab with form', async () => {
    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading messaging data...')).not.toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /schedule message/i }));

    expect(screen.getByText('Schedule a New Message')).toBeInTheDocument();
    expect(screen.getByLabelText(/event/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/recipient type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/scheduled time/i)).toBeInTheDocument();
  });

  it('schedules a new message via API', async () => {
    mockApiService.scheduleMessage.mockResolvedValue({} as any);

    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading messaging data...')).not.toBeInTheDocument();
    });

    const user = userEvent.setup();
    // Click the tab button to navigate to schedule tab
    const tabButtons = screen.getAllByRole('button');
    const scheduleTab = tabButtons.find(btn => btn.textContent?.includes('Schedule Message'));
    await user.click(scheduleTab!);

    await user.selectOptions(screen.getByLabelText(/^event$/i), 'event-1');
    await user.selectOptions(screen.getByLabelText(/recipient type/i), 'attendees');

    const timeInput = screen.getByLabelText(/scheduled time/i);
    await user.type(timeInput, '2024-07-01T10:00');

    // Find the submit button specifically (type="submit")
    const submitButton = screen.getAllByRole('button', { name: /schedule message/i })
      .find(btn => btn.getAttribute('type') === 'submit')!;
    await user.click(submitButton);

    expect(mockApiService.scheduleMessage).toHaveBeenCalledWith({
      eventId: 'event-1',
      recipientType: 'attendees',
      scheduledTime: '2024-07-01T10:00',
      templateId: undefined,
    });
  });

  it('displays recipient type labels correctly', async () => {
    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading messaging data...')).not.toBeInTheDocument();
    });

    expect(screen.getAllByText('Event Attendees').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Non-RSVP Members').length).toBeGreaterThan(0);
  });

  it('shows message count in tab button', async () => {
    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading messaging data...')).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /messages \(3\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /templates \(3\)/i })).toBeInTheDocument();
  });

  it('handles cancel message API error gracefully', async () => {
    mockApiService.cancelMessage.mockRejectedValue(new Error('Cancel failed'));

    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.getByText("Don't miss out on our event!")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /cancel message/i }));

    await waitFor(() => {
      expect(screen.getByText('Error: Cancel failed')).toBeInTheDocument();
    });
  });

  it('handles retry message API error gracefully', async () => {
    mockApiService.retryMessage.mockRejectedValue(new Error('Retry failed'));

    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.getByText('Reminder about the workshop')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /retry message/i }));

    await waitFor(() => {
      expect(screen.getByText('Error: Retry failed')).toBeInTheDocument();
    });
  });

  it('shows empty state when no messages exist', async () => {
    mockApiService.getMessages.mockResolvedValue([] as any);

    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading messaging data...')).not.toBeInTheDocument();
    });

    expect(screen.getByText(/no messages found/i)).toBeInTheDocument();
  });

  it('shows default badge on default templates', async () => {
    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.queryByText('Loading messaging data...')).not.toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /templates/i }));

    const defaultBadges = screen.getAllByText('Default');
    expect(defaultBadges.length).toBe(2); // tpl-1 and tpl-2 are default
  });

  it('handles messages response with messages property', async () => {
    // Backend may return { messages: [...] } instead of just [...]
    mockApiService.getMessages.mockResolvedValue({ messages: mockMessages } as any);

    render(<MessagingCenter />);

    await waitFor(() => {
      expect(screen.getByText('Welcome to the event!')).toBeInTheDocument();
    });
  });
});
