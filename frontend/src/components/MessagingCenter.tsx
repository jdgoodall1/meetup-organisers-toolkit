import React, { useState, useEffect } from 'react';
import { Message, MessageTemplate, MessageTemplateFormData, Event } from '../types';
import { apiService } from '../services/api';

const MessagingCenter: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [activeTab, setActiveTab] = useState<'messages' | 'templates' | 'schedule'>('messages');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Template form state
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState<MessageTemplateFormData>({
    name: '',
    recipientType: 'attendees',
    content: '',
    isDefault: false,
  });

  // Schedule form state
  const [scheduleForm, setScheduleForm] = useState({
    eventId: '',
    recipientType: 'attendees' as 'attendees' | 'non_rsvp_members',
    scheduledTime: '',
    templateId: '',
  });
  const [scheduling, setScheduling] = useState(false);

  // Filter state
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'attendees' | 'non_rsvp_members'>('all');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [messagesRes, templatesRes, eventsRes] = await Promise.all([
        apiService.getMessages(),
        apiService.getMessageTemplates(),
        apiService.getEvents(),
      ]);

      setMessages((messagesRes as any)?.data?.messages || (messagesRes as any)?.messages || (Array.isArray(messagesRes) ? messagesRes : []) as Message[]);
      setTemplates((templatesRes as any)?.data?.templates || (Array.isArray(templatesRes) ? templatesRes : []) as MessageTemplate[]);
      const evts = (eventsRes as any)?.data?.events || (eventsRes as any)?.events || (Array.isArray(eventsRes) ? eventsRes : []);
      setEvents(evts as Event[]);
    } catch (err) {
      console.error('Failed to load messaging data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load messaging data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCancelMessage = async (messageId: string) => {
    try {
      await apiService.cancelMessage(messageId);
      setMessages(prev =>
        prev.map(msg =>
          msg.messageId === messageId
            ? { ...msg, status: 'cancelled' as const }
            : msg
        )
      );
    } catch (err) {
      console.error('Failed to cancel message:', err);
      setError(err instanceof Error ? err.message : 'Failed to cancel message');
    }
  };

  const handleRetryMessage = async (messageId: string) => {
    try {
      await apiService.retryMessage(messageId);
      setMessages(prev =>
        prev.map(msg =>
          msg.messageId === messageId
            ? { ...msg, status: 'pending' as const, errorMessage: undefined }
            : msg
        )
      );
    } catch (err) {
      console.error('Failed to retry message:', err);
      setError(err instanceof Error ? err.message : 'Failed to retry message');
    }
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({ name: '', recipientType: 'attendees', content: '', isDefault: false });
    setShowTemplateForm(true);
  };

  const handleEditTemplate = (template: MessageTemplate) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      recipientType: template.recipientType,
      content: template.content,
      isDefault: template.isDefault,
    });
    setShowTemplateForm(true);
  };

  const handleSaveTemplate = async () => {
    try {
      if (editingTemplate) {
        await apiService.updateMessageTemplate(editingTemplate.templateId, templateForm);
        setTemplates(prev =>
          prev.map(t =>
            t.templateId === editingTemplate.templateId
              ? { ...t, ...templateForm, updatedAt: new Date() }
              : t
          )
        );
      } else {
        const created = await apiService.createMessageTemplate(templateForm) as MessageTemplate;
        setTemplates(prev => [...prev, created]);
      }
      setShowTemplateForm(false);
      setEditingTemplate(null);
    } catch (err) {
      console.error('Failed to save template:', err);
      setError(err instanceof Error ? err.message : 'Failed to save template');
    }
  };

  const handleSetDefault = async (templateId: string) => {
    try {
      await apiService.setDefaultMessageTemplate(templateId);
      setTemplates(prev =>
        prev.map(t => {
          const target = prev.find(tp => tp.templateId === templateId);
          if (!target) return t;
          if (t.templateId === templateId) return { ...t, isDefault: true };
          if (t.recipientType === target.recipientType) return { ...t, isDefault: false };
          return t;
        })
      );
    } catch (err) {
      console.error('Failed to set default template:', err);
      setError(err instanceof Error ? err.message : 'Failed to set default template');
    }
  };

  const handleScheduleMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setScheduling(true);
      await apiService.scheduleMessage({
        eventId: scheduleForm.eventId,
        recipientType: scheduleForm.recipientType,
        scheduledTime: scheduleForm.scheduledTime,
        templateId: scheduleForm.templateId || undefined,
      });
      setScheduleForm({ eventId: '', recipientType: 'attendees', scheduledTime: '', templateId: '' });
      await loadData();
    } catch (err) {
      console.error('Failed to schedule message:', err);
      setError(err instanceof Error ? err.message : 'Failed to schedule message');
    } finally {
      setScheduling(false);
    }
  };

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
    const statusClasses: Record<string, string> = {
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

  const filteredMessages = recipientFilter === 'all'
    ? messages
    : messages.filter(m => m.recipientType === recipientFilter);

  if (loading) {
    return <div className="loading" role="status">Loading messaging data...</div>;
  }

  if (error && messages.length === 0 && templates.length === 0) {
    return (
      <div className="error-state">
        <p>Error: {error}</p>
        <button onClick={loadData} className="btn-secondary">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="messaging-center">
      <div className="messaging-header">
        <h2>Messaging Center</h2>
        <p>Manage automated messages to your event participants</p>
      </div>

      {error && (
        <div className="error-banner">
          <p>Error: {error}</p>
          <button onClick={() => setError(null)} className="btn-secondary">
            Dismiss
          </button>
        </div>
      )}

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
        <button
          className={`tab-button ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          Schedule Message
        </button>
      </div>

      {activeTab === 'messages' && (
        <div className="messages-tab">
          <div className="filter-bar">
            <label htmlFor="recipient-filter">Filter by recipient:</label>
            <select
              id="recipient-filter"
              value={recipientFilter}
              onChange={(e) => setRecipientFilter(e.target.value as typeof recipientFilter)}
            >
              <option value="all">All Recipients</option>
              <option value="attendees">Event Attendees</option>
              <option value="non_rsvp_members">Non-RSVP Members</option>
            </select>
          </div>

          {filteredMessages.length === 0 ? (
            <div className="empty-state">
              <p>No messages found. Schedule a message to get started!</p>
            </div>
          ) : (
            <div className="messages-list">
              {filteredMessages.map((message) => (
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
                    {(message.status === 'pending' || message.status === 'pending_confirmation') && (
                      <button
                        className="btn-secondary"
                        onClick={() => handleCancelMessage(message.messageId)}
                      >
                        Cancel Message
                      </button>
                    )}
                    {message.status === 'failed' && (
                      <button
                        className="btn-primary"
                        onClick={() => handleRetryMessage(message.messageId)}
                      >
                        Retry Message
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="templates-tab">
          {showTemplateForm ? (
            <div className="template-form">
              <h3>{editingTemplate ? 'Edit Template' : 'Create New Template'}</h3>
              <div className="form-group">
                <label htmlFor="template-name">Template Name</label>
                <input
                  id="template-name"
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter template name"
                />
              </div>
              <div className="form-group">
                <label htmlFor="template-recipient-type">Recipient Type</label>
                <select
                  id="template-recipient-type"
                  value={templateForm.recipientType}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, recipientType: e.target.value as 'attendees' | 'non_rsvp_members' }))}
                >
                  <option value="attendees">Event Attendees</option>
                  <option value="non_rsvp_members">Non-RSVP Members</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="template-content">Content</label>
                <textarea
                  id="template-content"
                  value={templateForm.content}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Enter message content. Use {{eventTitle}}, {{eventDate}}, {{eventLocation}} as variables."
                  rows={6}
                />
              </div>
              <div className="template-variables">
                <h5>Available Variables:</h5>
                <div className="variables-list">
                  <span className="variable">{'{{eventTitle}}'}</span>
                  <span className="variable">{'{{eventDate}}'}</span>
                  <span className="variable">{'{{eventLocation}}'}</span>
                </div>
              </div>
              <div className="form-actions">
                <button className="btn-primary" onClick={handleSaveTemplate}>
                  {editingTemplate ? 'Update Template' : 'Save Template'}
                </button>
                <button className="btn-secondary" onClick={() => setShowTemplateForm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="templates-header">
                <h3>Message Templates</h3>
                <button className="btn-primary" onClick={handleCreateTemplate}>
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
                        <button
                          className="btn-secondary"
                          onClick={() => handleEditTemplate(template)}
                        >
                          Edit Template
                        </button>
                        {!template.isDefault && (
                          <button
                            className="btn-outline"
                            onClick={() => handleSetDefault(template.templateId)}
                          >
                            Set as Default
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'schedule' && (
        <div className="schedule-tab">
          <h3>Schedule a New Message</h3>
          <form onSubmit={handleScheduleMessage} className="schedule-form">
            <div className="form-group">
              <label htmlFor="schedule-event">Event</label>
              <select
                id="schedule-event"
                value={scheduleForm.eventId}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, eventId: e.target.value }))}
                required
              >
                <option value="">Select an event</option>
                {events.map(event => (
                  <option key={event.eventId} value={event.eventId}>
                    {event.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="schedule-recipient-type">Recipient Type</label>
              <select
                id="schedule-recipient-type"
                value={scheduleForm.recipientType}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, recipientType: e.target.value as 'attendees' | 'non_rsvp_members' }))}
              >
                <option value="attendees">Event Attendees</option>
                <option value="non_rsvp_members">Non-RSVP Members</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="schedule-time">Scheduled Time</label>
              <input
                id="schedule-time"
                type="datetime-local"
                value={scheduleForm.scheduledTime}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, scheduledTime: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="schedule-template">Template (optional)</label>
              <select
                id="schedule-template"
                value={scheduleForm.templateId}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, templateId: e.target.value }))}
              >
                <option value="">Use default template</option>
                {templates
                  .filter(t => t.recipientType === scheduleForm.recipientType)
                  .map(t => (
                    <option key={t.templateId} value={t.templateId}>
                      {t.name} {t.isDefault ? '(Default)' : ''}
                    </option>
                  ))}
              </select>
            </div>

            <button type="submit" className="btn-primary" disabled={scheduling}>
              {scheduling ? 'Scheduling...' : 'Schedule Message'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default MessagingCenter;
