import React, { useState, useEffect } from 'react';
import { ScheduledPost } from '../types';
import { mockScheduledPosts } from '../services/mockData';

const SocialMediaScheduler: React.FC = () => {
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setScheduledPosts(mockScheduledPosts);
      setLoading(false);
    }, 500);
  }, []);

  const formatDate = (date: Date) => {
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

    return <span className={statusClasses[status]}>{status.replace('_', ' ')}</span>;
  };

  const handleCancelPost = (postId: string) => {
    setScheduledPosts(prev => 
      prev.map(post => 
        post.postId === postId 
          ? { ...post, status: 'cancelled' as const }
          : post
      )
    );
  };

  if (loading) {
    return <div className="loading">Loading scheduled posts...</div>;
  }

  return (
    <div className="social-media-scheduler">
      <div className="scheduler-header">
        <h2>Social Media Posts</h2>
        <p>Manage your automated LinkedIn posts</p>
      </div>

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

      {scheduledPosts.length === 0 ? (
        <div className="empty-state">
          <p>No scheduled posts found. Create an event to automatically schedule social media posts!</p>
        </div>
      ) : (
        <div className="posts-list">
          {scheduledPosts.map((post) => (
            <div key={post.postId} className="post-card">
              <div className="post-header">
                <div className="post-platform">
                  <span className="platform-icon">📱</span>
                  <span>LinkedIn</span>
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
                    <strong>Post ID:</strong> {post.externalPostId}
                  </div>
                )}
                {post.errorMessage && (
                  <div className="post-error">
                    <strong>Error:</strong> {post.errorMessage}
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
                  <button className="btn-primary">
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