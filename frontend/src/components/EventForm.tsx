import React, { useState, useEffect } from 'react';
import { Event, EventFormData, LinkedInOrganization } from '../types';
import { apiService } from '../services/api';

interface EventFormProps {
  event?: Event;
  onSave: (eventData: EventFormData) => void;
  onCancel: () => void;
  loading?: boolean;
}

const EventForm: React.FC<EventFormProps> = ({ event, onSave, onCancel, loading = false }) => {
  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    description: '',
    dateTime: '',
    location: '',
    publishToMeetup: true,
    publishToLinkedIn: false,
    requiresConfirmation: false,
  });

  const [errors, setErrors] = useState<Partial<Record<keyof EventFormData, string>>>({});
  const [linkedInOrganizations, setLinkedInOrganizations] = useState<LinkedInOrganization[]>([]);
  const [isLinkedInConnected, setIsLinkedInConnected] = useState(false);
  const [linkedInPermissionError, setLinkedInPermissionError] = useState<string | null>(null);

  useEffect(() => {
    if (event) {
      setFormData({
        title: event.title,
        description: event.description,
        dateTime: new Date(event.dateTime).toISOString().slice(0, 16),
        location: event.location,
        publishToMeetup: event.publishToMeetup,
        publishToLinkedIn: event.publishToLinkedIn,
        requiresConfirmation: event.requiresConfirmation,
      });
    }

    // Check LinkedIn connection and permissions
    checkLinkedInPermissions();
  }, [event]);

  const checkLinkedInPermissions = async () => {
    try {
      const orgsRes: any = await apiService.getLinkedInOrganizations();
      const organizations = orgsRes?.data?.organizations || orgsRes?.organizations || (Array.isArray(orgsRes) ? orgsRes : []);
      setLinkedInOrganizations(organizations as LinkedInOrganization[]);
      setIsLinkedInConnected(true);
      setLinkedInPermissionError(null);

      // Check if user has permission to create events
      const hasEventPermissions = organizations.length === 0 || organizations.some((org: LinkedInOrganization) => org.canCreateEvents);
      if (!hasEventPermissions && formData.publishToLinkedIn) {
        setLinkedInPermissionError('You do not have permission to create LinkedIn events. You can still create posts.');
      }
    } catch (error) {
      setIsLinkedInConnected(false);
      setLinkedInOrganizations([]);
      if (formData.publishToLinkedIn) {
        setLinkedInPermissionError('LinkedIn not connected. Please connect your LinkedIn account to publish events.');
      }
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof EventFormData, string>> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (!formData.dateTime) {
      newErrors.dateTime = 'Date and time are required';
    } else {
      const eventDate = new Date(formData.dateTime);
      if (eventDate <= new Date()) {
        newErrors.dateTime = 'Event must be in the future';
      }
    }

    if (!formData.location.trim()) {
      newErrors.location = 'Location is required';
    }

    // Validate LinkedIn publishing requirements
    if (formData.publishToLinkedIn && !isLinkedInConnected) {
      newErrors.publishToLinkedIn = 'LinkedIn account must be connected to publish events';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      onSave(formData);
    }
  };

  const handleInputChange = (field: keyof EventFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }

    // Handle LinkedIn publishing toggle
    if (field === 'publishToLinkedIn' && value === true) {
      if (!isLinkedInConnected) {
        setLinkedInPermissionError('LinkedIn account must be connected to publish events.');
      } else {
        const hasEventPermissions = linkedInOrganizations.length === 0 || linkedInOrganizations.some(org => org.canCreateEvents);
        if (!hasEventPermissions) {
          setLinkedInPermissionError('You do not have permission to create LinkedIn events. You can still create posts.');
        } else {
          setLinkedInPermissionError(null);
        }
      }
    } else if (field === 'publishToLinkedIn' && value === false) {
      setLinkedInPermissionError(null);
    }
  };

  const getLinkedInStatus = () => {
    if (!isLinkedInConnected) {
      return { status: 'disconnected', message: 'Not connected' };
    }

    const hasEventPermissions = linkedInOrganizations.length === 0 || linkedInOrganizations.some(org => org.canCreateEvents);
    const hasPostPermissions = linkedInOrganizations.length === 0 || linkedInOrganizations.some(org => org.canCreatePosts);

    if (hasEventPermissions && hasPostPermissions) {
      return { status: 'full', message: 'Full permissions (Events & Posts)' };
    } else if (hasPostPermissions) {
      return { status: 'limited', message: 'Limited permissions (Posts only)' };
    } else {
      return { status: 'none', message: 'No permissions' };
    }
  };

  const linkedInStatus = getLinkedInStatus();

  return (
    <div className="event-form-container">
      <div className="event-form">
        <h2>{event ? 'Edit Event' : 'Create New Event'}</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="title">Event Title *</label>
            <input
              type="text"
              id="title"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              className={errors.title ? 'error' : ''}
              placeholder="Enter event title"
            />
            {errors.title && <span className="error-text">{errors.title}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="description">Description *</label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              className={errors.description ? 'error' : ''}
              placeholder="Describe your event"
              rows={4}
            />
            {errors.description && <span className="error-text">{errors.description}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="dateTime">Date & Time *</label>
              <input
                type="datetime-local"
                id="dateTime"
                value={formData.dateTime}
                onChange={(e) => handleInputChange('dateTime', e.target.value)}
                className={errors.dateTime ? 'error' : ''}
              />
              {errors.dateTime && <span className="error-text">{errors.dateTime}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="location">Location *</label>
              <input
                type="text"
                id="location"
                value={formData.location}
                onChange={(e) => handleInputChange('location', e.target.value)}
                className={errors.location ? 'error' : ''}
                placeholder="Event location"
              />
              {errors.location && <span className="error-text">{errors.location}</span>}
            </div>
          </div>

          <div className="form-section">
            <h3>Publishing Options</h3>
            
            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.publishToMeetup}
                  onChange={(e) => handleInputChange('publishToMeetup', e.target.checked)}
                />
                <span>Publish to Meetup.com</span>
              </label>
            </div>

            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.publishToLinkedIn}
                  onChange={(e) => handleInputChange('publishToLinkedIn', e.target.checked)}
                  disabled={!isLinkedInConnected}
                />
                <span>Publish to LinkedIn</span>
                <div className="linkedin-status">
                  <span className={`status-indicator ${linkedInStatus.status}`}></span>
                  <span className="status-text">{linkedInStatus.message}</span>
                </div>
              </label>
              {errors.publishToLinkedIn && (
                <span className="error-text">{errors.publishToLinkedIn}</span>
              )}
              {linkedInPermissionError && (
                <div className="permission-warning">
                  <span className="warning-icon">⚠️</span>
                  <span>{linkedInPermissionError}</span>
                </div>
              )}
            </div>

            {isLinkedInConnected && linkedInOrganizations.length > 0 && (
              <div className="linkedin-organizations">
                <h4>Available LinkedIn Organizations</h4>
                <div className="organizations-list">
                  {linkedInOrganizations.map(org => (
                    <div key={org.id} className="organization-item">
                      <span className="org-name">{org.name}</span>
                      <div className="org-permissions">
                        {org.canCreateEvents && (
                          <span className="permission-badge granted">Events</span>
                        )}
                        {org.canCreatePosts && (
                          <span className="permission-badge granted">Posts</span>
                        )}
                        {!org.canCreateEvents && !org.canCreatePosts && (
                          <span className="permission-badge denied">No permissions</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.requiresConfirmation}
                  onChange={(e) => handleInputChange('requiresConfirmation', e.target.checked)}
                />
                <span>Require manual confirmation before publishing</span>
              </label>
            </div>
          </div>

          <div className="form-actions">
            <button 
              type="button" 
              onClick={onCancel} 
              className="btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary"
              disabled={loading}
            >
              {loading ? 'Saving...' : (event ? 'Update Event' : 'Create Event')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EventForm;