import React, { useState } from 'react';
import { Event, EventFormData } from '../types';
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

  const handleCreateEvent = () => {
    setEditingEvent(undefined);
    setShowEventForm(true);
  };

  const handleEditEvent = (event: Event) => {
    setEditingEvent(event);
    setShowEventForm(true);
  };

  const handleSaveEvent = (eventData: EventFormData) => {
    // Mock save operation
    console.log('Saving event:', eventData);
    
    // Simulate API call
    setTimeout(() => {
      setShowEventForm(false);
      setEditingEvent(undefined);
      // In a real app, this would refresh the events list
    }, 1000);
  };

  const handleCancelEventForm = () => {
    setShowEventForm(false);
    setEditingEvent(undefined);
  };

  const renderContent = () => {
    if (showEventForm) {
      return (
        <EventForm
          event={editingEvent}
          onSave={handleSaveEvent}
          onCancel={handleCancelEventForm}
        />
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
            <EventList onEditEvent={handleEditEvent} />
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