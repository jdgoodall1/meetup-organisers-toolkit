// Pure validators (no AWS/IO). Each returns a field -> message map that is
// empty when valid, suitable for `new ValidationError(fields)`.

import type { CfpQuestion, QuestionType } from './models';

export type FieldErrors = Record<string, string>;

export const QUESTION_TYPES: readonly QuestionType[] = [
  'short_text',
  'long_text',
  'single_select',
  'multi_select',
  'number',
  'yes_no',
];

export const HEADSHOT_MAX_BYTES = 5 * 1024 * 1024;
export const HEADSHOT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

function isBlank(v: unknown): boolean {
  return typeof v !== 'string' || v.trim().length === 0;
}

/** Returns epoch ms for a parseable ISO date string, otherwise NaN. */
function toTime(v: unknown): number {
  return typeof v === 'string' && v.trim() !== '' ? Date.parse(v) : NaN;
}

export interface EventInput {
  title?: unknown;
  startDateTime?: unknown;
  endDateTime?: unknown;
}

/** Title and start required; end (if given) must be >= start. */
export function validateEvent(input: EventInput): FieldErrors {
  const errors: FieldErrors = {};
  if (isBlank(input.title)) errors.title = 'Title is required';

  const start = toTime(input.startDateTime);
  if (isBlank(input.startDateTime)) errors.startDateTime = 'Start date is required';
  else if (Number.isNaN(start)) errors.startDateTime = 'Start date must be a valid date';

  if (input.endDateTime !== undefined && input.endDateTime !== null && input.endDateTime !== '') {
    const end = toTime(input.endDateTime);
    if (Number.isNaN(end)) errors.endDateTime = 'End date must be a valid date';
    else if (!Number.isNaN(start) && end < start) {
      errors.endDateTime = 'End date must not be before start date';
    }
  }
  return errors;
}

export interface CfpInput {
  title?: unknown;
  opensAt?: unknown;
  closesAt?: unknown;
}

/**
 * Title required. opensAt and closesAt are both optional (no closesAt means a
 * standing CFP that stays open until closed). When given they must be valid
 * dates, and closesAt must be after opensAt only when both exist.
 */
export function validateCfp(input: CfpInput): FieldErrors {
  const errors: FieldErrors = {};
  if (isBlank(input.title)) errors.title = 'Title is required';

  const has = (v: unknown) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');
  const hasOpens = has(input.opensAt);
  const hasCloses = has(input.closesAt);
  const opens = toTime(input.opensAt);
  const closes = toTime(input.closesAt);
  if (hasOpens && Number.isNaN(opens)) errors.opensAt = 'Open date must be a valid date';
  if (hasCloses) {
    if (Number.isNaN(closes)) errors.closesAt = 'Close date must be a valid date';
    else if (hasOpens && !Number.isNaN(opens) && closes <= opens) {
      errors.closesAt = 'Close date must be after open date';
    }
  }
  return errors;
}
export type QuestionInput = Partial<Omit<CfpQuestion, 'type'>> & { type?: unknown };

/** Valid type, non-empty label, and at least 2 distinct non-blank options for selects. */
export function validateQuestion(input: QuestionInput, prefix = ''): FieldErrors {
  const errors: FieldErrors = {};
  const key = (f: string) => (prefix ? `${prefix}.${f}` : f);

  if (isBlank(input.label)) errors[key('label')] = 'Label is required';

  const type = input.type;
  if (typeof type !== 'string' || !QUESTION_TYPES.includes(type as QuestionType)) {
    errors[key('type')] = `Type must be one of: ${QUESTION_TYPES.join(', ')}`;
    return errors;
  }

  if (type === 'single_select' || type === 'multi_select') {
    const opts = input.options;
    const valid =
      Array.isArray(opts) &&
      opts.every((o) => typeof o === 'string' && o.trim().length > 0) &&
      new Set(opts.map((o) => o.trim())).size >= 2;
    if (!valid) errors[key('options')] = 'Select questions require at least 2 distinct options';
  }
  return errors;
}

/** Validates a list of questions; error keys look like `questions[0].label`. */
export function validateQuestions(questions: unknown): FieldErrors {
  if (!Array.isArray(questions)) return { questions: 'Questions must be a list' };
  const errors: FieldErrors = {};
  questions.forEach((q, i) => {
    if (q === null || typeof q !== 'object') {
      errors[`questions[${i}]`] = 'Question must be an object';
      return;
    }
    Object.assign(errors, validateQuestion(q as QuestionInput, `questions[${i}]`));
  });
  return errors;
}

export interface SpeakerProfileInput {
  name?: unknown;
  bio?: unknown;
}

/** Name and bio required. */
export function validateSpeakerProfile(input: SpeakerProfileInput): FieldErrors {
  const errors: FieldErrors = {};
  if (isBlank(input.name)) errors.name = 'Name is required';
  if (isBlank(input.bio)) errors.bio = 'Bio is required';
  return errors;
}

/** Headshot must be JPEG, PNG or WebP and at most 5 MB. */
export function validateHeadshot(contentType: unknown, sizeBytes: unknown): FieldErrors {
  const errors: FieldErrors = {};
  const ct = typeof contentType === 'string' ? contentType.toLowerCase().trim() : '';
  if (!(HEADSHOT_CONTENT_TYPES as readonly string[]).includes(ct)) {
    errors.contentType = 'Headshot must be a JPEG, PNG or WebP image';
  }
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    errors.size = 'Headshot size must be a positive number of bytes';
  } else if (sizeBytes > HEADSHOT_MAX_BYTES) {
    errors.size = 'Headshot must be 5 MB or smaller';
  }
  return errors;
}

export function isValid(errors: FieldErrors): boolean {
  return Object.keys(errors).length === 0;
}
