import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';

// Test component to access auth context
const TestComponent: React.FC = () => {
  const { user, isAuthenticated, login, logout, loading } = useAuth();
  
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'not-loading'}</div>
      <div data-testid="authenticated">{isAuthenticated ? 'authenticated' : 'not-authenticated'}</div>
      <div data-testid="user">{user ? user.name : 'no-user'}</div>
      <button onClick={() => login('demo@example.com', 'password')}>Login</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('provides initial unauthenticated state', async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
    });
    
    expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
  });

  it('handles successful login', async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
    });
    
    const loginButton = screen.getByText('Login');
    fireEvent.click(loginButton);
    
    // Should show loading during login
    expect(screen.getByTestId('loading')).toHaveTextContent('loading');
    
    // Wait for login to complete
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
    }, { timeout: 2000 });
    
    expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user')).toHaveTextContent('Demo User');
  });

  it('handles logout', async () => {
    // Set up authenticated state
    const mockUser = {
      userId: 'mock-user-123',
      email: 'demo@example.com',
      name: 'Demo User',
      notificationPreferences: {
        email: true,
        inApp: true,
        successNotifications: true,
        errorNotifications: true,
        reminderNotifications: true,
      },
      manualConfirmationEnabled: false,
      lastSyncTime: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    localStorage.setItem('mockUser', JSON.stringify(mockUser));
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
    });
    
    const logoutButton = screen.getByText('Logout');
    fireEvent.click(logoutButton);
    
    expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    expect(localStorage.getItem('mockUser')).toBeNull();
  });

  it('restores user session from localStorage', async () => {
    const mockUser = {
      userId: 'mock-user-123',
      email: 'demo@example.com',
      name: 'Demo User',
      notificationPreferences: {
        email: true,
        inApp: true,
        successNotifications: true,
        errorNotifications: true,
        reminderNotifications: true,
      },
      manualConfirmationEnabled: false,
      lastSyncTime: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    localStorage.setItem('mockUser', JSON.stringify(mockUser));
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
    });
    
    expect(screen.getByTestId('user')).toHaveTextContent('Demo User');
  });

  it('throws error when useAuth is used outside AuthProvider', () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => {
      render(<TestComponent />);
    }).toThrow('useAuth must be used within an AuthProvider');
    
    consoleSpy.mockRestore();
  });
});