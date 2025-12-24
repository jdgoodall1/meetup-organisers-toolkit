import React, { useState, useEffect } from 'react';
import { Event } from '../types';
import { mockEvents } from '../services/mockData';

interface EventListProps {
  onEditEvent: (event: Event) => void;
}

const EventList: React.FC<EventListProps> = ({ onEditEvent }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setEvents(mockEvents);
      setLoading(false);
    }, 500);
  }, []);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
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
                  <button className="btn-primary">
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