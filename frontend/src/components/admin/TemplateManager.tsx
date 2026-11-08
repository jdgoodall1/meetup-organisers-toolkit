import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import type { ApiResult, Cfp, QuestionTemplate } from '../../services/apiTypes';
import { toInputs, validateDrafts, type DraftQuestion } from '../../utils/questions';
import ConfirmDialog from '../common/ConfirmDialog';

interface TemplateManagerProps {
  cfpId: string;
  updatedAt: string;
  /** Current (possibly unsaved) question list, used when saving a template. */
  drafts: DraftQuestion[];
  /** Applying a template acts on the saved CFP, so unsaved edits block it. */
  dirty: boolean;
  onApplied: (cfp: Cfp) => void;
}

const errorMessage = (r: Exclude<ApiResult<unknown>, { ok: true }>): string =>
  r.kind === 'error' ? r.error.message : r.message;

/** Save the current questions as a template; apply (copy) or delete templates. */
const TemplateManager: React.FC<TemplateManagerProps> = ({ cfpId, updatedAt, drafts, dirty, onApplied }) => {
  const [templates, setTemplates] = useState<QuestionTemplate[]>([]);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState<{ message: string; warnings: string[] }>();

  const refresh = useCallback(async () => {
    const result = await api.listTemplates();
    if (result.ok) setTemplates(result.data);
    else setError(errorMessage(result));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveTemplate = async () => {
    setMessage(undefined);
    setError(undefined);
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }
    if (drafts.length === 0) {
      setError('Add at least one question before saving a template');
      return;
    }
    if (Object.keys(validateDrafts(drafts)).length > 0) {
      setError('Fix the invalid questions before saving a template');
      return;
    }
    setBusy(true);
    try {
      const questions = toInputs(drafts).map((q) => ({ ...q, questionId: undefined }));
      const result = await api.createTemplate({ name: name.trim(), questions });
      if (result.ok) {
        setName('');
        setMessage(`Template "${result.data.name}" saved.`);
        await refresh();
      } else {
        setError(errorMessage(result));
      }
    } finally {
      setBusy(false);
    }
  };

  const apply = async (confirmed: boolean) => {
    if (!selected) return;
    setMessage(undefined);
    setError(undefined);
    setBusy(true);
    try {
      const result = await api.applyTemplate(cfpId, { templateId: selected, mode, updatedAt }, confirmed);
      if (result.ok) {
        setConfirm(undefined);
        setMessage('Template applied. The questions are a copy and will not change if the template does.');
        onApplied(result.data);
      } else if (result.kind === 'confirm_required') {
        setConfirm({ message: result.message, warnings: result.warnings });
      } else {
        setConfirm(undefined);
        setError(errorMessage(result));
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    setMessage(undefined);
    setError(undefined);
    setBusy(true);
    try {
      const result = await api.deleteTemplate(selected);
      if (result.ok) {
        setSelected('');
        setMessage('Template deleted.');
        await refresh();
      } else {
        setError(errorMessage(result));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="templates-heading">
      <h3 id="templates-heading">Templates</h3>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

      <div>
        <label htmlFor="template-name">Template name</label>
        <input id="template-name" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="button" disabled={busy} onClick={() => void saveTemplate()}>
          Save questions as template
        </button>
      </div>

      <div>
        <label htmlFor="template-select">Template</label>
        <select id="template-select" value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Choose a template</option>
          {templates.map((t) => (
            <option key={t.templateId} value={t.templateId}>
              {t.name}
            </option>
          ))}
        </select>
        <label htmlFor="template-mode">When applying</label>
        <select
          id="template-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as 'append' | 'replace')}
        >
          <option value="append">Add to existing questions</option>
          <option value="replace">Replace existing questions</option>
        </select>
        <button type="button" disabled={busy || !selected || dirty} onClick={() => void apply(false)}>
          Apply template
        </button>
        <button type="button" className="danger" disabled={busy || !selected} onClick={() => void remove()}>
          Delete template
        </button>
        {dirty && <p>Save your question changes before applying a template.</p>}
      </div>

      {confirm && (
        <ConfirmDialog
          title="Apply template?"
          message={confirm.message || 'Existing answers may be affected by these changes.'}
          details={confirm.warnings}
          confirmLabel="Apply anyway"
          busy={busy}
          onConfirm={() => void apply(true)}
          onCancel={() => setConfirm(undefined)}
        />
      )}
    </section>
  );
};

export default TemplateManager;
