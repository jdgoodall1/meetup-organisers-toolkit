import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../services/api';
import type { AdminSubmissionListItem, SubmissionFilter } from '../../services/apiTypes';
import { SUBMISSION_STATUSES } from '../../utils/submissionStatus';
import MarkerBadge from './MarkerBadge';

/** `/admin/cfps/:id/submissions`: submissions for one CFP with a status filter. Drafts are hidden by default. */
const SubmissionList: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  // '' means the server default (everything except drafts).
  const [filter, setFilter] = useState<SubmissionFilter | ''>('');
  const [items, setItems] = useState<AdminSubmissionListItem[]>([]);
  const [cfpTitle, setCfpTitle] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!id) return;
    void api.getCfp(id).then((r) => {
      if (r.ok) setCfpTitle(r.data.title);
    });
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const r = await api.listCfpSubmissions(id, filter || undefined);
    if (r.ok) {
      setItems(r.data);
      setError(undefined);
    } else {
      setError(r.kind === 'error' ? r.error.message : r.message);
    }
    setLoading(false);
  }, [id, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <p>
        <Link to="/admin/cfps">Back to CFPs</Link>
      </p>
      <h1>Submissions{cfpTitle ? `: ${cfpTitle}` : ''}</h1>

      <form aria-label="Filter submissions" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="filter-submission-status">Status</label>
        <select
          id="filter-submission-status"
          value={filter}
          onChange={(e) => setFilter(e.target.value as SubmissionFilter | '')}
        >
          <option value="">All except drafts</option>
          <option value="all">All including drafts</option>
          {SUBMISSION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </form>

      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading submissions…</p>}

      {!loading &&
        (items.length === 0 ? (
          !error && <p>No submissions match this filter.</p>
        ) : (
          <table aria-label="Submissions">
            <thead>
              <tr>
                <th scope="col">Talk</th>
                <th scope="col">Speaker</th>
                <th scope="col">Status</th>
                <th scope="col">Rating</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.submissionId}>
                  <th scope="row">
                    <Link to={`/admin/submissions/${encodeURIComponent(s.submissionId)}`}>
                      {s.talkTitle || 'Untitled talk'}
                    </Link>
                  </th>
                  <td>
                    {s.speakerName ?? 'Unknown speaker'} {s.marker && <MarkerBadge marker={s.marker} />}
                  </td>
                  <td>{s.status}</td>
                  <td>
                    {s.averageRating === null
                      ? 'Not rated'
                      : `${s.averageRating} (${s.ratingCount} ${s.ratingCount === 1 ? 'rating' : 'ratings'})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </section>
  );
};

export default SubmissionList;
