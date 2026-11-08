import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import type { SpeakerSubmission } from '../../services/apiTypes';
import { failureMessage } from '../../utils/apiMessages';
import ConfirmDialog from '../common/ConfirmDialog';

const CONTACT = 'Please contact the organisers.';

/** Statuses a speaker may still edit or withdraw (shortlisted shows as Under review; the server decides). */
const isActionable = (s: SpeakerSubmission): boolean => s.status === 'Draft' || s.status === 'Under review';

/** The speaker's own submissions with simplified status, edit and withdraw (8.10-8.12). */
const MySubmissions: React.FC = () => {
  const [items, setItems] = useState<SpeakerSubmission[]>();
  const [cfpTitles, setCfpTitles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<SpeakerSubmission>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [s, c] = await Promise.all([api.listMySubmissions(), api.listOpenCfps()]);
      if (cancelled) return;
      if (!s.ok) {
        setError(failureMessage(s));
        return;
      }
      setItems(s.data);
      if (c.ok) setCfpTitles(Object.fromEntries(c.data.map((x) => [x.cfpId, x.title])));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const withdraw = async () => {
    if (!pending) return;
    setBusy(true);
    const r = await api.withdrawMySubmission(pending.submissionId);
    setBusy(false);
    const title = pending.talkTitle || 'Untitled talk';
    setPending(undefined);
    if (r.ok) {
      setItems((prev) => prev?.map((x) => (x.submissionId === r.data.submissionId ? { ...x, ...r.data } : x)));
      setMessage(`"${title}" has been withdrawn.`);
      return;
    }
    const code = r.kind === 'error' ? r.error.code : undefined;
    if (code === 'CFP_CLOSED') {
      setMessage(`"${title}" cannot be withdrawn because the call for papers is closed. ${CONTACT}`);
    } else if (code === 'SUBMISSION_LOCKED') {
      setMessage(`"${title}" can no longer be changed. ${CONTACT}`);
    } else {
      setMessage(failureMessage(r));
    }
  };

  return (
    <section aria-labelledby="my-submissions-heading">
      <h1 id="my-submissions-heading">My submissions</h1>
      <div role="status" aria-live="polite">
        {message}
      </div>
      {error && <p role="alert">{error}</p>}
      {!items && !error && <p role="status">Loading submissions…</p>}
      {items && items.length === 0 && (
        <p>
          You have not made any submissions yet. <Link to="/speaker/cfps">See open calls for papers</Link>
        </p>
      )}
      {items && items.length > 0 && (
        <table>
          <caption>Your talk submissions</caption>
          <thead>
            <tr>
              <th scope="col">Talk</th>
              <th scope="col">Call for papers</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => {
              const title = s.talkTitle || 'Untitled talk';
              return (
                <tr key={s.submissionId}>
                  <th scope="row">{title}</th>
                  <td>{cfpTitles[s.cfpId] ?? 'Closed call for papers'}</td>
                  <td>{s.status}</td>
                  <td>
                    {isActionable(s) ? (
                      <>
                        <Link className="btn btn-secondary btn-small" to={`/speaker/submissions/${s.submissionId}/edit`} aria-label={`Edit ${title}`}>
                          Edit
                        </Link>{' '}
                        <button type="button" className="danger" aria-label={`Withdraw ${title}`} onClick={() => setPending(s)}>
                          Withdraw
                        </button>
                      </>
                    ) : (
                      <span>No actions available</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {pending && (
        <ConfirmDialog
          title="Withdraw submission"
          message={`Withdraw "${pending.talkTitle || 'Untitled talk'}"? The organisers will no longer consider it.`}
          confirmLabel="Withdraw" danger
          busy={busy}
          onConfirm={() => void withdraw()}
          onCancel={() => setPending(undefined)}
        />
      )}
    </section>
  );
};

export default MySubmissions;
