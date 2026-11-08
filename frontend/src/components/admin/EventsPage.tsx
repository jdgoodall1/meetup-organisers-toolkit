import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import type { EventItem, EventQuery, EventStatus } from '../../services/apiTypes';
import { EVENT_STATUSES, endOfDayIso, formatEventDate, formatEventTime, startOfDayIso } from '../../utils/eventDates';
import DeleteEventButton from './DeleteEventButton';
import EventCalendar from './EventCalendar';

type View = 'calendar' | 'list';

const EventsPage: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('list');
  const [status, setStatus] = useState<EventStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [month, setMonth] = useState(() => new Date());
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [rangeError, setRangeError] = useState<string>();

  const load = useCallback(async () => {
    // The date range filters the list view (Req 2.5); the calendar shows every date.
    const query: EventQuery = {};
    if (status) query.status = status;
    if (view === 'list') {
      if (from && to && to < from) {
        setRangeError('To date must not be before from date');
        return;
      }
      if (from) query.from = startOfDayIso(from);
      if (to) query.to = endOfDayIso(to);
    }
    setRangeError(undefined);
    setLoading(true);
    const result = await api.listEvents(query);
    if (result.ok) {
      setEvents([...result.data].sort((a, b) => a.startDateTime.localeCompare(b.startDateTime)));
      setError(undefined);
    } else {
      setError(result.kind === 'error' ? result.error.message : result.message);
    }
    setLoading(false);
  }, [status, from, to, view]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEvent = (e: EventItem) => navigate(`/admin/events/${encodeURIComponent(e.eventId)}`);

  return (
    <section>
      <h1>Events</h1>

      <div className="events-toolbar">
        <Link className="btn btn-primary" to="/admin/events/new">New event</Link>

        <div role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
            List
          </button>
          <button type="button" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>
            Calendar
          </button>
        </div>
      </div>

      <form className="events-filters" aria-label="Filter events" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="filter-status">Status</label>
        <select id="filter-status" value={status} onChange={(e) => setStatus(e.target.value as EventStatus | '')}>
          <option value="">All statuses</option>
          {EVENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {view === 'list' && (
          <>
            <label htmlFor="filter-from">From date</label>
            <input id="filter-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <label htmlFor="filter-to">To date</label>
            <input id="filter-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
      </form>

      {rangeError && <p role="alert">{rangeError}</p>}
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading events…</p>}

      {!rangeError && view === 'calendar' && (
        <EventCalendar events={events} month={month} onMonthChange={setMonth} onSelectEvent={openEvent} />
      )}

      {!rangeError && view === 'list' && !loading && (
        events.length === 0 ? (
          !error && <p>No events match these filters.</p>
        ) : (
          <table aria-label="Events">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Date</th>
                <th scope="col">Time</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.eventId}>
                  <th scope="row">
                    <Link to={`/admin/events/${encodeURIComponent(ev.eventId)}`}>{ev.title}</Link>
                  </th>
                  <td>{formatEventDate(ev.startDateTime)}</td>
                  <td>
                    {formatEventTime(ev.startDateTime)}–{formatEventTime(ev.endDateTime)}
                  </td>
                  <td>{ev.status}</td>
                  <td>
                    <DeleteEventButton event={ev} onDeleted={() => void load()} onError={setError} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </section>
  );
};

export default EventsPage;
