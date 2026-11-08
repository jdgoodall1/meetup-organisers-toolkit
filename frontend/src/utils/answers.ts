import type {
  AnswerValue,
  CfpQuestion,
  SubmissionAnswer,
  SubmissionInput,
} from '../services/apiTypes';
import { LEVEL_OPTIONS } from './talkOptions';

/** Pure form-state helpers for the speaker submission form (no React, no API). */

/**
 * Raw form value per question. Text and number inputs hold strings, yes/no
 * holds 'yes' | 'no' | '', single select holds the chosen option, multi select
 * holds the chosen options.
 */
export type FormAnswer = string | string[];
export type FormAnswers = Record<string, FormAnswer>;

export interface SubmissionFormValues {
  talkTitle: string;
  abstract: string;
  /** Selected duration band as a string ('' when none chosen). */
  durationMinutes: string;
  /** Selected level as a string ('' when none chosen). */
  level: string;
  answers: FormAnswers;
}

export type FormErrors = Record<string, string>;
export type SubmissionMode = 'draft' | 'submit';

export const answerKey = (questionId: string): string => `answers.${questionId}`;

export const sortQuestions = (questions: CfpQuestion[]): CfpQuestion[] =>
  [...questions].sort((a, b) => a.order - b.order);

/** Default (empty) value for a question's input. */
export function emptyAnswer(q: Pick<CfpQuestion, 'type'>): FormAnswer {
  return q.type === 'multi_select' ? [] : '';
}

/** Converts a stored answer value to its form representation. */
export function toFormAnswer(q: Pick<CfpQuestion, 'type'>, value: AnswerValue | undefined): FormAnswer {
  if (value === undefined || value === null) return emptyAnswer(q);
  switch (q.type) {
    case 'multi_select':
      return Array.isArray(value) ? value.map(String) : [];
    case 'yes_no':
      return value === true ? 'yes' : value === false ? 'no' : '';
    case 'number':
      return typeof value === 'number' ? String(value) : '';
    default:
      return typeof value === 'string' ? value : '';
  }
}

/** Builds the form answers for every question, using saved answers where present. */
export function initialAnswers(
  questions: CfpQuestion[],
  saved?: Record<string, SubmissionAnswer>,
): FormAnswers {
  const out: FormAnswers = {};
  for (const q of questions) out[q.questionId] = toFormAnswer(q, saved?.[q.questionId]?.value);
  return out;
}

export function emptyFormValues(questions: CfpQuestion[]): SubmissionFormValues {
  return { talkTitle: '', abstract: '', durationMinutes: '', level: '', answers: initialAnswers(questions) };
}

export function isAnswerEmpty(v: FormAnswer | undefined): boolean {
  if (v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  return v.trim() === '';
}

/** Toggles one option of a multi select answer, keeping the question's option order. */
export function toggleOption(q: Pick<CfpQuestion, 'options'>, current: FormAnswer | undefined, option: string): string[] {
  const set = new Set(Array.isArray(current) ? current : []);
  if (set.has(option)) set.delete(option);
  else set.add(option);
  return (q.options ?? []).filter((o) => set.has(o));
}

/** Converts one form answer to its API value; undefined when unanswered or not parseable. */
export function toAnswerValue(q: CfpQuestion, v: FormAnswer | undefined): AnswerValue | undefined {
  if (isAnswerEmpty(v)) return undefined;
  switch (q.type) {
    case 'number': {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'yes_no':
      return v === 'yes';
    case 'multi_select':
      return Array.isArray(v) ? v : undefined;
    default:
      return typeof v === 'string' ? v.trim() : undefined;
  }
}

/** Builds the request body. Unanswered questions are omitted. */
export function buildPayload(questions: CfpQuestion[], values: SubmissionFormValues): SubmissionInput {
  const answers: Record<string, AnswerValue> = {};
  for (const q of questions) {
    const value = toAnswerValue(q, values.answers[q.questionId]);
    if (value !== undefined) answers[q.questionId] = value;
  }
  const payload: SubmissionInput = { answers };
  if (values.talkTitle.trim()) payload.talkTitle = values.talkTitle.trim();
  if (values.abstract.trim()) payload.abstract = values.abstract.trim();
  const d = values.durationMinutes.trim();
  if (d !== '') payload.durationMinutes = Number(d);
  if (values.level !== '') payload.level = Number(values.level);
  return payload;
}

/**
 * Client-side validation mirroring the server. Draft mode only checks values
 * that were entered; submit mode also requires the core fields and every
 * required question.
 */
export function validateValues(
  questions: CfpQuestion[],
  values: SubmissionFormValues,
  mode: SubmissionMode,
): FormErrors {
  const errors: FormErrors = {};
  const submit = mode === 'submit';

  if (submit && !values.talkTitle.trim()) errors.talkTitle = 'Talk title is required';
  if (submit && !values.abstract.trim()) errors.abstract = 'Abstract is required';

  const d = values.durationMinutes.trim();
  if (d === '') {
    if (submit) errors.durationMinutes = 'Duration is required';
  } else {
    const n = Number(d);
    if (!Number.isFinite(n) || n <= 0) errors.durationMinutes = 'Choose how long the talk will be';
  }

  if (values.level === '') {
    if (submit) errors.level = 'Level is required';
  } else if (!LEVEL_OPTIONS.some((o) => String(o.value) === values.level)) {
    errors.level = 'Choose a level from 100 to 500';
  }

  for (const q of questions) {
    const v = values.answers[q.questionId];
    const key = answerKey(q.questionId);
    if (isAnswerEmpty(v)) {
      if (submit && q.required) errors[key] = 'This question is required';
      continue;
    }
    if (q.type === 'number' && !Number.isFinite(Number(v))) errors[key] = 'Answer must be a number';
    if (q.type === 'single_select' && !(q.options ?? []).includes(v as string)) {
      errors[key] = 'Choose one of the available options';
    }
    if (q.type === 'multi_select' && !(v as string[]).every((o) => (q.options ?? []).includes(o))) {
      errors[key] = 'Choose only from the available options';
    }
  }
  return errors;
}

/** Field keys in display order. */
export function fieldOrder(questions: CfpQuestion[]): string[] {
  return ['talkTitle', 'abstract', 'durationMinutes', 'level', ...questions.map((q) => answerKey(q.questionId))];
}

/** First key from `errors` in display order; undefined when no displayed field has an error. */
export function firstErrorKey(questions: CfpQuestion[], errors: FormErrors): string | undefined {
  return fieldOrder(questions).find((k) => errors[k]);
}
