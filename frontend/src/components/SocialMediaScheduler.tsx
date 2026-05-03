import React, { useState, useEffect } from 'react';
import { ScheduledPost, LinkedInOrganization } from '../types';
import { apiService } from '../services/api';
import LinkedInAuth from './LinkedInAuth';

const SocialMediaScheduler: React.FC = () => {
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [organizations, setOrganizations] = useState<LinkedInOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLinkedInConnected, setIsLinkedInConnected] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    loadData();
  }, [refreshTrigger]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load scheduled posts
      const postsRes: any = await apiService.getScheduledPosts();
      const posts = postsRes?.data?.posts || postsRes?.posts || (Array.isArray(postsRes) ? postsRes : []);
      setScheduledPosts(posts as ScheduledPost[]);

      // Check LinkedIn connection and load organizations
      try {
        const orgsRes: any = await apiService.getLinkedInOrganizations();
        const orgs = orgsRes?.data?.organizations || orgsRes?.organizations || (Array.isArray(orgsRes) ? orgsRes : []);
        setOrganizations(orgs as LinkedInOrganization[]);
        setIsLinkedInConnected(true);
      } catch (linkedInError) {
        // LinkedIn not connected or error
        setIsLinkedInConnected(false);
        setOrganizations([]);
      }
    } catch (err) {
      console.error('Failed to load social media data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: ScheduledPost['status']) => {
    const statusClasses = {
      pending: 'status-badge pending',
      pending_confirmation: 'status-badge pending-confirmation',
      published: 'status-badge published',
      failed: 'status-badge failed',
      cancelled: 'status-badge cancelled',
    };

    const statusLabels = {
      pending: 'Pending',
      pending_confirmation: 'Awaiting Confirmation',
      published: 'Published',
      failed: 'Failed',
      cancelled: 'Cancelled',
    };

    return (
      <span className={statusClasses[status]}>
        {statusLabels[status]}
      </span>
    );
  };

  const handleCancelPost = async (postId: string) => {
    try {
      await apiService.cancelScheduledPost(postId);
      setScheduledPosts(prev => 
        prev.map(post => 
          post.postId === postId 
            ? { ...post, status: 'cancelled' as const }
            : post
        )
      );
    } catch (err) {
      console.error('Failed to cancel post:', err);
      setError(err instanceof Error ? err.message : 'Failed to cancel post');
    }
  };

  const handleRetryPost = async (postId: string) => {
    try {
      const post = scheduledPosts.find(p => p.postId === postId);
      if (!post) return;

      // Retry by scheduling the post again
      await apiService.scheduleLinkedInPost({
        content: post.content,
        scheduledTime: post.scheduledTime,
        visibility: 'public' // Default visibility
      });

      // Refresh the posts list
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error('Failed to retry post:', err);
      setError(err instanceof Error ? err.message : 'Failed to retry post');
    }
  };

  const handleLinkedInAuthSuccess = () => {
    setIsLinkedInConnected(true);
    setRefreshTrigger(prev => prev + 1); // Reload data
  };

  const handleLinkedInAuthError = (errorMessage: string) => {
    setError(`LinkedIn authentication failed: ${errorMessage}`);
  };

  const getOrganizationName = (organizationId?: string) => {
    if (!organizationId) return 'Personal';
    const org = organizations.find(o => o.id === organizationId);
    return org ? org.name : 'Unknown Organization';
  };

  const hasPostPermissions = () => {
    return isLinkedInConnected && (
      organizations.length === 0 || // Personal account
      organizations.some(org => org.canCreatePosts)
    );
  };

  if (loading) {
    return (
      <div className="social-media-scheduler">
        <div className="loading">Loading social media data...</div>
      </div>
    );
  }

  return (
    <div className="social-media-scheduler">
      <div className="scheduler-header">
        <h2>Social Media Posts</h2>
        <p>Manage your automated LinkedIn posts</p>
      </div>

      {error && (
        <div className="error-banner">
          <p>Error: {error}</p>
          <button onClick={() => setError(null)} className="btn-secondary">
            Dismiss
          </button>
        </div>
      )}

      {/* LinkedIn Authentication Section */}
      <div className="linkedin-section">
        <LinkedInAuth 
          onAuthSuccess={handleLinkedInAuthSuccess}
          onAuthError={handleLinkedInAuthError}
        />
      </div>

      {/* Permission Status */}
      {isLinkedInConnected && (
        <div className="permissions-status">
          <h3>LinkedIn Permissions</h3>
          <div className="permission-info">
            {hasPostPermissions() ? (
              <div className="permission-granted">
                <span className="status-indicator connected"></span>
                <span>You can create and schedule LinkedIn posts</span>
              </div>
            ) : (
              <div className="permission-denied">
                <span className="status-indicator error"></span>
                <span>Limited permissions - some features may not be available</span>
              </div>
            )}
          </div>

          {organizations.length > 0 && (
            <div className="organizations-permissions">
              <h4>Organization Permissions</h4>
              {organizations.map(org => (
                <div key={org.id} className="org-permission">
                  <span className="org-name">{org.name}</span>
                  <div className="permissions">
                    {org.canCreatePosts ? (
                      <span className="permission-badge granted">Posts ✓</span>
                    ) : (
                      <span className="permission-badge denied">Posts ✗</span>
                    )}
                    {org.canCreateEvents ? (
                      <span className="permission-badge granted">Events ✓</span>
                    ) : (
                      <span className="permission-badge denied">Events ✗</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="schedule-info">
        <h3>Automatic Posting Schedule</h3>
        <div className="schedule-timeline">
          <div className="timeline-item">
            <span className="timeline-marker">1</span>
            <span className="timeline-text">1 month before event</span>
          </div>
          <div className="timeline-item">
            <span className="timeline-marker">2</span>
            <span className="timeline-text">2 weeks before event</span>
          </div>
          <div className="timeline-item">
            <span className="timeline-marker">3</span>
            <span className="timeline-text">1 week before event</span>
          </div>
          <div className="timeline-item">
            <span className="timeline-marker">4</span>
            <span className="timeline-text">3 days before event</span>
          </div>
          <div className="timeline-item">
            <span className="timeline-marker">5</span>
            <span className="timeline-text">Day of event</span>
          </div>
        </div>
      </div>

      {!isLinkedInConnected ? (
        <div className="empty-state">
          <p>Connect your LinkedIn account to view and manage scheduled posts.</p>
        </div>
      ) : scheduledPosts.length === 0 ? (
        <div className="empty-state">
          <p>No scheduled posts found. Create an event with LinkedIn publishing enabled to automatically schedule social media posts!</p>
        </div>
      ) : (
        <div className="posts-list">
          {scheduledPosts.map((post) => (
            <div key={post.postId} className="post-card">
              <div className="post-header">
                <div className="post-platform">
                  <span className="platform-icon">💼</span>
                  <span>LinkedIn</span>
                  <span className="organization-name">
                    ({getOrganizationName(post.userId)})
                  </span>
                </div>
                {getStatusBadge(post.status)}
              </div>

              <div className="post-content">
                <p>{post.content}</p>
              </div>

              <div className="post-details">
                <div className="post-schedule">
                  <strong>Scheduled:</strong> {formatDate(post.scheduledTime)}
                </div>
                {post.externalPostId && (
                  <div className="post-id">
                    <strong>LinkedIn Post ID:</strong> {post.externalPostId}
                  </div>
                )}
                {post.errorMessage && (
                  <div className="post-error">
                    <strong>Error:</strong> {post.errorMessage}
                  </div>
                )}
                {post.requiresConfirmation && (
                  <div className="post-confirmation">
                    <strong>Status:</strong> Awaiting manual confirmation
                  </div>
                )}
              </div>

              <div className="post-actions">
                {post.status === 'pending' && (
                  <button 
                    onClick={() => handleCancelPost(post.postId)}
                    className="btn-secondary"
                  >
                    Cancel Post
                  </button>
                )}
                {post.status === 'failed' && (
                  <button 
                    onClick={() => handleRetryPost(post.postId)}
                    className="btn-primary"
                  >
                    Retry Post
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SocialMediaScheduler;