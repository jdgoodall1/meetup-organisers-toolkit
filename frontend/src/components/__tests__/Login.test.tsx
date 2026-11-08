import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../Login';
import { AuthProvider } from '../../contexts/AuthContext';
import { APP_NAME } from '../../config/app';

// import.meta is unavailable under Jest
jest.mock('../../aws-config', () => ({}));

// Mock the AuthContext
const mockLogin = jest.fn();
const mockAuthContext = {
  user: null,
  isAuthenticated: false,
  login: mockLogin,
  logout: jest.fn(),
  loading: false,
};

jest.mock('../../contexts/AuthContext', () => ({
  ...jest.requireActual('../../contexts/AuthContext'),
  useAuth: () => mockAuthContext,
}));

describe('Login Component', () => {
  beforeEach(() => {
    mockLogin.mockClear();
  });

  const renderLogin = () => {
    return render(
      <AuthProvider>
        <Login />
      </AuthProvider>
    );
  };

  it('renders login form with all required fields', () => {
    renderLogin();
    
    expect(screen.getByRole('heading', { name: APP_NAME })).toBeInTheDocument();
    expect(screen.getByText('Sign in to manage your events')).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('handles form submission with valid credentials', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue(undefined);
    
    renderLogin();
    
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    
    await user.type(emailInput, 'demo@example.com');
    await user.type(passwordInput, 'password');
    await user.click(submitButton);
    
    expect(mockLogin).toHaveBeenCalledWith('demo@example.com', 'password');
  });

  it('displays error message on login failure', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));
    
    renderLogin();
    
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    
    await user.type(emailInput, 'wrong@example.com');
    await user.type(passwordInput, 'wrongpassword');
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('requires email and password fields', async () => {
    const user = userEvent.setup();
    
    renderLogin();
    
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitButton);
    
    // Form should not submit without required fields
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('shows loading state during authentication', () => {
    mockAuthContext.loading = true;
    
    renderLogin();
    
    expect(screen.getByText('Signing in...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  });
});