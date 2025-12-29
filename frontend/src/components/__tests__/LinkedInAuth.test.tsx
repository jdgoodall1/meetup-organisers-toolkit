import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LinkedInAuth from '../LinkedInAuth';
import { apiService } from '../../services/api';

// Mock the API service
jest.mock('../../services/api', () => ({
  apiService: {
    getLinkedInProfile: jest.fn(),
    getLinkedInOrganizations: jest.fn(),
    connectLinkedIn: jest.fn(),
    disconnectLinkedIn: jest.fn(),
  },
}));

const mockApiService = apiService as jest.Mocked<typeof apiService>;

// Mock window.open and sessionStorage
const mockWindowOpen = jest.fn();
const mockSessionStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};

Object.defineProperty(window, 'open', {
  writable: true,
  value: mockWindowOpen,
});

Object.defineProperty(window, 'sessionStorage', {
  writable: true,
  value: mockSessionStorage,
});

describe('LinkedInAuth Component', () => {
  const mockOnAuthSuccess = jest.fn();
  const mockOnAuthError = jest.fn();

  beforeEach(() => {
    mockOnAuthSuccess.mockClear();
    mockOnAuthError.mockClear();
    mockApiService.getLinkedInProfile.mockClear();
    mockApiService.getLinkedInOrganizations.mockClear();
    mockApiService.connectLinkedIn.mockClear();
    mockApiService.disconnectLinkedIn.mockClear();
    mockWindowOpen.mockClear();
    mockSessionStorage.getItem.mockClear();
    mockSessionStorage.setItem.mockClear();
    mockSessionStorage.removeItem.mockClear();

    // Default: LinkedIn not connected
    mockApiService.getLinkedInProfile.mockRejectedValue(new Error('Not connected'));
  });

  it('renders connect button when not connected', async () => {
    render(<LinkedInAuth onAuthSuccess={mockOnAuthSuccess} onAuthError={mockOnAuthError} />);
    
    await waitFor(() => {
      expect(screen.getByText('Connect to LinkedIn')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Connect your LinkedIn account to create events and schedule posts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect linkedin account/i })).toBeInTheDocument();
  });

  it('shows connected state when LinkedIn is connected', async () => {
    const mockProfile = {
      id: 'test-id',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
    };

    const mockOrganizations = [
      {
        id: 'org-1',
        name: 'Test Company',
        type: 'company' as const,
        permissions: ['CREATE_EVENTS', 'CREATE_POSTS'],
        canCreateEvents: true,
        canCreatePosts: true,
      },
    ];

    mockApiService.getLinkedInProfile.mockResolvedValue(mockProfile);
    mockApiService.getLinkedInOrganizations.mockResolvedValue(mockOrganizations);

    render(<LinkedInAuth onAuthSuccess={mockOnAuthSuccess} onAuthError={mockOnAuthError} />);
    
    await waitFor(() => {
      expect(screen.getByText('LinkedIn Connected')).toBeInTheDocument();
    });
    
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();
    expect(screen.getByText('Available Organizations')).toBeInTheDocument();
    expect(screen.getByText('Test Company')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
    expect(screen.getByText('Posts')).toBeInTheDocument();
  });

  it('opens LinkedIn OAuth popup when connect button is clicked', async () => {
    const user = userEvent.setup();
    
    // Mock popup window
    const mockPopup = {
      closed: false,
      close: jest.fn(),
    };
    mockWindowOpen.mockReturnValue(mockPopup);

    render(<LinkedInAuth onAuthSuccess={mockOnAuthSuccess} onAuthError={mockOnAuthError} />);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /connect linkedin account/i })).toBeInTheDocument();
    });

    const connectButton = screen.getByRole('button', { name: /connect linkedin account/i });
    await user.click(connectButton);

    expect(mockWindowOpen).toHaveBeenCalledWith(
      expect.stringContaining('https://www.linkedin.com/oauth/v2/authorization'),
      'linkedin-auth',
      'width=600,height=600,scrollbars=yes,resizable=yes'
    );
    
    expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
      'linkedin_oauth_state',
      expect.any(String)
    );
  });

  it('handles disconnect functionality', async () => {
    const user = userEvent.setup();
    
    const mockProfile = {
      id: 'test-id',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
    };

    mockApiService.getLinkedInProfile.mockResolvedValue(mockProfile);
    mockApiService.getLinkedInOrganizations.mockResolvedValue([]);
    mockApiService.disconnectLinkedIn.mockResolvedValue({});

    render(<LinkedInAuth onAuthSuccess={mockOnAuthSuccess} onAuthError={mockOnAuthError} />);
    
    await waitFor(() => {
      expect(screen.getByText('LinkedIn Connected')).toBeInTheDocument();
    });

    const disconnectButton = screen.getByRole('button', { name: /disconnect linkedin/i });
    await user.click(disconnectButton);

    expect(mockApiService.disconnectLinkedIn).toHaveBeenCalled();
  });

  it('shows loading state', () => {
    // Mock a pending promise to keep loading state
    mockApiService.getLinkedInProfile.mockImplementation(() => new Promise(() => {}));

    render(<LinkedInAuth onAuthSuccess={mockOnAuthSuccess} onAuthError={mockOnAuthError} />);
    
    expect(screen.getByText('Connecting to LinkedIn...')).toBeInTheDocument();
  });

  it('handles authentication errors', async () => {
    mockApiService.getLinkedInProfile.mockRejectedValue(new Error('Authentication failed'));

    render(<LinkedInAuth onAuthSuccess={mockOnAuthSuccess} onAuthError={mockOnAuthError} />);
    
    await waitFor(() => {
      expect(screen.getByText('Connect to LinkedIn')).toBeInTheDocument();
    });

    // Component should render connect button when authentication fails
    expect(screen.getByRole('button', { name: /connect linkedin account/i })).toBeInTheDocument();
  });
});