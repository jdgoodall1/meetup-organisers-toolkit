import React, { useRef, useState } from 'react';
import api from '../../services/api';
import type { ApiResult, Cfp, CfpQuestion } from '../../services/apiTypes';
import {
  QUESTION_TYPES,
  addOption,
  addQuestion,
  deleteQuestion,
  isSelectType,
  moveQuestion,
  removeOption,
  toDrafts,
  toInputs,
  updateOption,
  updateQuestion,
  validateDrafts,
  type DraftQuestion,
  type QuestionErrors,
} from '../../utils/questions';
import ConfirmDialog from '../common/ConfirmDialog';
import TemplateManager from './TemplateManager';

interface QuestionBuilderProps {
  cfp: { cfpId: string; questions: CfpQuestion[]; updatedAt: string };
  /** Called after the question list was saved or a template applied. */
  onChanged: (cfp: Cfp) => void;
}

const errorMessage = (r: Exclude<ApiResult<unknown>, { ok: true }>): string =>
  r.kind === 'error' ? r.error.message : r.message;

/**
 * Edit the ordered question list of a CFP. Reorder with the move buttons;
 * saving may require confirmation when existing answers would be affected.
 */
const QuestionBuilder: React.FC<QuestionBuilderProps> = ({ cfp, onChanged }) => {
  const [drafts, setDrafts] = useState<DraftQuestion[]>(() => toDrafts(cfp.questions));
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, QuestionErrors>>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; warnings: string[] }>();
  const moveButtons = useRef(new Map<string, HTMLButtonElement>());

  const edit = (next: DraftQuestion[]) => {
    setDrafts(next);
    setDirty(true);
    setSaved(false);
  };

  const labelOf = (q: DraftQuestion, index: number) => q.label.trim() || `Question ${index + 1}`;

  const move = (key: string, delta: -1 | 1) => {
    const from = drafts.findIndex((q) => q.key === key);
    const next = moveQuestion(drafts, key, delta);
    if (next === drafts) return;
    edit(next);
    const q = drafts[from];
    setAnnouncement(`${labelOf(q, from)} moved to position ${from + delta + 1} of ${drafts.length}`);
    // Keep focus on the same button after the list re-renders.
    const btnKey = `${key}:${delta}`;
    setTimeout(() => moveButtons.current.get(btnKey)?.focus(), 0);
  };

  const remove = (key: string) => {
    const index = drafts.findIndex((q) => q.key === key);
    setAnnouncement(`${labelOf(drafts[index], index)} deleted`);
    edit(deleteQuestion(drafts, key));
  };

  const add = () => {
    edit(addQuestion(drafts));
    setAnnouncement(`Question ${drafts.length + 1} added`);
  };

  const save = async (confirmed: boolean) => {
    const found = validateDrafts(drafts);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setServerError(undefined);
      setAnnouncement('Fix the highlighted questions before saving');
      return;
    }
    setBusy(true);
    setServerError(undefined);
    try {
      const result = await api.replaceCfpQuestions(cfp.cfpId, toInputs(drafts), {
        confirm: confirmed,
        updatedAt: cfp.updatedAt,
      });
      if (result.ok) {
        setConfirm(undefined);
        setDirty(false);
        setSaved(true);
        setAnnouncement('Questions saved');
        onChanged(result.data);
      } else if (result.kind === 'confirm_required') {
        setConfirm({ message: result.message, warnings: result.warnings });
      } else {
        setConfirm(undefined);
        setServerError(errorMessage(result));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="questions-heading">
      <h2 id="questions-heading">Questions</h2>
      <p>Extra questions speakers answer when submitting a talk.</p>

      <div role="status" aria-live="polite" className="visually-hidden">
        {announcement}
      </div>
      {serverError && <p role="alert">{serverError}</p>}
      {saved && <p>Questions saved.</p>}

      {drafts.length === 0 && <p>No questions yet.</p>}
      <ol>
        {drafts.map((q, index) => {
          const err = errors[q.key] ?? {};
          const n = index + 1;
          const id = `qb-${q.key}`;
          return (
            <li key={q.key} aria-label={`Question ${n}`}>
              <div>
                <label htmlFor={`${id}-label`}>Label for question {n}</label>
                <input
                  id={`${id}-label`}
                  value={q.label}
                  aria-invalid={err.label ? true : undefined}
                  aria-describedby={err.label ? `${id}-label-err` : undefined}
                  onChange={(e) => edit(updateQuestion(drafts, q.key, { label: e.target.value }))}
                />
                {err.label && (
                  <span id={`${id}-label-err`} role="alert">
                    {err.label}
                  </span>
                )}
              </div>
              <div>
                <label htmlFor={`${id}-type`}>Type of question {n}</label>
                <select
                  id={`${id}-type`}
                  value={q.type}
                  onChange={(e) =>
                    edit(updateQuestion(drafts, q.key, { type: e.target.value as DraftQuestion['type'] }))
                  }
                >
                  {QUESTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-help`}>Help text for question {n}</label>
                <input
                  id={`${id}-help`}
                  value={q.helpText}
                  onChange={(e) => edit(updateQuestion(drafts, q.key, { helpText: e.target.value }))}
                />
              </div>
              <div>
                <input
                  id={`${id}-required`}
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) => edit(updateQuestion(drafts, q.key, { required: e.target.checked }))}
                />
                <label htmlFor={`${id}-required`}>Required (question {n})</label>
              </div>

              {isSelectType(q.type) && (
                <fieldset aria-describedby={err.options ? `${id}-opts-err` : undefined}>
                  <legend>Options for question {n}</legend>
                  {q.options.map((opt, oi) => (
                    <div key={oi}>
                      <label htmlFor={`${id}-opt-${oi}`}>
                        Option {oi + 1} for question {n}
                      </label>
                      <input
                        id={`${id}-opt-${oi}`}
                        value={opt}
                        onChange={(e) => edit(updateOption(drafts, q.key, oi, e.target.value))}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          edit(removeOption(drafts, q.key, oi));
                          setAnnouncement(`Option ${oi + 1} removed`);
                        }}
                      >
                        Remove option {oi + 1} of question {n}
                      </button>
                    </div>
                  ))}
                  {err.options && (
                    <p id={`${id}-opts-err`} role="alert">
                      {err.options}
                    </p>
                  )}
                  <button type="button" onClick={() => edit(addOption(drafts, q.key))}>
                    Add option to question {n}
                  </button>
                </fieldset>
              )}

              <div>
                <button
                  type="button"
                  ref={(el) => {
                    if (el) moveButtons.current.set(`${q.key}:-1`, el);
                    else moveButtons.current.delete(`${q.key}:-1`);
                  }}
                  disabled={index === 0}
                  onClick={() => move(q.key, -1)}
                >
                  Move question {n} up
                </button>
                <button
                  type="button"
                  ref={(el) => {
                    if (el) moveButtons.current.set(`${q.key}:1`, el);
                    else moveButtons.current.delete(`${q.key}:1`);
                  }}
                  disabled={index === drafts.length - 1}
                  onClick={() => move(q.key, 1)}
                >
                  Move question {n} down
                </button>
                <button type="button" className="danger" onClick={() => remove(q.key)}>
                  Delete question {n}
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <button type="button" onClick={add}>
        Add question
      </button>
      <button type="button" disabled={busy || !dirty} onClick={() => void save(false)}>
        Save questions
      </button>
      {dirty && <p>You have unsaved question changes.</p>}

      <TemplateManager cfpId={cfp.cfpId} updatedAt={cfp.updatedAt} drafts={drafts} dirty={dirty} onApplied={onChanged} />

      {confirm && (
        <ConfirmDialog
          title="Save question changes?"
          message={confirm.message || 'Existing answers may be affected by these changes.'}
          details={confirm.warnings}
          confirmLabel="Save anyway"
          busy={busy}
          onConfirm={() => void save(true)}
          onCancel={() => setConfirm(undefined)}
        />
      )}
    </section>
  );
};

export default QuestionBuilder;
