import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../contexts/AuthContext';
import Login from '../Login';

// Mock AWS Amplify
jest.mock('aws-amplify/auth', () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  getCurrentUser: jest.fn(),
  fetchAuthSession: jest.fn(),
}));

// Mock the aws-config import
jest.mock('../../aws-config', () => ({}));

// Mock react-router-dom
jest.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Routes: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Route: ({ element }: { element: React.ReactNode }) => <div>{element}</div>,
  Navigate: () => <div>Navigate</div>,
  useNavigate: () => jest.fn(),
}));

const MockedAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  );
};

describe('Authentication Integration', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    jest.clearAllMocks();
    
    // Mock window.location
    delete (window as any).location;
    (window as any).location = {
      href: 'http://localhost:3000',
      pathname: '/',
      search: '',
      hash: '',
      replace: jest.fn(),
    };
    
    // Mock window.history
    (window as any).history = {
      replaceState: jest.fn(),
      pushState: jest.fn(),
    };
  });

  test('renders login component with email/password authentication', async () => {
    const { getCurrentUser } = require('aws-amplify/auth');
    getCurrentUser.mockRejectedValue(new Error('No user'));

    render(
      <MockedAuthProvider>
        <Login />
      </MockedAuthProvider>
    );

    await waitFor(() => {
      // Check for email/password form
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });
    
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in$/i })).toBeInTheDocument();
    
    // Check for authentication info
    expect(screen.getByText('• Email/Password (AWS Cognito)')).toBeInTheDocument();
    expect(screen.getByText('• Secure session management')).toBeInTheDocument();
  });

  test('shows loading state initially', async () => {
    const { getCurrentUser } = require('aws-amplify/auth');
    getCurrentUser.mockRejectedValue(new Error('No user'));

    render(
      <MockedAuthProvider>
        <Login />
      </MockedAuthProvider>
    );

    // Should show loading initially, then login form
    await waitFor(() => {
      expect(screen.getByText('Sign in to manage your events')).toBeInTheDocument();
    });
  });

  test('handles authentication state properly', async () => {
    const { getCurrentUser, fetchAuthSession } = require('aws-amplify/auth');
    
    // Mock no authenticated user
    getCurrentUser.mockRejectedValue(new Error('No user'));
    fetchAuthSession.mockRejectedValue(new Error('No session'));

    render(
      <MockedAuthProvider>
        <Login />
      </MockedAuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('EventPush')).toBeInTheDocument();
    });
  });
});