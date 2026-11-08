import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import MarkerBadge from './MarkerBadge';
import type { SpeakerMarker, SpeakerSearchParams, SpeakerSummary } from '../../services/apiTypes';

type MarkerFilter = SpeakerMarker | 'none' | '';

const SpeakerDirectory: React.FC = () => {
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('');
  const [location, setLocation] = useState('');
  const [marker, setMarker] = useState<MarkerFilter>('');
  const [applied, setApplied] = useState<SpeakerSearchParams>({});
  const [speakers, setSpeakers] = useState<SpeakerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    const result = await api.listSpeakers(applied);
    if (result.ok) {
      setSpeakers(result.data);
      setError(undefined);
    } else {
      setError(result.kind === 'error' ? result.error.message : result.message);
    }
    setLoading(false);
  }, [applied]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params: SpeakerSearchParams = {};
    if (q.trim()) params.q = q.trim();
    if (topic.trim()) params.topic = topic.trim();
    if (location.trim()) params.location = location.trim();
    if (marker) params.marker = marker;
    setApplied(params);
  };

  const onClear = () => {
    setQ('');
    setTopic('');
    setLocation('');
    setMarker('');
    setApplied({});
  };

  return (
    <section>
      <h1>Speakers</h1>
      <p>
        <Link className="btn btn-primary" to="/admin/speakers/new">New speaker</Link>
      </p>

      <form className="speakers-filters" role="search" aria-label="Search speakers" onSubmit={onSubmit}>
        <label htmlFor="speaker-q">Search</label>
        <input id="speaker-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        <label htmlFor="speaker-topic">Topic</label>
        <input id="speaker-topic" type="text" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <label htmlFor="speaker-location">Location</label>
        <input id="speaker-location" type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
        <label htmlFor="speaker-marker">Marker</label>
        <select id="speaker-marker" value={marker} onChange={(e) => setMarker(e.target.value as MarkerFilter)}>
          <option value="">Any marker</option>
          <option value="have_back">Have back</option>
          <option value="not_again">Not again</option>
          <option value="none">No marker</option>
        </select>
        <button type="submit">Search</button>
        <button type="button" onClick={onClear}>
          Clear
        </button>
      </form>

      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading speakers…</p>}

      {!loading &&
        !error &&
        (speakers.length === 0 ? (
          <p>No speakers match these filters.</p>
        ) : (
          <table aria-label="Speakers">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Location</th>
                <th scope="col">Topics</th>
                <th scope="col">Marker</th>
                <th scope="col">Account</th>
              </tr>
            </thead>
            <tbody>
              {speakers.map((s) => (
                <tr key={s.speakerId}>
                  <th scope="row">
                    <Link to={`/admin/speakers/${encodeURIComponent(s.speakerId)}`}>{s.name}</Link>
                  </th>
                  <td>{s.location}</td>
                  <td>{s.topics.join(', ')}</td>
                  <td>{s.marker ? <MarkerBadge marker={s.marker} /> : <span>None</span>}</td>
                  <td>
                    <span className={`badge ${s.linked ? 'badge-linked' : 'badge-unlinked'}`}>
                      {s.linked ? 'Linked' : 'Unlinked'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </section>
  );
};

export default SpeakerDirectory;
