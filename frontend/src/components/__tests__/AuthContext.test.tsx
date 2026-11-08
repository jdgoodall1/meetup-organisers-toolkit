import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { signIn, signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';

// import.meta is unavailable under Jest
jest.mock('../../aws-config', () => ({}));

jest.mock('aws-amplify/auth', () => ({
  signIn: jest.fn(),
  signUp: jest.fn(),
  confirmSignUp: jest.fn(),
  signOut: jest.fn(),
  getCurrentUser: jest.fn(),
  fetchAuthSession: jest.fn(),
}));

const mockSignIn = signIn as jest.Mock;
const mockSignOut = signOut as jest.Mock;
const mockGetCurrentUser = getCurrentUser as jest.Mock;
const mockFetchAuthSession = fetchAuthSession as jest.Mock;

const cognitoUser = {
  userId: 'user-123',
  username: 'user-123',
  signInDetails: { loginId: 'demo@example.com' },
};
const session = {
  tokens: { accessToken: { toString: () => 'access' }, idToken: { toString: () => 'id' } },
};

// Test component to access auth context
const TestComponent: React.FC = () => {
  const { user, isAuthenticated, login, logout, loading } = useAuth();

  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'not-loading'}</div>
      <div data-testid="authenticated">{isAuthenticated ? 'authenticated' : 'not-authenticated'}</div>
      <div data-testid="user">{user ? user.email : 'no-user'}</div>
      <button onClick={() => login('demo@example.com', 'password').catch(() => undefined)}>Login</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
};

const signedIn = () => {
  mockGetCurrentUser.mockResolvedValue(cognitoUser);
  mockFetchAuthSession.mockResolvedValue(session);
};

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.resetAllMocks();
    mockGetCurrentUser.mockRejectedValue(new Error('No user'));
    mockFetchAuthSession.mockRejectedValue(new Error('No session'));
  });

  it('provides initial unauthenticated state', async () => {
    render(<AuthProvider><TestComponent /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
  });

  it('handles successful login', async () => {
    render(<AuthProvider><TestComponent /></AuthProvider>);
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
    });

    mockSignIn.mockResolvedValue({ isSignedIn: true });
    signedIn();
    fireEvent.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent(/^authenticated$/);
    });
    expect(mockSignIn).toHaveBeenCalledWith({ username: 'demo@example.com', password: 'password' });
    expect(screen.getByTestId('user')).toHaveTextContent('demo@example.com');
  });

  it('restores an existing Cognito session', async () => {
    signedIn();
    render(<AuthProvider><TestComponent /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent(/^authenticated$/);
    });
    expect(screen.getByTestId('user')).toHaveTextContent('demo@example.com');
  });

  it('handles logout', async () => {
    signedIn();
    mockSignOut.mockResolvedValue(undefined);
    render(<AuthProvider><TestComponent /></AuthProvider>);
    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent(/^authenticated$/);
    });

    fireEvent.click(screen.getByText('Logout'));

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
    });
    expect(mockSignOut).toHaveBeenCalled();
    expect(localStorage.getItem('idToken')).toBeNull();
  });

  describe('role', () => {
    const RoleComponent: React.FC = () => {
      const { role, refreshSession } = useAuth();
      return (
        <div>
          <div data-testid="role">{role ?? 'none'}</div>
          <button onClick={() => refreshSession()}>Refresh</button>
        </div>
      );
    };
    const sessionWithGroups = (groups?: string[]) => ({
      tokens: {
        accessToken: { toString: () => 'access' },
        idToken: { toString: () => 'id', payload: groups ? { 'cognito:groups': groups } : {} },
      },
    });

    it.each([
      [['speaker'], 'speaker'],
      [['admin'], 'admin'],
      [['speaker', 'admin'], 'admin'],
      [undefined, 'none'],
    ])('maps groups %p to role %s', async (groups, expected) => {
      mockGetCurrentUser.mockResolvedValue(cognitoUser);
      mockFetchAuthSession.mockResolvedValue(sessionWithGroups(groups));
      render(<AuthProvider><RoleComponent /></AuthProvider>);
      await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent(expected));
    });

    it('refreshSession forces a token refresh and picks up new groups', async () => {
      mockGetCurrentUser.mockResolvedValue(cognitoUser);
      mockFetchAuthSession.mockResolvedValue(sessionWithGroups(['speaker']));
      render(<AuthProvider><RoleComponent /></AuthProvider>);
      await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('speaker'));

      mockFetchAuthSession.mockResolvedValue(sessionWithGroups(['speaker', 'admin']));
      fireEvent.click(screen.getByText('Refresh'));
      await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('admin'));
      expect(mockFetchAuthSession).toHaveBeenLastCalledWith({ forceRefresh: true });
    });
  });

  it('throws error when useAuth is used outside AuthProvider', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      render(<TestComponent />);
    }).toThrow('useAuth must be used within an AuthProvider');
    consoleSpy.mockRestore();
  });
});

describe('AuthContext groups', () => {
  const GroupsProbe: React.FC = () => {
    const { role, groups, canUseSpeakerView, canUseAdminView } = useAuth();
    return (
      <p data-testid="groups">
        {`${role}|${groups.join(',')}|${canUseSpeakerView}|${canUseAdminView}`}
      </p>
    );
  };

  const withGroups = (g: unknown) => {
    mockGetCurrentUser.mockResolvedValue(cognitoUser);
    mockFetchAuthSession.mockResolvedValue({
      tokens: { ...session.tokens, idToken: { toString: () => 'id', payload: { 'cognito:groups': g } } },
    });
  };

  beforeEach(() => {
    localStorage.clear();
    jest.resetAllMocks();
  });

  it('exposes all groups; role stays admin when the user is in both', async () => {
    withGroups(['speaker', 'admin']);
    render(<AuthProvider><GroupsProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('groups')).toHaveTextContent('admin|speaker,admin|true|true'));
  });

  it('a speaker-only user cannot use the admin view', async () => {
    withGroups(['speaker']);
    render(<AuthProvider><GroupsProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('groups')).toHaveTextContent('speaker|speaker|true|false'));
  });

  it('an admin-only user cannot use the speaker view', async () => {
    withGroups(['admin']);
    render(<AuthProvider><GroupsProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('groups')).toHaveTextContent('admin|admin|false|true'));
  });
});
