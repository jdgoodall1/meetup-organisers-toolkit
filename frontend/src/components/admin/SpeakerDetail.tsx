import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../services/api';
import type {
  ApiResult,
  EventItem,
  SpeakerAdmin,
  SpeakerDetail as SpeakerDetailData,
} from '../../services/apiTypes';
import { formatEventDate } from '../../utils/eventDates';
import MarkerBadge from './MarkerBadge';
import SpeakerForm from './SpeakerForm';

type MarkerChoice = 'have_back' | 'not_again' | 'unset';

const errorMessage = (r: Exclude<ApiResult<unknown>, { ok: true }>): string =>
  r.kind === 'error' ? r.error.message : r.message;

/** `/admin/speakers/:id`: full profile, marker, admin notes, link-to-account and history. */
const SpeakerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<SpeakerDetailData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [profileSaved, setProfileSaved] = useState(false);

  const [marker, setMarker] = useState<MarkerChoice>('unset');
  const [markerNote, setMarkerNote] = useState('');
  const [markerMsg, setMarkerMsg] = useState<{ ok: boolean; text: string }>();
  const [markerSaving, setMarkerSaving] = useState(false);

  const [notes, setNotes] = useState('');
  const [notesMsg, setNotesMsg] = useState<{ ok: boolean; text: string }>();
  const [notesSaving, setNotesSaving] = useState(false);

  const [events, setEvents] = useState<EventItem[]>([]);

  const [linkEmail, setLinkEmail] = useState('');
  const [linkMsg, setLinkMsg] = useState<{ ok: boolean; text: string }>();
  const [linking, setLinking] = useState(false);

  const applyAdmin = (admin: SpeakerAdmin | null) => {
    setMarker(admin?.marker ?? 'unset');
    setMarkerNote(admin?.markerNote ?? '');
    setNotes(admin?.adminNotes ?? '');
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const r = await api.getSpeaker(id);
    if (r.ok) {
      setDetail(r.data);
      applyAdmin(r.data.admin);
      setError(undefined);
    } else {
      setError(errorMessage(r));
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Event titles for the bookings history, so we never show raw ids. Best effort.
  useEffect(() => {
    let cancelled = false;
    void api.listEvents({}).then((r) => {
      if (!cancelled && r.ok) setEvents(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveMarker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setMarkerMsg(undefined);
    setMarkerSaving(true);
    try {
      const r = await api.setSpeakerMarker(id, {
        marker,
        markerNote: marker === 'unset' ? null : markerNote.trim() || null,
      });
      if (r.ok) {
        setDetail((d) => (d ? { ...d, admin: r.data } : d));
        applyAdmin(r.data);
        setMarkerMsg({ ok: true, text: 'Marker saved.' });
      } else {
        setMarkerMsg({ ok: false, text: errorMessage(r) });
      }
    } finally {
      setMarkerSaving(false);
    }
  };

  const saveNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setNotesMsg(undefined);
    setNotesSaving(true);
    try {
      const r = await api.setSpeakerNotes(id, notes);
      if (r.ok) {
        setDetail((d) => (d ? { ...d, admin: r.data } : d));
        setNotesMsg({ ok: true, text: 'Notes saved.' });
      } else {
        setNotesMsg({ ok: false, text: errorMessage(r) });
      }
    } finally {
      setNotesSaving(false);
    }
  };

  const link = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setLinkMsg(undefined);
    const email = linkEmail.trim();
    if (!email) {
      setLinkMsg({ ok: false, text: 'Enter the email address of the account to link' });
      return;
    }
    setLinking(true);
    try {
      const r = await api.linkSpeaker(id, email);
      if (r.ok) {
        setDetail((d) => (d ? { ...d, speaker: r.data, linkedEmail: email } : d));
        setLinkEmail('');
        setLinkMsg({ ok: true, text: 'Profile linked to account.' });
      } else {
        setLinkMsg({ ok: false, text: errorMessage(r) });
      }
    } finally {
      setLinking(false);
    }
  };

  const speaker = detail?.speaker;
  const currentMarker = detail?.admin?.marker;

  return (
    <section>
      <p>
        <Link to="/admin/speakers">Back to speakers</Link>
      </p>
      <h1>{speaker ? speaker.name : 'Speaker'}</h1>

      {loading && <p role="status">Loading speaker…</p>}
      {error && <p role="alert">{error}</p>}

      {detail && speaker && (
        <>
          <p>
            Marker: {currentMarker ? <MarkerBadge marker={currentMarker} /> : <span>None</span>}{' '}
            <span className={`badge ${speaker.userId ? 'badge-linked' : 'badge-unlinked'}`}>
              {speaker.userId ? 'Linked' : 'Unlinked'}
            </span>
          </p>

          <section aria-labelledby="profile-heading">
            <h2 id="profile-heading">Profile</h2>
            {profileSaved && <p role="status">Profile saved.</p>}
            <SpeakerForm
              key={speaker.updatedAt}
              speaker={speaker}
              onSubmit={(input) => api.updateSpeaker(speaker.speakerId, input)}
              requestHeadshotUpload={(input) => api.requestSpeakerHeadshotUpload(speaker.speakerId, input)}
              onSaved={(s) => {
                setDetail((d) => (d ? { ...d, speaker: s } : d));
                setProfileSaved(true);
              }}
            />
          </section>

          <section aria-labelledby="marker-heading">
            <h2 id="marker-heading">Marker (admin only)</h2>
            <form onSubmit={(e) => void saveMarker(e)} aria-label="Speaker marker">
              <fieldset>
                <legend>Marker</legend>
                {(
                  [
                    ['have_back', 'Have back'],
                    ['not_again', 'Not again'],
                    ['unset', 'None'],
                  ] as const
                ).map(([value, label]) => (
                  <div key={value}>
                    <input
                      id={`marker-${value}`}
                      type="radio"
                      name="marker"
                      value={value}
                      checked={marker === value}
                      onChange={() => setMarker(value)}
                    />
                    <label htmlFor={`marker-${value}`}>{label}</label>
                  </div>
                ))}
              </fieldset>
              <div>
                <label htmlFor="marker-note">Marker note (private)</label>
                <textarea
                  id="marker-note"
                  rows={2}
                  value={markerNote}
                  disabled={marker === 'unset'}
                  onChange={(e) => setMarkerNote(e.target.value)}
                />
              </div>
              {detail.admin?.markerChangedAt && (
                <p>
                  Last changed on {new Date(detail.admin.markerChangedAt).toLocaleString()}.
                </p>
              )}
              <button type="submit" disabled={markerSaving}>
                {markerSaving ? 'Saving…' : 'Save marker'}
              </button>
              {markerMsg && <p role={markerMsg.ok ? 'status' : 'alert'}>{markerMsg.text}</p>}
            </form>
          </section>

          <section aria-labelledby="notes-heading">
            <h2 id="notes-heading">Admin notes</h2>
            <form onSubmit={(e) => void saveNotes(e)} aria-label="Admin notes">
              <label htmlFor="admin-notes">Admin notes (admin only, never shown to the speaker)</label>
              <textarea id="admin-notes" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <button type="submit" disabled={notesSaving}>
                {notesSaving ? 'Saving…' : 'Save notes'}
              </button>
              {notesMsg && <p role={notesMsg.ok ? 'status' : 'alert'}>{notesMsg.text}</p>}
            </form>
          </section>

          <section aria-labelledby="link-heading">
            <h2 id="link-heading">Account</h2>
            {speaker.userId ? (
              <p>
                {detail.linkedEmail
                  ? `Linked to the account for ${detail.linkedEmail}.`
                  : 'Linked to a user account.'}
              </p>
            ) : (
              <p>This profile is not linked to an account.</p>
            )}
            {!speaker.userId && (
              <form onSubmit={(e) => void link(e)} aria-label="Link to account">
                <label htmlFor="link-email">Account email address</label>
                <p id="link-email-help" className="help-text">
                  The email the person signed up with.
                </p>
                <input
                  id="link-email"
                  type="email"
                  aria-describedby="link-email-help"
                  value={linkEmail}
                  onChange={(e) => setLinkEmail(e.target.value)}
                />
                <button type="submit" disabled={linking}>
                  {linking ? 'Linking…' : 'Link to account'}
                </button>
              </form>
            )}
            {linkMsg && <p role={linkMsg.ok ? 'status' : 'alert'}>{linkMsg.text}</p>}
          </section>

          <section aria-labelledby="submissions-heading">
            <h2 id="submissions-heading">Submissions</h2>
            {detail.submissions.length === 0 ? (
              <p>No submissions yet.</p>
            ) : (
              <ul aria-label="Submissions">
                {detail.submissions.map((s) => (
                  <li key={s.submissionId}>
                    <Link to={`/admin/submissions/${encodeURIComponent(s.submissionId)}`}>{s.talkTitle || 'Untitled talk'}</Link>{' '}
                    ({s.status})
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="bookings-heading">
            <h2 id="bookings-heading">Bookings</h2>
            {detail.bookings.length === 0 ? (
              <p>No bookings yet.</p>
            ) : (
              <ul aria-label="Bookings">
                {detail.bookings.map((b) => {
                  const ev = events.find((e) => e.eventId === b.eventId);
                  return (
                    <li key={b.bookingId}>
                      {ev ? (
                        <>
                          <Link to={`/admin/events/${encodeURIComponent(ev.eventId)}`}>{ev.title}</Link>,{' '}
                          {formatEventDate(ev.startDateTime)}
                        </>
                      ) : events.length > 0 ? (
                        'Event no longer exists'
                      ) : (
                        'Loading event…'
                      )}{' '}
                      ({b.status})
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
};

export default SpeakerDetail;
