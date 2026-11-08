import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import type { AdminCfp, CfpInput } from '../../services/apiTypes';
import { describeCfpStatus } from '../../utils/cfpStatus';
import CfpActions from './CfpActions';
import CfpForm from './CfpForm';
import QuestionBuilder from './QuestionBuilder';

/**
 * Create (`/admin/cfps/new`) and detail/edit (`/admin/cfps/:id`) page.
 * The area below the form is where QuestionBuilder (task 13.2) goes.
 */
const CfpEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [cfp, setCfp] = useState<AdminCfp>();
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const load = useCallback(async (cfpId: string, isCancelled: () => boolean = () => false) => {
    const result = await api.getCfp(cfpId);
    if (isCancelled()) return;
    if (result.ok) {
      setCfp(result.data);
      setError(undefined);
    } else {
      setError(result.kind === 'error' ? result.error.message : result.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    setLoading(true);
    setSaved(false);
    void load(id, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [id, isNew, load]);

  const submit = (input: CfpInput) => (cfp ? api.updateCfp(cfp.cfpId, input) : api.createCfp(input));

  return (
    <section>
      <p>
        <Link to="/admin/cfps">Back to CFPs</Link>
      </p>
      <h1>{isNew ? 'New CFP' : cfp ? cfp.title : 'CFP'}</h1>

      {loading && <p role="status">Loading CFP…</p>}
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">CFP saved.</p>}
      {cfp && <p>{describeCfpStatus(cfp)}</p>}

      {!loading && (isNew || cfp) && (
        <CfpForm
          key={cfp?.updatedAt ?? 'new'}
          cfp={cfp}
          onSubmit={submit}
          onCancel={() => navigate('/admin/cfps')}
          onSaved={(saved2) => {
            if (isNew) {
              navigate(`/admin/cfps/${encodeURIComponent(saved2.cfpId)}`);
            } else {
              setSaved(true);
              void load(saved2.cfpId);
            }
          }}
        />
      )}

      {cfp && (
        <>
          <p>
            <Link className="btn btn-secondary" to={`/admin/cfps/${encodeURIComponent(cfp.cfpId)}/submissions`}>View submissions</Link>
          </p>
          <CfpActions
            cfp={cfp}
            onChanged={() => {
              setSaved(false);
              void load(cfp.cfpId);
            }}
            onDuplicated={(copy) => navigate(`/admin/cfps/${encodeURIComponent(copy.cfpId)}`)}
            onDeleted={() => navigate('/admin/cfps')}
            onError={setError}
          />
          <QuestionBuilder
            key={cfp.updatedAt}
            cfp={cfp}
            onChanged={() => {
              setSaved(false);
              void load(cfp.cfpId);
            }}
          />

        </>
      )}
    </section>
  );
};

export default CfpEditPage;
