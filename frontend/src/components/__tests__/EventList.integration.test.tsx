import { render, screen, waitFor } from '@testing-library/react';
import EventList from '../EventList';
import { apiService } from '../../services/api';

// Mock the API service
jest.mock('../../services/api');
const mockedApiService = apiService as jest.Mocked<typeof apiService>;

const mockEvents = [
  {
    eventId: 'event-1',
    userId: 'user-1',
    title: 'Test Event',
    description: 'Test Description',
    dateTime: new Date('2024-03-15T18:00:00'),
    location: 'Test Location',
    meetupEventStatus: 'published' as const,
    platformStatus: 'confirmed' as const,
    source: 'platform' as const,
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

describe('EventList Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load events from API service', async () => {
    mockedApiService.getEvents.mockResolvedValue(mockEvents);

    const mockOnEditEvent = jest.fn();
    render(<EventList onEditEvent={mockOnEditEvent} />);

    // Should show loading initially
    expect(screen.getByText('Loading events...')).toBeInTheDocument();

    // Should show events after loading
    await waitFor(() => {
      expect(screen.getByText('Test Event')).toBeInTheDocument();
    });

    expect(screen.getByText('Test Description')).toBeInTheDocument();
    expect(screen.getByText('Test Location')).toBeInTheDocument();
    expect(mockedApiService.getEvents).toHaveBeenCalledTimes(1);
  });

  it('should show error state when API fails', async () => {
    mockedApiService.getEvents.mockRejectedValue(new Error('API Error'));

    const mockOnEditEvent = jest.fn();
    render(<EventList onEditEvent={mockOnEditEvent} />);

    await waitFor(() => {
      expect(screen.getByText(/Error loading events/)).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('should show empty state when no events', async () => {
    mockedApiService.getEvents.mockResolvedValue([]);

    const mockOnEditEvent = jest.fn();
    render(<EventList onEditEvent={mockOnEditEvent} />);

    await waitFor(() => {
      expect(screen.getByText('No events found. Create your first event to get started!')).toBeInTheDocument();
    });
  });
});