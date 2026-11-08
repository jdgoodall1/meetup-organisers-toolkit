import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../services/api';
import type { SpeakerCfp, SpeakerSubmission } from '../../services/apiTypes';
import { failureMessage } from '../../utils/apiMessages';
import SubmissionForm from './SubmissionForm';

/** `cfps/:id/submit`: new submission; blocked until the speaker has a profile (8.8). */
export const NewSubmissionPage: React.FC = () => {
  const { id = '' } = useParams();
  const [cfp, setCfp] = useState<SpeakerCfp>();
  const [hasProfile, setHasProfile] = useState<boolean>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [p, c] = await Promise.all([api.getMyProfile(), api.getOpenCfp(id)]);
      if (cancelled) return;
      if (p.ok) setHasProfile(!('exists' in p.data && p.data.exists === false));
      else if (p.kind === 'error' && p.status === 404) setHasProfile(false);
      else {
        setError(failureMessage(p));
        return;
      }
      if (c.ok) setCfp(c.data);
      else
        setError(
          c.kind === 'error' && c.status === 404
            ? 'This call for papers is closed or does not exist.'
            : failureMessage(c),
        );
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (hasProfile === false) {
    return (
      <p role="alert">
        You need a speaker profile before you can submit a talk. <Link className="btn btn-primary" to="/speaker/profile">Create your profile</Link>
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert">
        {error} <Link to="/speaker/cfps">Back to open calls for papers</Link>
      </p>
    );
  }
  if (!cfp) return <p role="status">Loading…</p>;
  return <SubmissionForm cfp={cfp} />;
};

/** `submissions/:id/edit`: edit a draft or submitted talk. */
export const EditSubmissionPage: React.FC = () => {
  const { id = '' } = useParams();
  const [state, setState] = useState<{ cfp: SpeakerCfp; submission: SpeakerSubmission }>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await api.getMySubmission(id);
      if (cancelled) return;
      if (!s.ok) {
        setError(
          s.kind === 'error' && s.status === 404 ? 'Submission not found.' : failureMessage(s),
        );
        return;
      }
      const c = await api.getOpenCfp(s.data.cfpId);
      if (cancelled) return;
      if (!c.ok) {
        setError(
          c.kind === 'error' && c.status === 404
            ? 'The call for papers for this submission is closed, so it can no longer be changed.'
            : failureMessage(c),
        );
        return;
      }
      setState({ cfp: c.data, submission: s.data });
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <p role="alert">
        {error} <Link to="/speaker/submissions">Back to my submissions</Link>
      </p>
    );
  }
  if (!state) return <p role="status">Loading…</p>;
  return <SubmissionForm cfp={state.cfp} submission={state.submission} />;
};
