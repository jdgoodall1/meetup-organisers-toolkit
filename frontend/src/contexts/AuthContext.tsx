import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthContextType, Role, UserProfile } from '../types';
import { groupsFromClaim, roleFromGroups } from '../utils/roles';
import { 
  signIn, 
  signUp,
  confirmSignUp,
  signOut, 
  getCurrentUser, 
  fetchAuthSession,
  AuthUser
} from 'aws-amplify/auth';
import '../aws-config'; // Initialize Amplify configuration

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
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
  const [role, setRole] = useState<Role | null>(null);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Convert Cognito user to UserProfile
  const convertCognitoUser = (cognitoUser: AuthUser): UserProfile => {
    return {
      userId: cognitoUser.userId,
      email: cognitoUser.signInDetails?.loginId || '',
      name: cognitoUser.signInDetails?.loginId || '', // Will be updated from user attributes
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };

  // Check for existing authentication session
  const checkAuthState = async (forceRefresh = false) => {
    try {
      setLoading(true);
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession(forceRefresh ? { forceRefresh: true } : undefined);
      
      if (currentUser && session.tokens) {
        const userProfile = convertCognitoUser(currentUser);
        setUser(userProfile);
        const claim = session.tokens.idToken?.payload?.['cognito:groups'];
        setRole(roleFromGroups(claim));
        setGroups(groupsFromClaim(claim));
        
        // Store session info for API calls
        localStorage.setItem('accessToken', session.tokens.accessToken?.toString() || '');
        localStorage.setItem('idToken', session.tokens.idToken?.toString() || '');
        
        // Redirect to intended destination or dashboard
        const intendedDestination = localStorage.getItem('intendedDestination');
        if (intendedDestination) {
          localStorage.removeItem('intendedDestination');
          window.location.href = intendedDestination;
        }
        // Otherwise the router redirects by role (see homePathForRole).
      }
    } catch (error) {
      console.log('No authenticated user found:', error);
      setUser(null);
      setRole(null);
      setGroups([]);
      // Clear any stored tokens
      localStorage.removeItem('accessToken');
      localStorage.removeItem('idToken');
      
      // Store intended destination for post-login redirect
      if (window.location.pathname !== '/login') {
        localStorage.setItem('intendedDestination', window.location.pathname);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuthState();
    // Run once on mount; auth flow is reworked in a later task.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      
      // Provide more specific error messages
      if (error instanceof Error) {
        const message = error.message;
        if (message.includes('UserNotConfirmedException')) {
          throw new Error('Please confirm your email address before signing in.');
        } else if (message.includes('NotAuthorizedException')) {
          throw new Error('Invalid email or password.');
        } else if (message.includes('UserNotFoundException')) {
          throw new Error('No account found with this email address.');
        } else if (message.includes('TooManyRequestsException')) {
          throw new Error('Too many login attempts. Please wait a few minutes before trying again.');
        } else {
          throw new Error(message);
        }
      } else {
        throw new Error('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const signup = async (email: string, password: string, name?: string): Promise<void> => {
    setLoading(true);
    
    try {
      const signUpResult = await signUp({
        username: email,
        password: password,
        options: {
          userAttributes: {
            email: email,
            name: name || email.split('@')[0], // Use email prefix as default name
          },
        },
      });

      // Don't throw an error if confirmation is required - this is expected
      if (!signUpResult.isSignUpComplete) {
        // This is normal - user needs to confirm their email
        return; // Don't throw an error, just return
      }
    } catch (error) {
      console.error('Signup error:', error);
      if (error instanceof Error) {
        if (error.message.includes('UsernameExistsException') || error.message.includes('already exists')) {
          throw new Error('An account with this email already exists. Please try logging in instead.');
        } else if (error.message.includes('Password did not conform with policy')) {
          // Server-side backstop; the sign-up form validates client-side first.
          const detail = error.message.split('Password did not conform with policy:')[1]?.trim();
          const reason = detail
            ? detail.charAt(0).toLowerCase() + detail.slice(1).replace(/\.$/, '')
            : 'it does not meet the requirements';
          throw new Error(
            `Your password doesn't meet the requirements: ${reason}. Use at least 8 characters with an uppercase letter, a lowercase letter and a number.`
          );
        } else {
          throw new Error(error.message);
        }
      } else {
        throw new Error('Signup failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const confirmSignup = async (email: string, confirmationCode: string): Promise<void> => {
    setLoading(true);
    
    try {
      const result = await confirmSignUp({
        username: email,
        confirmationCode: confirmationCode,
      });
      
      // Log the result for debugging
      console.log('Confirmation result:', result);
      
    } catch (error) {
      console.error('Confirmation error:', error);
      
      // Provide more specific error messages
      if (error instanceof Error) {
        const message = error.message;
        if (message.includes('CodeMismatchException')) {
          throw new Error('Invalid confirmation code. Please check your email and try again.');
        } else if (message.includes('ExpiredCodeException')) {
          throw new Error('Confirmation code has expired. Please request a new code.');
        } else if (message.includes('NotAuthorizedException')) {
          throw new Error('This email is already confirmed. You can sign in now.');
        } else if (message.includes('UserNotFoundException')) {
          throw new Error('User not found. Please sign up first.');
        } else if (message.includes('TooManyRequestsException')) {
          throw new Error('Too many attempts. Please wait a few minutes before trying again.');
        } else {
          throw new Error(message);
        }
      } else {
        throw new Error('Confirmation failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await signOut();
      setUser(null);
      setRole(null);
      setGroups([]);
      // Clear stored tokens
      localStorage.removeItem('accessToken');
      localStorage.removeItem('idToken');
    } catch (error) {
      console.error('Logout error:', error);
      // Force logout on client side even if server call fails
      setUser(null);
      setRole(null);
      setGroups([]);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('idToken');
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    role,
    groups,
    canUseSpeakerView: groups.includes('speaker'),
    canUseAdminView: groups.includes('admin'),
    refreshSession: () => checkAuthState(true),
    login,
    signup,
    confirmSignup,
    logout,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};