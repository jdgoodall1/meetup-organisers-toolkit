import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import type { SpeakerBooking } from '../../services/apiTypes';
import { failureMessage } from '../../utils/apiMessages';
import { formatEventDate, formatEventTime } from '../../utils/eventDates';

const startOf = (b: SpeakerBooking): string => b.event?.startDateTime ?? '';

/** Upcoming first (soonest), then past (most recent first); events without details last. */
function sortBookings(list: SpeakerBooking[], now = Date.now()): SpeakerBooking[] {
  const time = (b: SpeakerBooking) => new Date(startOf(b)).getTime();
  const rank = (b: SpeakerBooking) => (Number.isNaN(time(b)) ? 2 : time(b) >= now ? 0 : 1);
  return [...list].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return time(a) - time(b);
    if (ra === 1) return time(b) - time(a);
    return 0;
  });
}

/** The speaker's confirmed bookings (10.8). */
const MyBookings: React.FC = () => {
  const [bookings, setBookings] = useState<SpeakerBooking[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await api.listMyBookings();
      if (cancelled) return;
      if (r.ok) setBookings(sortBookings(r.data));
      else setError(failureMessage(r));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-labelledby="my-bookings-heading">
      <h1 id="my-bookings-heading">My bookings</h1>
      {error && <p role="alert">{error}</p>}
      {!bookings && !error && <p role="status">Loading bookings…</p>}
      {bookings && bookings.length === 0 && <p>You have no confirmed bookings yet.</p>}
      {bookings && bookings.length > 0 && (
        <ul>
          {bookings.map((b) => (
            <li key={b.bookingId}>
              {b.event ? (
                <>
                  <h2>{b.event.title}</h2>
                  <p>
                    {formatEventDate(b.event.startDateTime)}, {formatEventTime(b.event.startDateTime)} to{' '}
                    {formatEventTime(b.event.endDateTime)}
                  </p>
                  <p>
                    {b.event.isOnline ? 'Online' : 'In person'}
                    {b.event.location ? `: ${b.event.location}` : ''}
                  </p>
                </>
              ) : (
                <p>Event details are not available.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default MyBookings;
