import React, { useState, useEffect } from 'react';
import { Message, MessageTemplate } from '../types';
import { mockMessages, mockMessageTemplates } from '../services/mockData';

const MessagingCenter: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [activeTab, setActiveTab] = useState<'messages' | 'templates'>('messages');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setMessages(mockMessages);
      setTemplates(mockMessageTemplates);
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

  const getStatusBadge = (status: Message['status']) => {
    const statusClasses = {
      pending: 'status-badge pending',
      pending_confirmation: 'status-badge pending-confirmation',
      sent: 'status-badge sent',
      failed: 'status-badge failed',
      cancelled: 'status-badge cancelled',
    };

    return <span className={statusClasses[status]}>{status.replace('_', ' ')}</span>;
  };

  const getRecipientTypeLabel = (type: 'attendees' | 'non_rsvp_members') => {
    return type === 'attendees' ? 'Event Attendees' : 'Non-RSVP Members';
  };

  if (loading) {
    return <div className="loading">Loading messaging data...</div>;
  }

  return (
    <div className="messaging-center">
      <div className="messaging-header">
        <h2>Messaging Center</h2>
        <p>Manage automated messages to your event participants</p>
      </div>

      <div className="tab-navigation">
        <button 
          className={`tab-button ${activeTab === 'messages' ? 'active' : ''}`}
          onClick={() => setActiveTab('messages')}
        >
          Messages ({messages.length})
        </button>
        <button 
          className={`tab-button ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          Templates ({templates.length})
        </button>
      </div>

      {activeTab === 'messages' ? (
        <div className="messages-tab">
          {messages.length === 0 ? (
            <div className="empty-state">
              <p>No messages found. Create an event to automatically schedule messages!</p>
            </div>
          ) : (
            <div className="messages-list">
              {messages.map((message) => (
                <div key={message.messageId} className="message-card">
                  <div className="message-header">
                    <div className="message-recipient">
                      <span className="recipient-icon">👥</span>
                      <span>{getRecipientTypeLabel(message.recipientType)}</span>
                    </div>
                    {getStatusBadge(message.status)}
                  </div>

                  <div className="message-content">
                    <p>{message.content}</p>
                  </div>

                  <div className="message-details">
                    <div className="message-schedule">
                      <strong>Scheduled:</strong> {formatDate(message.scheduledTime)}
                    </div>
                    <div className="message-recipients">
                      <strong>Recipients:</strong> {message.sentCount}/{message.recipientCount}
                    </div>
                    {message.errorMessage && (
                      <div className="message-error">
                        <strong>Error:</strong> {message.errorMessage}
                      </div>
                    )}
                  </div>

                  <div className="message-actions">
                    {message.status === 'pending' && (
                      <button className="btn-secondary">
                        Cancel Message
                      </button>
                    )}
                    {message.status === 'failed' && (
                      <button className="btn-primary">
                        Retry Message
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="templates-tab">
          <div className="templates-header">
            <h3>Message Templates</h3>
            <button className="btn-primary">
              Create New Template
            </button>
          </div>

          {templates.length === 0 ? (
            <div className="empty-state">
              <p>No templates found. Create your first message template!</p>
            </div>
          ) : (
            <div className="templates-list">
              {templates.map((template) => (
                <div key={template.templateId} className="template-card">
                  <div className="template-header">
                    <h4>{template.name}</h4>
                    <div className="template-badges">
                      {template.isDefault && (
                        <span className="badge default">Default</span>
                      )}
                      <span className="badge recipient-type">
                        {getRecipientTypeLabel(template.recipientType)}
                      </span>
                    </div>
                  </div>

                  <div className="template-content">
                    <p>{template.content}</p>
                  </div>

                  <div className="template-variables">
                    <h5>Available Variables:</h5>
                    <div className="variables-list">
                      <span className="variable">{'{{eventTitle}}'}</span>
                      <span className="variable">{'{{eventDate}}'}</span>
                      <span className="variable">{'{{eventLocation}}'}</span>
                    </div>
                  </div>

                  <div className="template-actions">
                    <button className="btn-secondary">
                      Edit Template
                    </button>
                    {!template.isDefault && (
                      <button className="btn-outline">
                        Set as Default
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MessagingCenter;