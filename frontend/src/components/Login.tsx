import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ConfirmEmail from './ConfirmEmail';
import { APP_NAME } from '../config/app';
import { PASSWORD_RULES, getUnmetPasswordRules } from '../utils/password';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [mode, setMode] = useState<'login' | 'signup' | 'confirm'>('login');
  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(false);
  const { login, signup, loading } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const unmet = getUnmetPasswordRules(password);
    if (unmet.length > 0) {
      setPasswordErrors(unmet.map((rule) => rule.message));
      return;
    }
    setPasswordErrors([]);
    
    try {
      await signup(email, password, name);
      // Force transition to confirmation mode regardless of the response
      setMode('confirm');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Signup failed';
      
      if (errorMessage.includes('already exists')) {
        setError('An account with this email already exists. Please try logging in instead.');
      } else if (errorMessage.includes('confirmation') || errorMessage.includes('CONFIRMATION_REQUIRED')) {
        setMode('confirm');
      } else {
        setError(errorMessage);
      }
    }
  };

  const handleConfirmationSuccess = async () => {
    setIsAutoLoggingIn(true);
    setError(''); // Clear any previous errors
    
    // Give Cognito more time to process the confirmation
    // and implement retry logic for better reliability
    const maxRetries = 3;
    const baseDelay = 2000; // Start with 2 seconds
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Sign in straight away; only back off (2s, 4s) if Cognito hasn't caught up yet
        if (attempt > 1) {
          const delay = baseDelay * Math.pow(2, attempt - 2);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        await login(email, password);
        setIsAutoLoggingIn(false);
        return; // Success, exit the retry loop
        
      } catch (loginErr) {
        const errorMessage = loginErr instanceof Error ? loginErr.message : 'Login failed';
        
        // If it's a confirmation issue and we have retries left, continue
        if (errorMessage.includes('UserNotConfirmedException') && attempt < maxRetries) {
          continue;
        }
        
        // If it's the last attempt or a different error, give up
        if (attempt === maxRetries) {
          setIsAutoLoggingIn(false);
          setMode('login');
          setError('Email confirmed successfully! Please sign in with your credentials.');
          return;
        }
      }
    }
  };

  const handleEmailChange = (newEmail: string) => {
    setEmail(newEmail);
  };

  // If auto-logging in, show loading screen
  if (isAutoLoggingIn) {
    return (
      <div className="login-container">
        <div className="login-form">
          <h1>{APP_NAME}</h1>
          <div className="loading-screen">
            <div className="loading-spinner"></div>
            <p>Signing you in...</p>
            <p className="help-text">This may take a few moments while we verify your account.</p>
          </div>
        </div>
      </div>
    );
  }

  // If in confirm mode, show the dedicated confirmation component
  if (mode === 'confirm') {
    return (
      <ConfirmEmail
        email={email}
        onBack={() => setMode('signup')}
        onSuccess={handleConfirmationSuccess}
        onEmailChange={handleEmailChange}
      />
    );
  }

  return (
    <div className="login-container">
      <div className="login-form">
        <h1>{APP_NAME}</h1>
        <p>
          {mode === 'login' && 'Sign in to manage your events'}
          {mode === 'signup' && 'Create your account'}
        </p>
        
        {/* Login Form */}
        {mode === 'login' && (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="email">Email:</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your email"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password:</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
              />
            </div>
            
            {error && <div className="error-message">{error}</div>}
            
            <button type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            
            <p className="auth-switch">
              Don't have an account?{' '}
              <button 
                type="button" 
                className="link-button" 
                onClick={() => setMode('signup')}
              >
                Create Account
              </button>
            </p>
            
            <p className="auth-switch">
              Need to confirm your email?{' '}
              <button 
                type="button" 
                className="link-button" 
                onClick={() => {
                  setMode('confirm');
                  // Clear email so user can enter it manually
                  setEmail('');
                }}
              >
                Enter Confirmation Code
              </button>
            </p>
          </form>
        )}

        {/* Signup Form */}
        {mode === 'signup' && (
          <form onSubmit={handleSignup}>
            <div className="form-group">
              <label htmlFor="name">Name:</label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name (optional)"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="email">Email:</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your email"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password:</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordErrors.length > 0) {
                    setPasswordErrors(getUnmetPasswordRules(e.target.value).map((r) => r.message));
                  }
                }}
                required
                placeholder="Enter your password"
                aria-invalid={passwordErrors.length > 0}
                aria-describedby={
                  passwordErrors.length > 0
                    ? 'password-requirements password-errors'
                    : 'password-requirements'
                }
              />
              <ul id="password-requirements" className="help-text password-requirements">
                {PASSWORD_RULES.map((rule) => (
                  <li key={rule.id} data-testid={`password-rule-${rule.id}`}>
                    {rule.test(password) ? '✓ Met: ' : '✗ Required: '}
                    {rule.label}
                  </li>
                ))}
              </ul>
              {passwordErrors.length > 0 && (
                <div id="password-errors" role="alert" className="error-message">
                  {passwordErrors.map((message) => (
                    <div key={message}>{message}</div>
                  ))}
                </div>
              )}
            </div>
            
            {error && <div className="error-message">{error}</div>}

            <p className="help-text signup-next-step">
              <strong>Step 1 of 2.</strong> Next, we'll email a 6-digit code to the address
              above. You'll enter it on the following screen to finish creating your account.
            </p>
            
            <button type="submit" disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
            
            <p className="auth-switch">
              Already have an account?{' '}
              <button 
                type="button" 
                className="link-button" 
                onClick={() => setMode('login')}
              >
                Sign In
              </button>
            </p>
          </form>
        )}
        
        <div className="auth-info">
          <p><strong>Authentication:</strong></p>
          <p>• Email/Password (AWS Cognito)</p>
          <p>• Secure session management</p>
          <p>• Email verification required</p>
        </div>
      </div>
    </div>
  );
};

export default Login;