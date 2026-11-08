import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import type { ApiResult, Booking, BookingStatus, EventItem } from '../../services/apiTypes';
import { formatEventDate, formatEventTime } from '../../utils/eventDates';

type Failure = Exclude<ApiResult<unknown>, { ok: true }>;
const errorMessage = (r: Failure): string => (r.kind === 'error' ? r.error.message : r.message);

const STATUSES: BookingStatus[] = ['proposed', 'confirmed', 'declined'];

/** `/admin/bookings`: every booking across all events, with event and status filters. */
const AdminBookings: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [eventId, setEventId] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [b, e] = await Promise.all([api.listBookings({}), api.listEvents({})]);
      if (cancelled) return;
      if (b.ok) setBookings(b.data);
      else setError(errorMessage(b));
      if (e.ok) setEvents(e.data);
      else setError(errorMessage(e));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const eventById = useMemo(() => new Map(events.map((e) => [e.eventId, e])), [events]);

  const rows = useMemo(() => {
    const filtered = bookings.filter((b) => (!status || b.status === status) && (!eventId || b.eventId === eventId));
    // Soonest event first; bookings whose event no longer exists go last.
    return [...filtered].sort((a, b) => {
      const da = eventById.get(a.eventId)?.startDateTime ?? '9999';
      const db = eventById.get(b.eventId)?.startDateTime ?? '9999';
      return da.localeCompare(db) || a.speakerNameSnapshot.localeCompare(b.speakerNameSnapshot);
    });
  }, [bookings, status, eventId, eventById]);

  return (
    <section>
      <h1>Bookings</h1>
      <p>All speaker bookings across events. Open an event to add, change or remove bookings.</p>

      <form className="events-filters" aria-label="Filter bookings" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="bk-event">Event</label>
        <select id="bk-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">All events</option>
          {[...events]
            .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime))
            .map((ev) => (
              <option key={ev.eventId} value={ev.eventId}>
                {ev.title} ({formatEventDate(ev.startDateTime)})
              </option>
            ))}
        </select>
        <label htmlFor="bk-status">Status</label>
        <select id="bk-status" value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | '')}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </form>

      {loading && <p role="status">Loading bookings…</p>}
      {error && <p role="alert">{error}</p>}

      {!loading &&
        !error &&
        (rows.length === 0 ? (
          <p>{bookings.length === 0 ? 'No bookings yet.' : 'No bookings match these filters.'}</p>
        ) : (
          <table aria-label="Bookings">
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Date</th>
                <th scope="col">Speaker</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const ev = eventById.get(b.eventId);
                return (
                  <tr key={b.bookingId}>
                    <th scope="row">
                      {ev ? (
                        <Link to={`/admin/events/${encodeURIComponent(ev.eventId)}`}>{ev.title}</Link>
                      ) : (
                        'Event no longer exists'
                      )}
                    </th>
                    <td>
                      {ev ? `${formatEventDate(ev.startDateTime)}, ${formatEventTime(ev.startDateTime)}` : '—'}
                    </td>
                    <td>
                      {b.speakerId ? (
                        <Link to={`/admin/speakers/${encodeURIComponent(b.speakerId)}`}>{b.speakerNameSnapshot}</Link>
                      ) : (
                        b.speakerNameSnapshot
                      )}
                    </td>
                    <td>{b.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
    </section>
  );
};

export default AdminBookings;
