import React, { useEffect } from 'react';

const LinkedInCallback: React.FC = () => {
  useEffect(() => {
    // Extract code and state from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');

    if (error) {
      // Send error message to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'LINKEDIN_AUTH_ERROR',
          error: errorDescription || error
        }, window.location.origin);
      }
      window.close();
      return;
    }

    if (code && state) {
      // Send success message to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'LINKEDIN_AUTH_SUCCESS',
          code,
          state
        }, window.location.origin);
      }
      window.close();
      return;
    }

    // If no code or error, something went wrong
    if (window.opener) {
      window.opener.postMessage({
        type: 'LINKEDIN_AUTH_ERROR',
        error: 'No authorization code received'
      }, window.location.origin);
    }
    window.close();
  }, []);

  return (
    <div className="linkedin-callback">
      <div className="callback-content">
        <div className="loading-spinner"></div>
        <p>Processing LinkedIn authentication...</p>
        <p>This window will close automatically.</p>
      </div>
    </div>
  );
};

export default LinkedInCallback;