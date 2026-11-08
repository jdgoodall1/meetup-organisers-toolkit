// Pure CFP and submission logic (no AWS/IO).

import type {
  AnswerValue,
  Cfp,
  CfpQuestion,
  CfpStatus,
  SpeakerFacingStatus,
  SubmissionStatus,
} from './models';
import type { FieldErrors } from './validation';

export type ValidationMode = 'draft' | 'submit';

function toMs(v: Date | string | number): number {
  return v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
}

/**
 * Single place that decides CFP openness. A CFP is open only if its stored
 * status is 'open', opensAt (if any) has passed, and closesAt (if any) is
 * still in the future. A CFP with no closesAt is a standing CFP: it stays
 * open until an admin closes it. Draft stays draft; otherwise closed (this
 * includes a stored-open CFP whose opensAt is still in the future).
 */
export function effectiveStatus(
  cfp: Pick<Cfp, 'status'> & { opensAt?: string | null; closesAt?: string | null },
  now: Date | string | number,
): CfpStatus {
  if (cfp.status === 'open') {
    const t = toMs(now);
    const started = !cfp.opensAt || t >= Date.parse(cfp.opensAt);
    const notEnded = !cfp.closesAt || t < Date.parse(cfp.closesAt);
    if (started && notEnded) return 'open';
  }
  return cfp.status === 'draft' ? 'draft' : 'closed';
}
/** Allowed talk levels: 100 (introductory) to 500 (expert). */
export const TALK_LEVELS = [100, 200, 300, 400, 500] as const;

export interface SubmissionInput {
  talkTitle?: unknown;
  abstract?: unknown;
  durationMinutes?: unknown;
  level?: unknown;
  /** Map of questionId to raw answer value. */
  answers?: unknown;
}

function isBlankString(v: unknown): boolean {
  return typeof v !== 'string' || v.trim().length === 0;
}

function isMissing(v: unknown): boolean {
  return v === undefined || v === null;
}

/** Returns an error message for an invalid answer value, or undefined. */
function checkAnswer(q: CfpQuestion, v: unknown): string | undefined {
  switch (q.type) {
    case 'short_text':
    case 'long_text':
      return typeof v === 'string' ? undefined : 'Answer must be text';
    case 'number':
      return typeof v === 'number' && Number.isFinite(v) ? undefined : 'Answer must be a number';
    case 'yes_no':
      return typeof v === 'boolean' ? undefined : 'Answer must be yes or no';
    case 'single_select':
      return typeof v === 'string' && (q.options ?? []).includes(v)
        ? undefined
        : 'Answer must be one of the available options';
    case 'multi_select':
      return Array.isArray(v) &&
        v.every((x) => typeof x === 'string' && (q.options ?? []).includes(x))
        ? undefined
        : 'Answers must all be from the available options';
    default:
      return 'Unsupported question type';
  }
}

/** Whether a required question counts as unanswered. */
function isEmptyAnswer(q: CfpQuestion, v: unknown): boolean {
  if (isMissing(v)) return true;
  if (q.type === 'short_text' || q.type === 'long_text' || q.type === 'single_select') {
    return typeof v === 'string' && v.trim().length === 0;
  }
  if (q.type === 'multi_select') return Array.isArray(v) && v.length === 0;
  return false;
}

/**
 * Validates a submission against its CFP. Draft mode only type-checks the
 * values provided; submit mode also requires the core fields and all
 * required questions. Returns a field -> message map (empty when valid).
 * Answer errors are keyed `answers.<questionId>`.
 */
export function validateSubmission(
  cfp: Pick<Cfp, 'questions'>,
  input: SubmissionInput,
  mode: ValidationMode,
): FieldErrors {
  const errors: FieldErrors = {};
  const submit = mode === 'submit';

  if (!isMissing(input.talkTitle)) {
    if (typeof input.talkTitle !== 'string') errors.talkTitle = 'Talk title must be text';
    else if (submit && isBlankString(input.talkTitle)) errors.talkTitle = 'Talk title is required';
  } else if (submit) errors.talkTitle = 'Talk title is required';

  if (!isMissing(input.abstract)) {
    if (typeof input.abstract !== 'string') errors.abstract = 'Abstract must be text';
    else if (submit && isBlankString(input.abstract)) errors.abstract = 'Abstract is required';
  } else if (submit) errors.abstract = 'Abstract is required';

  const d = input.durationMinutes;
  if (!isMissing(d)) {
    if (typeof d !== 'number' || !Number.isFinite(d) || d <= 0) {
      errors.durationMinutes = 'Duration must be a positive number of minutes';
    }
  } else if (submit) errors.durationMinutes = 'Duration is required';

  const lvl = input.level;
  if (!isMissing(lvl)) {
    if (typeof lvl !== 'number' || !(TALK_LEVELS as readonly number[]).includes(lvl)) {
      errors.level = `Level must be one of ${TALK_LEVELS.join(', ')}`;
    }
  } else if (submit) errors.level = 'Level is required';

  let answers: Record<string, unknown> = {};
  if (!isMissing(input.answers)) {
    if (typeof input.answers !== 'object' || Array.isArray(input.answers)) {
      errors.answers = 'Answers must be an object keyed by question';
    } else {
      answers = input.answers as Record<string, unknown>;
    }
  }

  const byId = new Map(cfp.questions.map((q) => [q.questionId, q]));
  for (const id of Object.keys(answers)) {
    const q = byId.get(id);
    if (!q) {
      errors[`answers.${id}`] = 'Unknown question';
      continue;
    }
    const v = answers[id];
    if (isMissing(v)) continue;
    // An empty optional-or-draft text/select value is treated as unanswered.
    if (isEmptyAnswer(q, v) && !(submit && q.required)) continue;
    const msg = checkAnswer(q, v);
    if (msg) errors[`answers.${id}`] = msg;
  }

  if (submit) {
    for (const q of cfp.questions) {
      const key = `answers.${q.questionId}`;
      if (q.required && !errors[key] && isEmptyAnswer(q, answers[q.questionId])) {
        errors[key] = 'This question is required';
      }
    }
  }
  return errors;
}

/** Maps internal status to what speakers see; never reveals 'shortlisted'. */
export function toSpeakerStatus(status: SubmissionStatus): SpeakerFacingStatus {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'submitted':
    case 'shortlisted':
      return 'Under review';
    case 'accepted':
      return 'Accepted';
    case 'rejected':
      return 'Not selected';
    case 'withdrawn':
      return 'Withdrawn';
  }
}

export type { AnswerValue };
