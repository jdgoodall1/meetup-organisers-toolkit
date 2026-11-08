import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import type { ApiResult, SpeakerCfp, SpeakerSubmission } from '../../services/apiTypes';
import {
  answerKey,
  buildPayload,
  emptyFormValues,
  fieldOrder,
  firstErrorKey,
  initialAnswers,
  sortQuestions,
  validateValues,
  type FormAnswer,
  type FormErrors,
  type SubmissionFormValues,
  type SubmissionMode,
} from '../../utils/answers';
import { DURATION_OPTIONS, LEVEL_OPTIONS, formatDuration } from '../../utils/talkOptions';
import QuestionField from './QuestionField';

interface Props {
  cfp: SpeakerCfp;
  /** Existing submission when editing. */
  submission?: SpeakerSubmission;
}

type Action = 'draft' | 'submit' | 'save';
type Blocked = 'closed' | 'locked';

const CORE_LABELS: Record<string, string> = {
  talkTitle: 'Talk title',
  abstract: 'Abstract',
  durationMinutes: 'Duration',
  level: 'Level',
};

function valuesFrom(cfp: SpeakerCfp, submission?: SpeakerSubmission): SubmissionFormValues {
  if (!submission) return emptyFormValues(cfp.questions);
  return {
    talkTitle: submission.talkTitle ?? '',
    abstract: submission.abstract ?? '',
    durationMinutes: submission.durationMinutes > 0 ? String(submission.durationMinutes) : '',
    level: submission.level ? String(submission.level) : '',
    answers: initialAnswers(cfp.questions, submission.answers),
  };
}

/** Focuses the input for a field key (first input inside radio/checkbox groups). */
function focusField(form: HTMLFormElement | null, key: string): void {
  if (!form) return;
  const el = Array.from(form.querySelectorAll<HTMLElement>('[data-field-key]')).find(
    (n) => n.getAttribute('data-field-key') === key,
  );
  if (!el) return;
  const target = el.tagName === 'FIELDSET' ? el.querySelector<HTMLElement>('input') ?? el : el;
  target.focus();
}

