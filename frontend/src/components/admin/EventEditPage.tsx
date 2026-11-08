import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import type { EventInput, EventItem } from '../../services/apiTypes';
import BookingPanel from './BookingPanel';
import DeleteEventButton from './DeleteEventButton';
import EventForm from './EventForm';

/**
 * Create (`/admin/events/new`) and detail/edit (`/admin/events/:id`) page.
 * The event detail area below the form is where BookingPanel (task 13.5) goes.
 */
const EventEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [event, setEvent] = useState<EventItem>();
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    setLoading(true);
    void api.getEvent(id).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setEvent(result.data);
        setError(undefined);
      } else {
        setError(result.kind === 'error' ? result.error.message : result.message);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const submit = (input: EventInput) =>
    event ? api.updateEvent(event.eventId, { ...input, updatedAt: event.updatedAt }) : api.createEvent(input);

  return (
    <section>
      <p>
        <Link to="/admin/events">Back to events</Link>
      </p>
      <h1>{isNew ? 'New event' : event ? event.title : 'Event'}</h1>

      {loading && <p role="status">Loading event…</p>}
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">Event saved.</p>}

      {!loading && (isNew || event) && (
        <EventForm
          key={event?.updatedAt ?? 'new'}
          event={event}
          onSubmit={submit}
          onCancel={() => navigate('/admin/events')}
          onSaved={(e) => {
            if (isNew) {
              navigate(`/admin/events/${encodeURIComponent(e.eventId)}`);
            } else {
              setEvent(e);
              setSaved(true);
            }
          }}
        />
      )}

      {event && (
        <>
          <DeleteEventButton event={event} onDeleted={() => navigate('/admin/events')} onError={setError} />
          <BookingPanel event={event} />
        </>
      )}
    </section>
  );
};

export default EventEditPage;
