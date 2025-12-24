import React, { useState, useEffect } from 'react';
import { Event, EventFormData } from '../types';

interface EventFormProps {
  event?: Event;
  onSave: (eventData: EventFormData) => void;
  onCancel: () => void;
}

const EventForm: React.FC<EventFormProps> = ({ event, onSave, onCancel }) => {
  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    description: '',
    dateTime: '',
    location: '',
    publishToMeetup: true,
    publishToLinkedIn: false,
    requiresConfirmation: false,
  });

  const [errors, setErrors] = useState<Partial<EventFormData>>({});

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
  }, [event]);

  const validateForm = (): boolean => {
    const newErrors: Partial<EventFormData> = {};

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
  };

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
                />
                <span>Publish to LinkedIn</span>
              </label>
            </div>

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
            <button type="button" onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {event ? 'Update Event' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EventForm;