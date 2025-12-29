import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { resendSignUpCode } from 'aws-amplify/auth';

interface ConfirmEmailProps {
  email: string;
  onBack: () => void;
  onSuccess: () => void;
  onEmailChange?: (email: string) => void;
}

const ConfirmEmail: React.FC<ConfirmEmailProps> = ({ email, onBack, onSuccess, onEmailChange }) => {
  const [localEmail, setLocalEmail] = useState(email);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [canResend, setCanResend] = useState(true);
  const [resendCooldown, setResendCooldown] = useState(0);
  const { confirmSignup, loading } = useAuth();

  // Update local email when prop changes
  useEffect(() => {
    setLocalEmail(email);
  }, [email]);

  // Cooldown timer for resend button
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [resendCooldown]);

  const handleConfirmation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!localEmail.trim()) {
      setError('Please enter your email address');
      return;
    }

    if (!confirmationCode.trim()) {
      setError('Please enter the confirmation code');
      return;
    }

    if (confirmationCode.length !== 6) {
      setError('Confirmation code must be 6 digits');
      return;
    }
    
    try {
      await confirmSignup(localEmail, confirmationCode);
      setSuccess('Email confirmed successfully! Signing you in...');
      
      // Update parent component with the email if it changed
      if (onEmailChange && localEmail !== email) {
        onEmailChange(localEmail);
      }
      
      // Give Cognito time to process the confirmation before auto-login
      setTimeout(() => {
        onSuccess();
      }, 1000); // Reduced initial delay since Login component now handles retries
      
    } catch (err) {
      console.error('Confirmation error:', err);
      
      const errorMessage = err instanceof Error ? err.message : 'Confirmation failed';
      
      if (errorMessage.includes('CodeMismatchException') || errorMessage.includes('Invalid verification code')) {
        setError('Invalid confirmation code. Please check your email and try again.');
      } else if (errorMessage.includes('ExpiredCodeException') || errorMessage.includes('expired')) {
        setError('Confirmation code has expired. Please request a new code.');
      } else if (errorMessage.includes('NotAuthorizedException') || errorMessage.includes('already confirmed')) {
        setError('This email is already confirmed. You can sign in now.');
      } else if (errorMessage.includes('UserNotFoundException')) {
        setError('User not found. Please sign up first.');
      } else if (errorMessage.includes('TooManyRequestsException')) {
        setError('Too many attempts. Please wait a few minutes before trying again.');
      } else {
        setError(errorMessage);
      }
    }
  };

  const handleResendCode = async () => {
    if (!canResend || isResending) return;
    
    if (!localEmail.trim()) {
      setError('Please enter your email address first');
      return;
    }
    
    setIsResending(true);
    setError('');
    setSuccess('');
    
    try {
      await resendSignUpCode({ username: localEmail });
      setSuccess('New confirmation code sent to your email!');
      setCanResend(false);
      setResendCooldown(60); // 60 second cooldown
    } catch (err) {
      console.error('Resend error:', err);
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to resend code';
      
      if (errorMessage.includes('NotAuthorizedException') || errorMessage.includes('already confirmed')) {
        setError('This email is already confirmed. You can sign in now.');
      } else if (errorMessage.includes('UserNotFoundException')) {
        setError('User not found. Please sign up first.');
      } else if (errorMessage.includes('TooManyRequestsException')) {
        setError('Too many requests. Please wait before requesting another code.');
      } else {
        setError('Failed to resend confirmation code. Please try again.');
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="confirm-email-container">
      <div className="confirm-email-form">
        <h2>Confirm Your Email</h2>
        {localEmail ? (
          <p>
            We've sent a 6-digit confirmation code to:
            <br />
            <strong>{localEmail}</strong>
          </p>
        ) : (
          <p>
            Enter your email address and the 6-digit confirmation code sent to your inbox.
          </p>
        )}
        <p className="help-text">
          Please check your email (including spam folder) and enter the code below.
        </p>
        
        <form onSubmit={handleConfirmation}>
          {!email && (
            <div className="form-group">
              <label htmlFor="email">Email Address:</label>
              <input
                type="email"
                id="email"
                value={localEmail}
                onChange={(e) => setLocalEmail(e.target.value)}
                required
                placeholder="Enter your email address"
                autoComplete="email"
              />
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="confirmationCode">Confirmation Code:</label>
            <input
              type="text"
              id="confirmationCode"
              value={confirmationCode}
              onChange={(e) => {
                // Only allow numbers and limit to 6 digits
                const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                setConfirmationCode(value);
              }}
              required
              placeholder="Enter 6-digit code"
              maxLength={6}
              pattern="[0-9]{6}"
              className="confirmation-code-input"
              autoComplete="one-time-code"
            />
          </div>
          
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}
          
          <button type="submit" disabled={loading || success.includes('successfully')}>
            {loading ? 'Confirming...' : 'Confirm Email'}
          </button>
        </form>

        <div className="resend-section">
          <p>Didn't receive the code?</p>
          <button 
            type="button" 
            className="link-button"
            onClick={handleResendCode}
            disabled={!canResend || isResending}
          >
            {isResending ? 'Sending...' : 
             resendCooldown > 0 ? `Resend Code (${resendCooldown}s)` : 
             'Resend Code'}
          </button>
        </div>

        <div className="back-section">
          <button 
            type="button" 
            className="link-button" 
            onClick={onBack}
            disabled={loading}
          >
            ← Back to Sign Up
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmEmail;