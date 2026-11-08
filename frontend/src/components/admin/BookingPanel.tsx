import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import type {
  AdminCfp,
  AdminSubmissionListItem,
  ApiResult,
  Booking,
  BookingInput,
  BookingStatus,
  BookingWarning,
  BookingWarningCode,
  EventItem,
  SpeakerSummary,
} from '../../services/apiTypes';
import ConfirmDialog from '../common/ConfirmDialog';
import MarkerBadge from './MarkerBadge';

type Failure = Exclude<ApiResult<unknown>, { ok: true }>;
const errorMessage = (r: Failure): string => (r.kind === 'error' ? r.error.message : r.message);

const BOOKING_STATUSES: BookingStatus[] = ['proposed', 'confirmed', 'declined'];

const WARNING_LABELS: Record<BookingWarningCode, string> = {
  SPEAKER_NOT_AGAIN: 'Speaker marked "Not again"',
  DUPLICATE_BOOKING: 'Duplicate booking',
  OVERLAPPING_EVENT: 'Overlapping event',
};

interface Message {
  ok: boolean;
  text: string;
}

interface PendingWarning {
  input: BookingInput;
  warnings: BookingWarning[];
}

/**\n * Bookings for a saved event, plus accepted submissions from ALL CFPs (grouped by CFP title,\n * with a CFP filter). CFPs are not tied to events, so the same submission can be booked onto\n * several events; the Booked marker only reflects bookings on this event.\n */
const BookingPanel: React.FC<{ event: EventItem }> = ({ event }) => {
  const eventId = event.eventId;
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [speakers, setSpeakers] = useState<SpeakerSummary[]>([]);
  const [submissions, setSubmissions] = useState<AdminSubmissionListItem[]>([]);
  const [cfps, setCfps] = useState<AdminCfp[]>([]);
  const [cfpFilter, setCfpFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [message, setMessage] = useState<Message>();
  const [busy, setBusy] = useState(false);

  const [speakerId, setSpeakerId] = useState('');
  const [submissionId, setSubmissionId] = useState('');
  const [filter, setFilter] = useState('');

  const [pending, setPending] = useState<PendingWarning>();
  const [removing, setRemoving] = useState<Booking>();

  const loadBookings = useCallback(async () => {
    const r = await api.listBookings({ eventId });
    if (r.ok) setBookings(r.data);
    else setLoadError(errorMessage(r));
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [b, s, c] = await Promise.all([api.listBookings({ eventId }), api.listSpeakers(), api.listCfps()]);
      if (cancelled) return;
      if (b.ok) setBookings(b.data);
      else setLoadError(errorMessage(b));
      if (s.ok) setSpeakers(s.data);
      else setLoadError(errorMessage(s));
      if (c.ok) {
        setCfps(c.data);
        const lists = await Promise.all(c.data.map((cfp) => api.listCfpSubmissions(cfp.cfpId)));
        if (cancelled) return;
        setSubmissions(lists.flatMap((l) => (l.ok ? l.data : [])));
      }      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const speakerById = useMemo(() => new Map(speakers.map((s) => [s.speakerId, s])), [speakers]);
  const submissionById = useMemo(() => new Map(submissions.map((s) => [s.submissionId, s])), [submissions]);
  const bookedSubmissionIds = useMemo(
    () => new Set(bookings.map((b) => b.submissionId).filter(Boolean)),
    [bookings],
  );

  const visibleSpeakers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return speakers;
    const hit = (s: SpeakerSummary) =>
      [s.name, s.location, ...(s.topics ?? [])].some((t) => (t ?? '').toLowerCase().includes(q));
    // Keep the chosen speaker visible even if it no longer matches the search.
    return speakers.filter((s) => hit(s) || s.speakerId === speakerId);
  }, [speakers, filter, speakerId]);
  const searching = filter.trim().length > 0;

  const selectedSpeaker = speakerById.get(speakerId);
  const speakerSubmissions = submissions.filter((s) => s.speakerId === speakerId);
  const cfpTitleById = useMemo(() => new Map(cfps.map((c) => [c.cfpId, c.title])), [cfps]);
  const accepted = submissions.filter((s) => s.status === 'accepted');
  // CFPs that have at least one accepted submission, in CFP list order, for the filter and grouping.
  const acceptedGroups = cfps
    .map((cfp) => ({ cfp, items: accepted.filter((s) => s.cfpId === cfp.cfpId) }))
    .filter((g) => g.items.length > 0 && (!cfpFilter || g.cfp.cfpId === cfpFilter));
  const cfpsWithAccepted = cfps.filter((cfp) => accepted.some((s) => s.cfpId === cfp.cfpId));

  const create = async (input: BookingInput) => {
    setBusy(true);
    setMessage(undefined);
    try {
      const r = await api.createBooking(input);
      if (r.ok) {
        setPending(undefined);
        setSpeakerId('');
        setSubmissionId('');
        setMessage({ ok: true, text: `Booked ${r.data.speakerNameSnapshot}.` });
        await loadBookings();
      } else if (r.kind === 'booking_warnings') {
        setPending({ input, warnings: r.warnings });
      } else {
        setPending(undefined);
        setMessage({ ok: false, text: errorMessage(r) });
      }
    } finally {
      setBusy(false);
    }
  };

  const onAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!speakerId) {
      setMessage({ ok: false, text: 'Choose a speaker to book.' });
      return;
    }
    void create({ eventId, speakerId, ...(submissionId ? { submissionId } : {}) });
  };

  const changeStatus = async (b: Booking, status: BookingStatus) => {
    setBusy(true);
    setMessage(undefined);
    try {
      const r = await api.updateBooking(b.bookingId, { status, updatedAt: b.updatedAt });
      if (r.ok) {
        setBookings((list) => list.map((x) => (x.bookingId === b.bookingId ? r.data : x)));
        setMessage({ ok: true, text: `Status for ${b.speakerNameSnapshot} changed to ${status}.` });
      } else {
        setMessage({ ok: false, text: errorMessage(r) });
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    const b = removing;
    setBusy(true);
    try {
      const r = await api.deleteBooking(b.bookingId);
      setRemoving(undefined);
      if (r.ok) {
        setBookings((list) => list.filter((x) => x.bookingId !== b.bookingId));
        setMessage({ ok: true, text: `Removed booking for ${b.speakerNameSnapshot}.` });
      } else {
        setMessage({ ok: false, text: errorMessage(r) });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="bp-heading">
      <h2 id="bp-heading">Bookings</h2>
      {loading && <p role="status">Loading bookings…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      <div aria-live="polite" aria-atomic="true">
        {message && <p role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
      </div>

      {!loading && bookings.length === 0 && <p>No bookings for this event yet.</p>}
      {bookings.length > 0 && (
        <table>
          <caption>Bookings for this event</caption>
          <thead>
            <tr>
              <th scope="col">Speaker</th>
              <th scope="col">Talk</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => {
              const sub = b.submissionId ? submissionById.get(b.submissionId) : undefined;
              const marker = b.speakerId ? speakerById.get(b.speakerId)?.marker : undefined;
              return (
                <tr key={b.bookingId}>
                  <td>
                    {b.speakerId ? (
                      <Link to={`/admin/speakers/${encodeURIComponent(b.speakerId)}`}>{b.speakerNameSnapshot}</Link>
                    ) : (
                      b.speakerNameSnapshot
                    )}{' '}
                    <MarkerBadge marker={marker} />
                  </td>
                  <td>
                    {sub ? (
                      <Link to={`/admin/submissions/${encodeURIComponent(sub.submissionId)}`}>
                        {sub.talkTitle || 'Untitled talk'}
                      </Link>
                    ) : b.submissionId ? (
                      'Linked submission'
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <label htmlFor={`bp-status-${b.bookingId}`} className="visually-hidden">
                      Status for {b.speakerNameSnapshot}
                    </label>
                    <select
                      id={`bp-status-${b.bookingId}`}
                      value={b.status}
                      disabled={busy}
                      onChange={(e) => void changeStatus(b, e.target.value as BookingStatus)}
                    >
                      {BOOKING_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button type="button" className="danger" disabled={busy} onClick={() => setRemoving(b)}>
                      Remove<span className="visually-hidden"> booking for {b.speakerNameSnapshot}</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <form onSubmit={onAdd} aria-label="Add booking" noValidate>
        <h3>Add booking</h3>
        <div>
          <label htmlFor="bp-filter">Search speakers (name, location or topic)</label>
          <input id="bp-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <p role="status" className="help-text">
            {searching
              ? visibleSpeakers.length === 0
                ? `No speakers match "${filter.trim()}".`
                : `${visibleSpeakers.length} ${visibleSpeakers.length === 1 ? 'speaker matches' : 'speakers match'}. Pick one below.`
              : ''}
          </p>
        </div>
        <div>
          <label htmlFor="bp-speaker">Speaker</label>
          <select
            id="bp-speaker"
            // While searching, show the matches as an open list so the filter is visible.
            size={searching ? Math.min(6, visibleSpeakers.length + 1) : undefined}
            value={speakerId}
            onChange={(e) => {
              setSpeakerId(e.target.value);
              setSubmissionId('');
            }}
          >
            <option value="">Select a speaker</option>
            {visibleSpeakers.map((s) => (
              <option key={s.speakerId} value={s.speakerId}>
                {s.name}
                {s.marker === 'not_again' ? ' (Not again)' : ''}
              </option>
            ))}
          </select>
          {selectedSpeaker?.marker && (
            <p>
              <MarkerBadge marker={selectedSpeaker.marker} />
              {selectedSpeaker.markerNote && <span> {selectedSpeaker.markerNote}</span>}
            </p>
          )}
        </div>
        {speakerSubmissions.length > 0 && (
          <div>
            <label htmlFor="bp-submission">Linked submission (optional)</label>
            <select id="bp-submission" value={submissionId} onChange={(e) => setSubmissionId(e.target.value)}>
              <option value="">None</option>
              {speakerSubmissions.map((s) => (
                <option key={s.submissionId} value={s.submissionId}>
                  {s.talkTitle || 'Untitled talk'} ({s.status})
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" disabled={busy}>
          Add booking
        </button>
      </form>

      {accepted.length > 0 && (
        <section aria-labelledby="bp-subs-heading">
          <h3 id="bp-subs-heading">Accepted submissions from all CFPs</h3>
          {cfpsWithAccepted.length > 1 && (
            <div>
              <label htmlFor="bp-cfp-filter">Filter by CFP</label>
              <select id="bp-cfp-filter" value={cfpFilter} onChange={(e) => setCfpFilter(e.target.value)}>
                <option value="">All CFPs</option>
                {cfpsWithAccepted.map((cfp) => (
                  <option key={cfp.cfpId} value={cfp.cfpId}>
                    {cfp.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          {acceptedGroups.map(({ cfp, items }) => (
            <div key={cfp.cfpId} role="group" aria-label={`Accepted submissions from ${cfp.title}`}>
              <h4>{cfpTitleById.get(cfp.cfpId) ?? 'CFP'}</h4>
              <ul>
                {items.map((s) => {
                  const booked = bookedSubmissionIds.has(s.submissionId);
                  const name = s.speakerName ?? 'Unknown speaker';
                  return (
                    <li key={s.submissionId}>
                      {s.talkTitle || 'Untitled talk'} by {name} <MarkerBadge marker={s.marker ?? undefined} />{' '}
                      {booked ? (
                        <span>Booked</span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void create({ eventId, speakerId: s.speakerId, submissionId: s.submissionId })
                          }
                        >
                          Book<span className="visually-hidden"> {name}</span>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}
      {pending && (
        <ConfirmDialog
          title="Check booking warnings"
          message="This booking has warnings. Review them before continuing."
          details={pending.warnings.map((w) => `${WARNING_LABELS[w.code] ?? w.code}: ${w.message}`)}
          confirmLabel="Book anyway"
          busy={busy}
          onConfirm={() => void create({ ...pending.input, confirmWarnings: true })}
          onCancel={() => setPending(undefined)}
        />
      )}
      {removing && (
        <ConfirmDialog
          title="Remove booking"
          message={`Remove the booking for ${removing.speakerNameSnapshot}?`}
          confirmLabel="Remove booking" danger
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => setRemoving(undefined)}
        />
      )}
    </section>
  );
};

export default BookingPanel;
