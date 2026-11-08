import React from 'react';
import type { CfpQuestion } from '../../services/apiTypes';
import { answerKey, toggleOption, type FormAnswer } from '../../utils/answers';

/** Single-select questions with up to this many options render as radios, otherwise a select. */
export const MAX_RADIO_OPTIONS = 5;

interface Props {
  question: CfpQuestion;
  value: FormAnswer | undefined;
  error?: string;
  onChange: (value: FormAnswer) => void;
  disabled?: boolean;
}

/** One dynamic answer input, chosen by question type. */
const QuestionField: React.FC<Props> = ({ question: q, value, error, onChange, disabled }) => {
  const id = `answer-${q.questionId}`;
  const helpId = q.helpText ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  // Number questions say so up front, so nobody has to guess the format.
  const numberHintId = q.type === 'number' ? `${id}-number` : undefined;
  const describedBy = [helpId, numberHintId, errorId].filter(Boolean).join(' ') || undefined;
  const key = answerKey(q.questionId);
  const options = q.options ?? [];
  const text = typeof value === 'string' ? value : '';
  const required = q.required;

  const labelText = (
    <>
      {q.label}
      {required ? <span> (required)</span> : null}
    </>
  );
  const help = q.helpText ? (
    <p id={helpId} className="help-text">
      {q.helpText}
    </p>
  ) : null;
  const errorEl = error ? (
    <span id={errorId} className="field-error" role="alert">
      {error}
    </span>
  ) : null;
  const common = {
    id,
    'data-field-key': key,
    'aria-required': required ? (true as const) : undefined,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': describedBy,
    disabled,
  };

  switch (q.type) {
    case 'short_text':
      return (
        <div>
          <label htmlFor={id}>{labelText}</label>
          {help}
          <input type="text" {...common} value={text} onChange={(e) => onChange(e.target.value)} />
          {errorEl}
        </div>
      );
    case 'long_text':
      return (
        <div>
          <label htmlFor={id}>{labelText}</label>
          {help}
          <textarea rows={5} {...common} value={text} onChange={(e) => onChange(e.target.value)} />
          {errorEl}
        </div>
      );
    case 'number':
      return (
        <div>
          <label htmlFor={id}>{labelText}</label>
          {help}
          <p id={numberHintId} className="help-text">
            Enter a number, for example 25.
          </p>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            {...common}
            value={text}
            onChange={(e) => onChange(e.target.value)}
          />
          {errorEl}
        </div>
      );
    case 'single_select':
      if (options.length > MAX_RADIO_OPTIONS) {
        return (
          <div>
            <label htmlFor={id}>{labelText}</label>
            {help}
            <select {...common} value={text} onChange={(e) => onChange(e.target.value)}>
              <option value="">Select an option</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {errorEl}
          </div>
        );
      }
      return (
        <fieldset
          data-field-key={key}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        >
          <legend>{labelText}</legend>
          {help}
          {options.map((o, i) => (
            <label key={o} htmlFor={`${id}-${i}`}>
              <input
                type="radio"
                id={`${id}-${i}`}
                name={id}
                value={o}
                checked={text === o}
                disabled={disabled}
                onChange={() => onChange(o)}
              />{' '}
              {o}
            </label>
          ))}
          {errorEl}
        </fieldset>
      );
    case 'yes_no':
      return (
        <fieldset
          data-field-key={key}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        >
          <legend>{labelText}</legend>
          {help}
          {(['yes', 'no'] as const).map((v) => (
            <label key={v} htmlFor={`${id}-${v}`}>
              <input
                type="radio"
                id={`${id}-${v}`}
                name={id}
                value={v}
                checked={text === v}
                disabled={disabled}
                onChange={() => onChange(v)}
              />{' '}
              {v === 'yes' ? 'Yes' : 'No'}
            </label>
          ))}
          {errorEl}
        </fieldset>
      );
    case 'multi_select': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <fieldset
          data-field-key={key}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        >
          <legend>{labelText}</legend>
          {help}
          {options.map((o, i) => (
            <label key={o} htmlFor={`${id}-${i}`}>
              <input
                type="checkbox"
                id={`${id}-${i}`}
                value={o}
                checked={selected.includes(o)}
                disabled={disabled}
                onChange={() => onChange(toggleOption(q, selected, o))}
              />{' '}
              {o}
            </label>
          ))}
          {errorEl}
        </fieldset>
      );
    }
    default:
      return null;
  }
};

export default QuestionField;
