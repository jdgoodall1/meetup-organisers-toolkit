import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import type { AdminCfp, CfpStatus } from '../../services/apiTypes';
import { formatEventDate } from '../../utils/eventDates';
import { describeCfpStatus } from '../../utils/cfpStatus';
import CfpActions from './CfpActions';

const CFP_STATUSES: CfpStatus[] = ['draft', 'open', 'closed'];

const CfpList: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<CfpStatus | ''>('');
  const [cfps, setCfps] = useState<AdminCfp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    const cfpResult = await api.listCfps(status || undefined);
    if (cfpResult.ok) {
      setCfps(cfpResult.data);
      setError(undefined);
    } else {
      setError(cfpResult.kind === 'error' ? cfpResult.error.message : cfpResult.message);
    }
    setLoading(false);
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <h1>CFPs</h1>
      <p>
        <Link className="btn btn-primary" to="/admin/cfps/new">New CFP</Link>
      </p>

      <form aria-label="Filter CFPs" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="filter-cfp-status">Stored status</label>
        <select id="filter-cfp-status" value={status} onChange={(e) => setStatus(e.target.value as CfpStatus | '')}>
          <option value="">All statuses</option>
          {CFP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </form>

      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading CFPs…</p>}

      {!loading &&
        (cfps.length === 0 ? (
          !error && <p>No CFPs match this filter.</p>
        ) : (
          <table aria-label="CFPs">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Status</th>
                <th scope="col">Closes</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cfps.map((c) => (
                <tr key={c.cfpId}>
                  <th scope="row">
                    <Link to={`/admin/cfps/${encodeURIComponent(c.cfpId)}`}>{c.title}</Link>
                  </th>
                  <td>{describeCfpStatus(c)}</td>
                  <td>{c.closesAt ? formatEventDate(c.closesAt) : 'No close date (standing)'}</td>
                  <td>
                    <div className="row-actions">
                    <Link className="btn btn-secondary btn-small" to={`/admin/cfps/${encodeURIComponent(c.cfpId)}/submissions`}>
                      Submissions<span className="visually-hidden"> for {c.title}</span>
                    </Link>
                    <CfpActions
                      cfp={c}
                      onChanged={() => void load()}
                      onDuplicated={(copy) => navigate(`/admin/cfps/${encodeURIComponent(copy.cfpId)}`)}
                      onDeleted={() => void load()}
                      onError={setError}
                    />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </section>
  );
};

export default CfpList;
