import React, { useState, useEffect } from 'react';
import { LinkedInProfile, LinkedInOrganization } from '../types';
import { apiService } from '../services/api';

interface LinkedInAuthProps {
  onAuthSuccess?: (profile: LinkedInProfile) => void;
  onAuthError?: (error: string) => void;
}

const LinkedInAuth: React.FC<LinkedInAuthProps> = ({ onAuthSuccess, onAuthError }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [profile, setProfile] = useState<LinkedInProfile | null>(null);
  const [organizations, setOrganizations] = useState<LinkedInOrganization[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkLinkedInConnection();
  }, []);

  const checkLinkedInConnection = async () => {
    try {
      setLoading(true);
      const linkedInProfile = await apiService.getLinkedInProfile() as LinkedInProfile;
      if (linkedInProfile) {
        setProfile(linkedInProfile);
        setIsConnected(true);
        await loadOrganizations();
      }
    } catch (err) {
      // Not connected or error - this is expected if not authenticated
      setIsConnected(false);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const loadOrganizations = async () => {
    try {
      const orgs = await apiService.getLinkedInOrganizations() as LinkedInOrganization[];
      setOrganizations(orgs);
    } catch (err) {
      console.error('Failed to load LinkedIn organizations:', err);
    }
  };

  const handleConnect = () => {
    setError(null);
    
    // LinkedIn OAuth URL - this would typically be configured in environment variables
    const clientId = import.meta.env.VITE_LINKEDIN_CLIENT_ID || '78w4gzdnyvv0ut';
    const redirectUri = encodeURIComponent(`${window.location.origin}/auth/linkedin/callback`);
    const scope = encodeURIComponent('openid profile email w_member_social');
    const state = Math.random().toString(36).substring(7); // Simple state for CSRF protection
    
    // Store state in sessionStorage for verification
    sessionStorage.setItem('linkedin_oauth_state', state);
    
    const linkedInAuthUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
    
    // Open LinkedIn OAuth in a popup window
    const popup = window.open(
      linkedInAuthUrl,
      'linkedin-auth',
      'width=600,height=600,scrollbars=yes,resizable=yes'
    );

    // Listen for the popup to close or send a message
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        // Check if authentication was successful
        checkLinkedInConnection();
      }
    }, 1000);

    // Listen for messages from the popup (if using postMessage approach)
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'LINKEDIN_AUTH_SUCCESS') {
        clearInterval(checkClosed);
        popup?.close();
        handleAuthCallback(event.data.code, event.data.state);
      } else if (event.data.type === 'LINKEDIN_AUTH_ERROR') {
        clearInterval(checkClosed);
        popup?.close();
        setError(event.data.error || 'LinkedIn authentication failed');
        onAuthError?.(event.data.error || 'LinkedIn authentication failed');
      }
    };

    window.addEventListener('message', handleMessage);

    // Cleanup listener when component unmounts or popup closes
    setTimeout(() => {
      window.removeEventListener('message', handleMessage);
    }, 300000); // 5 minutes timeout
  };

  const handleAuthCallback = async (code: string, state: string) => {
    try {
      setLoading(true);
      setError(null);

      // Verify state to prevent CSRF attacks
      const storedState = sessionStorage.getItem('linkedin_oauth_state');
      if (state !== storedState) {
        throw new Error('Invalid state parameter - possible CSRF attack');
      }

      // Exchange code for access token via backend
      const result = await apiService.connectLinkedIn(code) as { profile: LinkedInProfile };
      
      if (result.profile) {
        setProfile(result.profile);
        setIsConnected(true);
        onAuthSuccess?.(result.profile);
        await loadOrganizations();
      }

      // Clean up stored state
      sessionStorage.removeItem('linkedin_oauth_state');
    } catch (err) {
      console.error('LinkedIn authentication error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to LinkedIn';
      setError(errorMessage);
      onAuthError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setLoading(true);
      setError(null);
      
      await apiService.disconnectLinkedIn();
      
      setIsConnected(false);
      setProfile(null);
      setOrganizations([]);
    } catch (err) {
      console.error('Failed to disconnect LinkedIn:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to disconnect LinkedIn';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="linkedin-auth loading">
        <div className="loading-spinner"></div>
        <p>Connecting to LinkedIn...</p>
      </div>
    );
  }

  return (
    <div className="linkedin-auth">
      {error && (
        <div className="error-banner">
          <p>Error: {error}</p>
          <button onClick={() => setError(null)} className="btn-secondary">
            Dismiss
          </button>
        </div>
      )}

      {!isConnected ? (
        <div className="linkedin-connect">
          <div className="connect-header">
            <div className="linkedin-icon">💼</div>
            <h3>Connect to LinkedIn</h3>
            <p>Connect your LinkedIn account to create events and schedule posts</p>
          </div>
          
          <button 
            onClick={handleConnect} 
            className="btn-primary linkedin-connect-btn"
            disabled={loading}
          >
            <span className="linkedin-logo">in</span>
            Connect LinkedIn Account
          </button>
        </div>
      ) : (
        <div className="linkedin-connected">
          <div className="connection-status">
            <div className="status-indicator connected"></div>
            <span>LinkedIn Connected</span>
          </div>

          {profile && (
            <div className="profile-info">
              <div className="profile-header">
                {profile.profilePicture && (
                  <img 
                    src={profile.profilePicture} 
                    alt="Profile" 
                    className="profile-picture"
                  />
                )}
                <div className="profile-details">
                  <h4>{profile.firstName} {profile.lastName}</h4>
                  {profile.email && <p>{profile.email}</p>}
                </div>
              </div>
            </div>
          )}

          {organizations.length > 0 && (
            <div className="organizations-section">
              <h4>Available Organizations</h4>
              <div className="organizations-list">
                {organizations.map((org) => (
                  <div key={org.id} className="organization-item">
                    <div className="org-info">
                      <span className="org-name">{org.name}</span>
                      <span className="org-type">{org.type}</span>
                    </div>
                    <div className="org-permissions">
                      {org.canCreateEvents && (
                        <span className="permission-badge">Events</span>
                      )}
                      {org.canCreatePosts && (
                        <span className="permission-badge">Posts</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="connection-actions">
            <button 
              onClick={handleDisconnect} 
              className="btn-secondary"
              disabled={loading}
            >
              Disconnect LinkedIn
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LinkedInAuth;