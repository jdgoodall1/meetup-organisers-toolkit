import React, { useState, useEffect } from 'react';
import { Event } from '../types';
import { apiService } from '../services/api';

interface EventListProps {
  onEditEvent: (event: Event) => void;
  onConfirmEvent?: (event: Event) => void;
  refreshTrigger?: number;
}

const EventList: React.FC<EventListProps> = ({ onEditEvent, onConfirmEvent, refreshTrigger }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const eventsData: any = await apiService.getEvents();
      const events = eventsData?.data?.events || eventsData?.events || (Array.isArray(eventsData) ? eventsData : []);
      setEvents(events as Event[]);
    } catch (err) {
      console.error('Failed to load events:', err);
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [refreshTrigger]);

  const handleConfirmEvent = async (event: Event) => {
    try {
      await apiService.confirmEvent(event.eventId);
      if (onConfirmEvent) {
        onConfirmEvent(event);
      }
      // Refresh the events list
      await loadEvents();
    } catch (err) {
      console.error('Failed to confirm event:', err);
      setError(err instanceof Error ? err.message : 'Failed to confirm event');
    }
  };

  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (event: Event) => {
    if (event.platformStatus === 'pending_confirmation') {
      return <span className="status-badge pending">Pending Confirmation</span>;
    }
    if (event.meetupEventStatus === 'draft') {
      return <span className="status-badge draft">Draft</span>;
    }
    if (event.meetupEventStatus === 'published') {
      return <span className="status-badge published">Published</span>;
    }
    return <span className="status-badge cancelled">Cancelled</span>;
  };

  if (loading) {
    return <div className="loading">Loading events...</div>;
  }

  if (error) {
    return (
      <div className="error-state">
        <p>Error loading events: {error}</p>
        <button onClick={loadEvents} className="btn-secondary">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="event-list">
      <div className="event-list-header">
        <h2>Your Events</h2>
        <p>{events.length} events found</p>
      </div>
      
      {events.length === 0 ? (
        <div className="empty-state">
          <p>No events found. Create your first event to get started!</p>
        </div>
      ) : (
        <div className="events-grid">
          {events.map((event) => (
            <div key={event.eventId} className="event-card">
              <div className="event-header">
                <h3>{event.title}</h3>
                {getStatusBadge(event)}
              </div>
              
              <div className="event-details">
                <p className="event-date">{formatDate(event.dateTime)}</p>
                <p className="event-location">{event.location}</p>
                <p className="event-description">{event.description}</p>
              </div>
              
              <div className="event-platforms">
                {event.publishToMeetup && (
                  <span className="platform-badge meetup">
                    Meetup.com {event.meetupEventStatus}
                  </span>
                )}
                {event.publishToLinkedIn && (
                  <span className="platform-badge linkedin">
                    LinkedIn {event.linkedinEventStatus || 'pending'}
                  </span>
                )}
              </div>
              
              <div className="event-actions">
                <button 
                  onClick={() => onEditEvent(event)}
                  className="btn-secondary"
                >
                  Edit
                </button>
                {event.platformStatus === 'pending_confirmation' && (
                  <button 
                    onClick={() => handleConfirmEvent(event)}
                    className="btn-primary"
                  >
                    Confirm & Publish
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

export default EventList;