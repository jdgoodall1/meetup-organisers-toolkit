import React, { useState } from 'react';
import type { ApiResult, Cfp, CfpInput, CfpStatus } from '../../services/apiTypes';
import { isoToLocalInputs, localInputsToIso } from '../../utils/eventDates';

interface CfpFormProps {
  /** Present when editing. */
  cfp?: Cfp;
  /** Performs the create/update call; the form shows any field errors it returns. */
  onSubmit: (input: CfpInput) => Promise<ApiResult<Cfp>>;
  onSaved: (cfp: Cfp) => void;
  onCancel?: () => void;
}

type Errors = Record<string, string>;

const STATUSES: CfpStatus[] = ['draft', 'open', 'closed'];

const toLocalValue = (iso?: string): string => {
  const { date, time } = isoToLocalInputs(iso);
  return date ? `${date}T${time}` : '';
};

const fromLocalValue = (value: string): string | undefined => {
  const [date, time] = value.split('T');
  return date ? localInputsToIso(date, time ?? '') : undefined;
};

const CfpForm: React.FC<CfpFormProps> = ({ cfp, onSubmit, onSaved, onCancel }) => {
  const [title, setTitle] = useState(cfp?.title ?? '');
  const [description, setDescription] = useState(cfp?.description ?? '');
  const [opensAt, setOpensAt] = useState(toLocalValue(cfp?.opensAt));
  const [closesAt, setClosesAt] = useState(toLocalValue(cfp?.closesAt));
  const [status, setStatus] = useState<CfpStatus>(cfp?.status ?? 'draft');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const validate = (): { errors: Errors; input?: CfpInput } => {
    const found: Errors = {};
    if (!title.trim()) found.title = 'Title is required';
    const opensIso = opensAt ? fromLocalValue(opensAt) : undefined;
    const closesIso = closesAt ? fromLocalValue(closesAt) : undefined;
    // Both dates are optional. No close date means a standing CFP that stays
    // open until it is closed.
    if (opensAt && !opensIso) found.opensAt = 'Enter a valid opening date and time';
    if (closesAt && !closesIso) found.closesAt = 'Enter a valid closing date and time';
    if (opensIso && closesIso && Date.parse(closesIso) <= Date.parse(opensIso)) {
      found.closesAt = 'Closing date must be after the opening date';
    }
    if (Object.keys(found).length) return { errors: found };
    return {
      errors: found,
      input: {
        title: title.trim(),
        description: description.trim(),
        // null clears a previously saved date on update.
        opensAt: opensIso ?? null,
        closesAt: closesIso ?? null,
        status,
        ...(cfp ? { updatedAt: cfp.updatedAt } : {}),
      },
    };
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(undefined);
    const { errors: found, input } = validate();
    setErrors(found);
    if (!input) return;

    setSaving(true);
    try {
      const result = await onSubmit(input);
      if (result.ok) {
        onSaved(result.data);
      } else if (result.kind === 'error') {
        const fields = result.error.fields;
        if (fields && Object.keys(fields).length) {
          setErrors(fields);
          setFormError('Please fix the highlighted fields.');
        } else {
          setFormError(result.error.message);
        }
      } else {
        setFormError(result.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const field = (name: string) => ({
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
  });
  const errorFor = (name: string) =>
    errors[name] ? (
      <span id={`${name}-error`} className="field-error" role="alert">
        {errors[name]}
      </span>
    ) : null;

  const knownFields = ['title', 'description', 'opensAt', 'closesAt', 'status'];
  const otherErrors = Object.entries(errors).filter(([k]) => !knownFields.includes(k));

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate aria-label={cfp ? 'Edit CFP' : 'New CFP'}>
      {formError && (
        <p role="alert" className="form-error">
          {formError}
        </p>
      )}
      {otherErrors.map(([k, msg]) => (
        <p key={k} role="alert" className="form-error">
          {k}: {msg}
        </p>
      ))}

      <div>
        <label htmlFor="cfp-title">Title (required)</label>
        <input id="cfp-title" value={title} onChange={(e) => setTitle(e.target.value)} {...field('title')} />
        {errorFor('title')}
      </div>

      <div>
        <label htmlFor="cfp-description">Description</label>
        <textarea
          id="cfp-description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          {...field('description')}
        />
        {errorFor('description')}
      </div>

      <div>
        <label htmlFor="cfp-opens">Opens (optional)</label>
        <input
          id="cfp-opens"
          type="datetime-local"
          value={opensAt}
          onChange={(e) => setOpensAt(e.target.value)}
          {...field('opensAt')}
        />
        {errorFor('opensAt')}
      </div>

      <div>
        <label htmlFor="cfp-closes">Closes (optional)</label>
        <input
          id="cfp-closes"
          type="datetime-local"
          value={closesAt}
          onChange={(e) => setClosesAt(e.target.value)}
          {...field('closesAt')}
          aria-describedby={errors.closesAt ? 'closesAt-error cfp-closes-hint' : 'cfp-closes-hint'}
        />
        <p id="cfp-closes-hint" className="help-text">
          Leave blank for a standing CFP that stays open until you close it
        </p>
        {errorFor('closesAt')}
      </div>

      <div>
        <label htmlFor="cfp-status">Status</label>
        <select id="cfp-status" value={status} onChange={(e) => setStatus(e.target.value as CfpStatus)} {...field('status')}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {errorFor('status')}
      </div>

      <button type="submit" disabled={saving}>
        {saving ? 'Saving…' : cfp ? 'Save changes' : 'Create CFP'}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      )}
    </form>
  );
};

export default CfpForm;
