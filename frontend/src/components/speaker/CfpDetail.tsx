import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../services/api';
import type { SpeakerCfp, SpeakerSubmission } from '../../services/apiTypes';
import { describeCfpCloses } from '../../utils/cfpStatus';
import { failureMessage } from '../../utils/apiMessages';

/** One CFP with a way to start a submission and the speaker's existing talks for it (8.3, 8.9). */
const CfpDetail: React.FC = () => {
  const { id = '' } = useParams();
  const [cfp, setCfp] = useState<SpeakerCfp>();
  const [submissions, setSubmissions] = useState<SpeakerSubmission[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [c, s] = await Promise.all([api.getOpenCfp(id), api.listMySubmissions()]);
      if (cancelled) return;
      if (!c.ok) {
        setError(
          c.kind === 'error' && c.status === 404
            ? 'This call for papers is not open or does not exist.'
            : failureMessage(c),
        );
        return;
      }
      setCfp(c.data);
      if (s.ok) setSubmissions(s.data.filter((x) => x.cfpId === id));
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <p role="alert">
        {error} <Link to="/speaker/cfps">Back to open calls for papers</Link>
      </p>
    );
  }
  if (!cfp) return <p role="status">Loading call for papers…</p>;

  return (
    <section aria-labelledby="cfp-heading">
      <h1 id="cfp-heading">{cfp.title}</h1>
      <p>{describeCfpCloses(cfp.closesAt)}</p>
      {cfp.description && <p>{cfp.description}</p>}

      <p>
        <Link className="btn btn-primary" to={`/speaker/cfps/${cfp.cfpId}/submit`}>Start a submission</Link>
      </p>

      <h2>Your submissions for this call</h2>
      {submissions.length === 0 ? (
        <p>You have not started a submission for this call yet.</p>
      ) : (
        <ul>
          {submissions.map((s) => (
            <li key={s.submissionId}>
              {s.talkTitle || 'Untitled talk'} ({s.status}){' '}
              <Link className="btn btn-secondary btn-small" to={`/speaker/submissions/${s.submissionId}/edit`}>
                {s.status === 'Draft' || s.status === 'Under review' ? 'Edit' : 'View'}
                <span className="visually-hidden"> {s.talkTitle || 'untitled talk'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default CfpDetail;
