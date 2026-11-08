import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import type { SpeakerCfp } from '../../services/apiTypes';
import { failureMessage } from '../../utils/apiMessages';
import { describeCfpCloses } from '../../utils/cfpStatus';

/** List of CFPs currently accepting submissions (requirement 8.1). */
const OpenCfps: React.FC = () => {
  const [cfps, setCfps] = useState<SpeakerCfp[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await api.listOpenCfps();
      if (cancelled) return;
      if (r.ok) setCfps(r.data);
      else setError(failureMessage(r));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-labelledby="open-cfps-heading">
      <h1 id="open-cfps-heading">Open calls for papers</h1>
      {error && <p role="alert">{error}</p>}
      {!cfps && !error && <p role="status">Loading calls for papers…</p>}
      {cfps && cfps.length === 0 && <p>There are no open calls for papers right now.</p>}
      {cfps && cfps.length > 0 && (
        <ul>
          {cfps.map((c) => (
            <li key={c.cfpId}>
              <h2>
                <Link to={`/speaker/cfps/${c.cfpId}`}>{c.title}</Link>
              </h2>
              <p>{describeCfpCloses(c.closesAt)}</p>
              {c.description && <p>{c.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default OpenCfps;
