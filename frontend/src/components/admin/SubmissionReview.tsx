import React, { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import type {
  AdminSubmissionDetail,
  AnswerValue,
  ApiResult,
  BookingWarning,
  EventItem,
  SubmissionStatus,
} from '../../services/apiTypes';
import MarkerBadge from './MarkerBadge';
import { formatEventDate } from '../../utils/eventDates';
import { SUBMISSION_STATUSES } from '../../utils/submissionStatus';
import { formatDuration } from '../../utils/talkOptions';

type Failure = Exclude<ApiResult<unknown>, { ok: true }>;

const errorMessage = (r: Failure): string => (r.kind === 'error' ? r.error.message : r.message);
const fieldErrors = (r: Failure): Record<string, string> => (r.kind === 'error' ? (r.error.fields ?? {}) : {});

const formatAnswer = (v: AnswerValue): string => {
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
};

interface Message {
  ok: boolean;
  text: string;
}

interface BookingOffer {
  /** Chosen event; empty until the admin picks one. */
  eventId: string;
  warnings: BookingWarning[];
  message?: Message;
  created?: boolean;
}

/** Upcoming, non-cancelled events, soonest first, for the booking picker. */
const upcomingEvents = (events: EventItem[], now = Date.now()): EventItem[] =>
  events
    .filter((e) => e.status !== 'cancelled' && Date.parse(e.endDateTime || e.startDateTime) >= now)
    .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));

/**
 * `/admin/submissions/:id`: answers, speaker summary, marker, status, own rating/notes and booking offer.
 * CFPs are not tied to events, so accepting offers a booking onto any upcoming event.
 */