/** Create or edit a talk submission for a CFP, rendered from the CFP's question list. */
const SubmissionForm: React.FC<Props> = ({ cfp, submission }) => {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const questions = useMemo(() => sortQuestions(cfp.questions), [cfp.questions]);

  const [current, setCurrent] = useState<SpeakerSubmission | undefined>(submission);
  const [values, setValues] = useState<SubmissionFormValues>(() => valuesFrom(cfp, submission));
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [blocked, setBlocked] = useState<Blocked | undefined>(
    submission && submission.status !== 'Draft' && submission.status !== 'Under review' ? 'locked' : undefined,
  );
  const [needsProfile, setNeedsProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const pendingFocus = useRef(false);

  // Move focus to the first invalid field after errors render.
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    const key = firstErrorKey(questions, errors);
    if (key) focusField(formRef.current, key);
  }, [errors, questions]);

  const showErrors = (found: FormErrors) => {
    pendingFocus.current = true;
    setErrors(found);
  };

  const labelFor = (key: string): string => {
    if (CORE_LABELS[key]) return CORE_LABELS[key];
    const q = questions.find((x) => answerKey(x.questionId) === key);
    return q ? q.label : key;
  };

  const setCore = (patch: Partial<Omit<SubmissionFormValues, 'answers'>>) =>
    setValues((v) => ({ ...v, ...patch }));
  const setAnswer = (questionId: string, value: FormAnswer) =>
    setValues((v) => ({ ...v, answers: { ...v.answers, [questionId]: value } }));

  const handleFailure = (r: Exclude<ApiResult<unknown>, { ok: true }>) => {
    if (r.kind !== 'error') {
      setFormError(r.message);
      return;
    }
    const { code, message, fields } = r.error;
    if (code === 'CFP_CLOSED') {
      setBlocked('closed');
      setFormError(message || 'This call for papers has closed and no longer accepts changes.');
      return;
    }
    if (code === 'SUBMISSION_LOCKED') {
      setBlocked('locked');
      setFormError(message || 'This submission can no longer be changed. Please contact the organisers.');
      return;
    }
    if (fields && Object.keys(fields).length) {
      if (fields.profile) setNeedsProfile(true);
      setFormError('Please fix the highlighted fields.');
      showErrors(fields);
      return;
    }
    setFormError(
      code === 'CONFLICT'
        ? 'This submission was changed elsewhere. Reload the page to see the latest version, then try again.'
        : message,
    );
  };

  const run = async (action: Action) => {
    setFormError(undefined);
    setNotice(undefined);
    const mode: SubmissionMode = action === 'draft' ? 'draft' : 'submit';
    const found = validateValues(questions, values, mode);
    if (Object.keys(found).length) {
      setFormError('Please fix the highlighted fields.');
      showErrors(found);
      return;
    }
    setErrors({});
    const payload = buildPayload(questions, values);

    setBusy(true);
    try {
      let sub = current;
      if (!sub) {
        // New submissions are created as drafts first; submit follows if requested.
        const created = await api.createSubmission({ cfpId: cfp.cfpId, ...payload });
        if (!created.ok) return handleFailure(created);
        sub = created.data;
        setCurrent(sub);
        if (action === 'draft') {
          setNotice('Draft saved.');
          return;
        }
      }
      const body = { ...payload, updatedAt: sub.updatedAt };
      if (action === 'submit') {
        const r = await api.submitMySubmission(sub.submissionId, body);
        if (!r.ok) return handleFailure(r);
        navigate('/speaker/submissions');
        return;
      }
      const r = await api.updateMySubmission(sub.submissionId, body);
      if (!r.ok) return handleFailure(r);
      setCurrent(r.data);
      setNotice(action === 'draft' ? 'Draft saved.' : 'Changes saved.');
    } finally {
      setBusy(false);
    }
  };

  if (needsProfile) {
    return (
      <p role="alert">
        You need a speaker profile before you can submit. <Link className="btn btn-primary" to="/speaker/profile">Create your profile</Link>
      </p>
    );
  }

  const isDraft = !current || current.status === 'Draft';
  const disabled = busy || blocked !== undefined;
  const summary = Object.entries(errors);

  return (
    <section aria-labelledby="submission-heading">
      <h1 id="submission-heading">{current ? 'Edit submission' : 'New submission'}</h1>
      <p>
        For <Link to={`/speaker/cfps/${cfp.cfpId}`}>{cfp.title}</Link>
      </p>

      <form
        ref={formRef}
        noValidate
        aria-label="Talk submission"
        onSubmit={(e) => {
          e.preventDefault();
          void run(isDraft ? 'submit' : 'save');
        }}
      >
        {(formError || summary.length > 0) && (
          <div role="alert" className="form-error">
            {formError && <p>{formError}</p>}
            {summary.length > 0 && (
              <ul aria-label="Errors">
                {summary.map(([key, msg]) => (
                  <li key={key}>
                    {fieldOrder(questions).includes(key) ? (
                      <button type="button" onClick={() => focusField(formRef.current, key)}>
                        {labelFor(key)}: {msg}
                      </button>
                    ) : (
                      <span>
                        {key}: {msg}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {notice && <p role="status">{notice}</p>}

        <div>
          <label htmlFor="sf-talkTitle">
            Talk title<span> (required)</span>
          </label>
          <input
            id="sf-talkTitle"
            data-field-key="talkTitle"
            value={values.talkTitle}
            onChange={(e) => setCore({ talkTitle: e.target.value })}
            disabled={disabled}
            aria-required="true"
            aria-invalid={errors.talkTitle ? true : undefined}
            aria-describedby={errors.talkTitle ? 'sf-talkTitle-error' : undefined}
          />
          {errors.talkTitle && (
            <span id="sf-talkTitle-error" className="field-error" role="alert">
              {errors.talkTitle}
            </span>
          )}
        </div>

        <div>
          <label htmlFor="sf-abstract">
            Abstract<span> (required)</span>
          </label>
          <textarea
            id="sf-abstract"
            data-field-key="abstract"
            rows={6}
            value={values.abstract}
            onChange={(e) => setCore({ abstract: e.target.value })}
            disabled={disabled}
            aria-required="true"
            aria-invalid={errors.abstract ? true : undefined}
            aria-describedby={errors.abstract ? 'sf-abstract-error' : undefined}
          />
          {errors.abstract && (
            <span id="sf-abstract-error" className="field-error" role="alert">
              {errors.abstract}
            </span>
          )}
        </div>

        <div>
          <label htmlFor="sf-durationMinutes">
            Duration<span> (required)</span>
          </label>
          <select
            id="sf-durationMinutes"
            data-field-key="durationMinutes"
            value={values.durationMinutes}
            onChange={(e) => setCore({ durationMinutes: e.target.value })}
            disabled={disabled}
            aria-required="true"
            aria-invalid={errors.durationMinutes ? true : undefined}
            aria-describedby={errors.durationMinutes ? 'sf-durationMinutes-error' : undefined}
          >
            <option value="">Select a duration</option>
            {DURATION_OPTIONS.map((o) => (
              <option key={o.value} value={String(o.value)}>
                {o.label}
              </option>
            ))}
            {/* Older submissions may hold a length that is not one of the bands; keep it selectable. */}
            {values.durationMinutes !== '' &&
              !DURATION_OPTIONS.some((o) => String(o.value) === values.durationMinutes) && (
                <option value={values.durationMinutes}>{formatDuration(Number(values.durationMinutes))}</option>
              )}
          </select>
          {errors.durationMinutes && (
            <span id="sf-durationMinutes-error" className="field-error" role="alert">
              {errors.durationMinutes}
            </span>
          )}
        </div>

        <div>
          <label htmlFor="sf-level">
            Level<span> (required)</span>
          </label>
          <p id="sf-level-help" className="help-text">
            100 is introductory, 500 is expert.
          </p>
          <select
            id="sf-level"
            data-field-key="level"
            value={values.level}
            onChange={(e) => setCore({ level: e.target.value })}
            disabled={disabled}
            aria-required="true"
            aria-invalid={errors.level ? true : undefined}
            aria-describedby={errors.level ? 'sf-level-help sf-level-error' : 'sf-level-help'}
          >
            <option value="">Select a level</option>
            {LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
          {errors.level && (
            <span id="sf-level-error" className="field-error" role="alert">
              {errors.level}
            </span>
          )}
        </div>

        {questions.map((q) => (
          <QuestionField
            key={q.questionId}
            question={q}
            value={values.answers[q.questionId]}
            error={errors[answerKey(q.questionId)]}
            onChange={(v) => setAnswer(q.questionId, v)}
            disabled={disabled}
          />
        ))}

        {isDraft ? (
          <>
            <button type="button" disabled={disabled} onClick={() => void run('draft')}>
              Save draft
            </button>{' '}
            <button type="submit" disabled={disabled}>
              Submit
            </button>
          </>
        ) : (
          <button type="submit" disabled={disabled}>
            Save changes
          </button>
        )}
      </form>
    </section>
  );
};

export default SubmissionForm;
