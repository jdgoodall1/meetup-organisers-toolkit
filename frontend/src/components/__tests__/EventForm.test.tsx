import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EventForm from '../EventForm';
import { Event } from '../../types';

describe('EventForm Component', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  const mockEvent: Event = {
    eventId: 'test-event-1',
    userId: 'test-user',
    title: 'Test Event',
    description: 'Test Description',
    dateTime: new Date('2024-12-25T18:00:00'),
    location: 'Test Location',
    meetupEventId: 'meetup-123',
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
  };

  beforeEach(() => {
    mockOnSave.mockClear();
    mockOnCancel.mockClear();
  });

  it('renders create form when no event is provided', () => {
    render(<EventForm onSave={mockOnSave} onCancel={mockOnCancel} />);
    
    expect(screen.getByText('Create New Event')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create event/i })).toBeInTheDocument();
  });

  it('renders edit form when event is provided', () => {
    render(<EventForm event={mockEvent} onSave={mockOnSave} onCancel={mockOnCancel} />);
    
    expect(screen.getByText('Edit Event')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update event/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Event')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Description')).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    const user = userEvent.setup();
    render(<EventForm onSave={mockOnSave} onCancel={mockOnCancel} />);
    
    const submitButton = screen.getByRole('button', { name: /create event/i });
    await user.click(submitButton);
    
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(screen.getByText('Description is required')).toBeInTheDocument();
    expect(screen.getByText('Date and time are required')).toBeInTheDocument();
    expect(screen.getByText('Location is required')).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('validates future date requirement', async () => {
    const user = userEvent.setup();
    render(<EventForm onSave={mockOnSave} onCancel={mockOnCancel} />);
    
    const dateInput = screen.getByLabelText(/date & time/i);
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const pastDateString = pastDate.toISOString().slice(0, 16);
    
    await user.type(dateInput, pastDateString);
    
    const submitButton = screen.getByRole('button', { name: /create event/i });
    await user.click(submitButton);
    
    expect(screen.getByText('Event must be in the future')).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('submits form with valid data', async () => {
    const user = userEvent.setup();
    render(<EventForm onSave={mockOnSave} onCancel={mockOnCancel} />);
    
    const titleInput = screen.getByLabelText(/event title/i);
    const descriptionInput = screen.getByLabelText(/description/i);
    const dateInput = screen.getByLabelText(/date & time/i);
    const locationInput = screen.getByLabelText(/location/i);
    
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const futureDateString = futureDate.toISOString().slice(0, 16);
    
    await user.type(titleInput, 'New Event');
    await user.type(descriptionInput, 'Event description');
    await user.type(dateInput, futureDateString);
    await user.type(locationInput, 'Event location');
    
    const submitButton = screen.getByRole('button', { name: /create event/i });
    await user.click(submitButton);
    
    expect(mockOnSave).toHaveBeenCalledWith({
      title: 'New Event',
      description: 'Event description',
      dateTime: futureDateString,
      location: 'Event location',
      publishToMeetup: true,
      publishToLinkedIn: false,
      requiresConfirmation: false,
    });
  });

  it('handles checkbox interactions', async () => {
    const user = userEvent.setup();
    render(<EventForm onSave={mockOnSave} onCancel={mockOnCancel} />);
    
    const linkedinCheckbox = screen.getByLabelText(/publish to linkedin/i);
    const confirmationCheckbox = screen.getByLabelText(/require manual confirmation/i);
    
    expect(linkedinCheckbox).not.toBeChecked();
    expect(confirmationCheckbox).not.toBeChecked();
    
    await user.click(linkedinCheckbox);
    await user.click(confirmationCheckbox);
    
    expect(linkedinCheckbox).toBeChecked();
    expect(confirmationCheckbox).toBeChecked();
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<EventForm onSave={mockOnSave} onCancel={mockOnCancel} />);
    
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);
    
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('clears validation errors when user starts typing', async () => {
    const user = userEvent.setup();
    render(<EventForm onSave={mockOnSave} onCancel={mockOnCancel} />);
    
    // Trigger validation errors
    const submitButton = screen.getByRole('button', { name: /create event/i });
    await user.click(submitButton);
    
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    
    // Start typing in title field
    const titleInput = screen.getByLabelText(/event title/i);
    await user.type(titleInput, 'T');
    
    // Error should be cleared
    expect(screen.queryByText('Title is required')).not.toBeInTheDocument();
  });
});