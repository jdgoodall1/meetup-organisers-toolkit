import React, { useState } from 'react';
import { Event, EventFormData } from '../types';
import { apiService } from '../services/api';
import Navigation from './Navigation';
import EventList from './EventList';
import EventForm from './EventForm';
import SocialMediaScheduler from './SocialMediaScheduler';
import MessagingCenter from './MessagingCenter';
import NotificationCenter from './NotificationCenter';

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('events');
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleCreateEvent = () => {
    setEditingEvent(undefined);
    setShowEventForm(true);
  };

  const handleEditEvent = (event: Event) => {
    setEditingEvent(event);
    setShowEventForm(true);
  };

  const handleSaveEvent = async (eventData: EventFormData) => {
    try {
      setLoading(true);
      setError(null);

      // Convert datetime string to Date object
      const eventPayload = {
        ...eventData,
        dateTime: new Date(eventData.dateTime)
      };

      if (editingEvent) {
        // Update existing event
        await apiService.updateEvent(editingEvent.eventId, eventPayload);
      } else {
        // Create new event
        await apiService.createEvent(eventPayload);
      }

      setShowEventForm(false);
      setEditingEvent(undefined);
      setRefreshTrigger(prev => prev + 1); // Trigger events list refresh
    } catch (err) {
      console.error('Failed to save event:', err);
      setError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEventForm = () => {
    setShowEventForm(false);
    setEditingEvent(undefined);
    setError(null);
  };

  const handleConfirmEvent = (_event: Event) => {
    // Refresh the events list when an event is confirmed
    setRefreshTrigger(prev => prev + 1);
  };

  const renderContent = () => {
    if (showEventForm) {
      return (
        <div>
          {error && (
            <div className="error-banner">
              <p>Error: {error}</p>
              <button onClick={() => setError(null)} className="btn-secondary">
                Dismiss
              </button>
            </div>
          )}
          <EventForm
            event={editingEvent}
            onSave={handleSaveEvent}
            onCancel={handleCancelEventForm}
            loading={loading}
          />
        </div>
      );
    }

    switch (activeTab) {
      case 'events':
        return (
          <div className="events-content">
            <div className="content-header">
              <h2>Event Management</h2>
              <button onClick={handleCreateEvent} className="btn-primary">
                Create New Event
              </button>
            </div>
            <EventList 
              onEditEvent={handleEditEvent} 
              onConfirmEvent={handleConfirmEvent}
              refreshTrigger={refreshTrigger}
            />
          </div>
        );
      case 'social':
        return <SocialMediaScheduler />;
      case 'messaging':
        return <MessagingCenter />;
      case 'notifications':
        return <NotificationCenter />;
      default:
        return <div>Page not found</div>;
    }
  };

  return (
    <div className="dashboard">
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="dashboard-content">
        {renderContent()}
      </main>
    </div>
  );
};

export default Dashboard;