const SubmissionReview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [detail, setDetail] = useState<AdminSubmissionDetail>();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const [status, setStatus] = useState<SubmissionStatus>('submitted');
  const [statusMsg, setStatusMsg] = useState<Message>();
  const [statusSaving, setStatusSaving] = useState(false);

  const [rating, setRating] = useState('');
  const [notes, setNotes] = useState('');
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
  const [reviewMsg, setReviewMsg] = useState<Message>();
  const [reviewSaving, setReviewSaving] = useState(false);

  const [offer, setOffer] = useState<BookingOffer>();
  const [booking, setBooking] = useState(false);

  const applyDetail = useCallback(
    (d: AdminSubmissionDetail, resetReview: boolean) => {
      setDetail(d);
      setStatus(d.status);
      if (resetReview) {
        const own = d.reviews.find((r) => r.adminUserId === user?.userId);
        setRating(own ? String(own.rating) : '');
        setNotes(own?.notes ?? '');
      }
    },
    [user?.userId],
  );

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const r = await api.getSubmission(id);
    if (r.ok) {
      applyDetail(r.data, true);
      setError(undefined);
    } else {
      setError(errorMessage(r));
    }
    setLoading(false);
  }, [id, applyDetail]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !detail) return;
    setStatusMsg(undefined);
    setStatusSaving(true);
    try {
      const r = await api.setSubmissionStatus(id, status, detail.updatedAt);
      if (r.ok) {
        applyDetail(r.data, false);
        setStatusMsg({ ok: true, text: `Status changed to ${r.data.status}.` });
        if (r.data.status === 'accepted' && r.data.speaker) {
          setOffer({ eventId: '', warnings: [] });
          const ev = await api.listEvents();
          if (ev.ok) setEvents(upcomingEvents(ev.data));
          else setOffer({ eventId: '', warnings: [], message: { ok: false, text: errorMessage(ev) } });
        } else {
          setOffer(undefined);
        }
      } else {
        const text =
          r.kind === 'error' && r.status === 409
            ? `${r.error.message} Reload the page to see the latest version.`
            : errorMessage(r);
        setStatusMsg({ ok: false, text });
      }
    } finally {
      setStatusSaving(false);
    }
  };

  const saveReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setReviewMsg(undefined);
    setReviewErrors({});
    setReviewSaving(true);
    try {
      const r = await api.reviewSubmission(id, { rating: Number(rating), notes });
      if (r.ok) {
        applyDetail(r.data, true);
        setReviewMsg({ ok: true, text: 'Review saved.' });
      } else {
        const fields = fieldErrors(r);
        setReviewErrors(fields);
        setReviewMsg({ ok: false, text: Object.keys(fields).length ? 'Please fix the errors below.' : errorMessage(r) });
      }
    } finally {
      setReviewSaving(false);
    }
  };

  const createBooking = async (confirmWarnings: boolean) => {
    if (!detail || !offer) return;
    if (!offer.eventId) {
      setOffer({ ...offer, warnings: [], message: { ok: false, text: 'Choose an event to book.' } });
      return;
    }
    setBooking(true);
    try {
      const r = await api.createBooking({
        eventId: offer.eventId,
        speakerId: detail.speakerId,
        submissionId: detail.submissionId,
        ...(confirmWarnings ? { confirmWarnings: true } : {}),
      });
      if (r.ok) {
        setOffer({ ...offer, warnings: [], created: true, message: { ok: true, text: 'Booking created.' } });
      } else if (r.kind === 'booking_warnings') {
        setOffer({ ...offer, warnings: r.warnings, message: undefined });
      } else {
        setOffer({ ...offer, warnings: [], message: { ok: false, text: errorMessage(r) } });
      }
    } finally {
      setBooking(false);
    }
  };

  const sp = detail?.speaker;

  return (
    <section>
      <p>
        {detail ? (
          <Link to={`/admin/cfps/${encodeURIComponent(detail.cfpId)}/submissions`}>Back to submissions</Link>
        ) : (
          <Link to="/admin/cfps">Back to CFPs</Link>
        )}
      </p>
      <h1>{detail ? detail.talkTitle || 'Untitled talk' : 'Submission'}</h1>

      {loading && <p role="status">Loading submission…</p>}
      {error && <p role="alert">{error}</p>}

      {detail && (
        <>
          <section aria-labelledby="sr-speaker-heading">
            <h2 id="sr-speaker-heading">Speaker</h2>
            {detail.marker && (
              <p>
                <strong>Marker: </strong>
                <MarkerBadge marker={detail.marker} />
                {detail.markerNote && <span> {detail.markerNote}</span>}
              </p>
            )}
            {sp ? (
              <>
                <p>
                  <Link to={`/admin/speakers/${encodeURIComponent(sp.speakerId)}`}>{sp.name}</Link>
                  {sp.location && <span> ({sp.location})</span>}
                </p>
                {sp.bio && <p>{sp.bio}</p>}
                {sp.topics.length > 0 && <p>Topics: {sp.topics.join(', ')}</p>}
              </>
            ) : (
              <p>Speaker profile not found.</p>
            )}
          </section>

          <section aria-labelledby="sr-talk-heading">
            <h2 id="sr-talk-heading">Talk</h2>
            <p>Duration: {formatDuration(detail.durationMinutes)}</p>
            <p>Level: {detail.level ?? 'Not set'}</p>
            <h3>Abstract</h3>
            <p>{detail.abstract}</p>
            <h3>Answers</h3>
            {Object.keys(detail.answers).length === 0 ? (
              <p>No additional answers.</p>
            ) : (
              <dl>
                {Object.entries(detail.answers).map(([qid, a]) => (
                  <Fragment key={qid}>
                    <dt>{a.questionLabel}</dt>
                    <dd>{formatAnswer(a.value)}</dd>
                  </Fragment>
                ))}
              </dl>
            )}
          </section>

          <section aria-labelledby="sr-status-heading">
            <h2 id="sr-status-heading">Status</h2>
            <form onSubmit={(e) => void changeStatus(e)} aria-label="Change status">
              <label htmlFor="sr-status">Status</label>
              <select id="sr-status" value={status} onChange={(e) => setStatus(e.target.value as SubmissionStatus)}>
                {SUBMISSION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={statusSaving || status === detail.status}>
                {statusSaving ? 'Saving…' : 'Change status'}
              </button>
              {statusMsg && <p role={statusMsg.ok ? 'status' : 'alert'}>{statusMsg.text}</p>}
            </form>

            {offer && (
              <section aria-labelledby="sr-booking-heading">
                <h3 id="sr-booking-heading">Book this speaker onto an event?</h3>
                {offer.created ? (
                  <p role="status">{offer.message?.text}</p>
                ) : (
                  <>
                    <div>
                      <label htmlFor="sr-event">Event</label>
                      <select
                        id="sr-event"
                        value={offer.eventId}
                        onChange={(e) => setOffer({ ...offer, eventId: e.target.value, warnings: [], message: undefined })}
                      >
                        <option value="">Select an event</option>
                        {events.map((ev) => (
                          <option key={ev.eventId} value={ev.eventId}>
                            {ev.title} ({formatEventDate(ev.startDateTime)})
                          </option>
                        ))}
                      </select>
                      {events.length === 0 && <p>There are no upcoming events to book onto.</p>}
                    </div>
                    <p>
                      Book {sp?.name ?? 'this speaker'} with this talk onto the event above. The same talk can be
                      booked onto more than one event.
                    </p>                    {offer.warnings.length > 0 && (
                      <div role="alert">
                        <p>Check these warnings before booking:</p>
                        <ul aria-label="Booking warnings">
                          {offer.warnings.map((w) => (
                            <li key={w.code}>{w.message}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {offer.message && !offer.message.ok && <p role="alert">{offer.message.text}</p>}
                    {offer.warnings.length > 0 ? (
                      <button type="button" disabled={booking} onClick={() => void createBooking(true)}>
                        Confirm and create booking
                      </button>
                    ) : (
                      <button type="button" disabled={booking} onClick={() => void createBooking(false)}>
                        Create booking
                      </button>
                    )}{' '}
                    <button type="button" disabled={booking} onClick={() => setOffer(undefined)}>
                      Not now
                    </button>
                  </>
                )}
              </section>
            )}
          </section>

          <section aria-labelledby="sr-review-heading">
            <h2 id="sr-review-heading">Review</h2>
            <p>
              Average rating:{' '}
              {detail.averageRating === null
                ? 'Not rated yet'
                : `${detail.averageRating} from ${detail.ratingCount} ${detail.ratingCount === 1 ? 'review' : 'reviews'}`}
            </p>
            <form onSubmit={(e) => void saveReview(e)} aria-label="Your review" noValidate>
              <div>
                <label htmlFor="sr-rating">Your rating (1 to 5)</label>
                <select
                  id="sr-rating"
                  value={rating}
                  aria-invalid={reviewErrors.rating ? true : undefined}
                  aria-describedby={reviewErrors.rating ? 'sr-rating-error' : undefined}
                  onChange={(e) => setRating(e.target.value)}
                >
                  <option value="">Select a rating</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                {reviewErrors.rating && (
                  <p id="sr-rating-error" role="alert">
                    {reviewErrors.rating}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="sr-notes">Your private notes</label>
                <textarea
                  id="sr-notes"
                  rows={4}
                  value={notes}
                  aria-invalid={reviewErrors.notes ? true : undefined}
                  aria-describedby={reviewErrors.notes ? 'sr-notes-error' : undefined}
                  onChange={(e) => setNotes(e.target.value)}
                />
                {reviewErrors.notes && (
                  <p id="sr-notes-error" role="alert">
                    {reviewErrors.notes}
                  </p>
                )}
              </div>
              <button type="submit" disabled={reviewSaving}>
                {reviewSaving ? 'Saving…' : 'Save review'}
              </button>
              {reviewMsg && <p role={reviewMsg.ok ? 'status' : 'alert'}>{reviewMsg.text}</p>}
            </form>
          </section>
        </>
      )}
    </section>
  );
};

export default SubmissionReview;
