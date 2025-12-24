import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthContextType, UserProfile } from '../types';
import { 
  signIn, 
  signOut, 
  getCurrentUser, 
  fetchAuthSession,
  AuthUser
} from 'aws-amplify/auth';
import '../aws-config'; // Initialize Amplify configuration

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Convert Cognito user to UserProfile
  const convertCognitoUser = (cognitoUser: AuthUser): UserProfile => {
    return {
      userId: cognitoUser.userId,
      email: cognitoUser.signInDetails?.loginId || '',
      name: cognitoUser.signInDetails?.loginId || '', // Will be updated from user attributes
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
  };

  // Check for existing authentication session
  const checkAuthState = async () => {
    try {
      setLoading(true);
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      
      if (currentUser && session.tokens) {
        const userProfile = convertCognitoUser(currentUser);
        setUser(userProfile);
        
        // Store session info for API calls
        localStorage.setItem('accessToken', session.tokens.accessToken?.toString() || '');
        localStorage.setItem('idToken', session.tokens.idToken?.toString() || '');
        
        // Redirect to intended destination or dashboard
        const intendedDestination = localStorage.getItem('intendedDestination');
        if (intendedDestination) {
          localStorage.removeItem('intendedDestination');
          window.location.href = intendedDestination;
        } else if (window.location.pathname === '/login' || window.location.pathname === '/callback') {
          window.location.href = '/dashboard';
        }
      }
    } catch (error) {
      console.log('No authenticated user found:', error);
      setUser(null);
      // Clear any stored tokens
      localStorage.removeItem('accessToken');
      localStorage.removeItem('idToken');
      
      // Store intended destination for post-login redirect
      if (window.location.pathname !== '/login' && window.location.pathname !== '/callback') {
        localStorage.setItem('intendedDestination', window.location.pathname);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuthState();
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    setLoading(true);
    
    try {
      const signInResult = await signIn({
        username: email,
        password: password,
      });

      if (signInResult.isSignedIn) {
        await checkAuthState();
      } else {
        throw new Error('Sign in incomplete');
      }
    } catch (error) {
      console.error('Login error:', error);
      throw new Error(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await signOut();
      setUser(null);
      // Clear stored tokens
      localStorage.removeItem('accessToken');
      localStorage.removeItem('idToken');
    } catch (error) {
      console.error('Logout error:', error);
      // Force logout on client side even if server call fails
      setUser(null);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('idToken');
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    login,
    logout,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};