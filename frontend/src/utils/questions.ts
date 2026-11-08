import type { CfpQuestion, CfpQuestionInput, QuestionType } from '../services/apiTypes';

/** Pure editing logic for the CFP question list (no React, no API). */

export const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'short_text', label: 'Short text' },
  { value: 'long_text', label: 'Long text' },
  { value: 'single_select', label: 'Single select' },
  { value: 'multi_select', label: 'Multi select' },
  { value: 'number', label: 'Number (answers must be numeric)' },
  { value: 'yes_no', label: 'Yes / No' },
];

export const MIN_SELECT_OPTIONS = 2;

/** Editable question. `key` is a stable local id; `questionId` is set once saved. */
export interface DraftQuestion {
  key: string;
  questionId?: string;
  type: QuestionType;
  label: string;
  helpText: string;
  required: boolean;
  options: string[];
}

export type QuestionErrors = { label?: string; options?: string };

export const isSelectType = (type: QuestionType): boolean => type === 'single_select' || type === 'multi_select';

let keyCounter = 0;
const nextKey = (): string => `q-${Date.now().toString(36)}-${(keyCounter++).toString(36)}`;

export function newDraftQuestion(type: QuestionType = 'short_text'): DraftQuestion {
  return {
    key: nextKey(),
    type,
    label: '',
    helpText: '',
    required: false,
    options: isSelectType(type) ? ['', ''] : [],
  };
}

/** Converts saved questions (sorted by order) into drafts. */
export function toDrafts(questions: CfpQuestion[]): DraftQuestion[] {
  return [...questions]
    .sort((a, b) => a.order - b.order)
    .map((q) => ({
      key: q.questionId || nextKey(),
      questionId: q.questionId,
      type: q.type,
      label: q.label,
      helpText: q.helpText ?? '',
      required: q.required,
      options: q.options ? [...q.options] : isSelectType(q.type) ? ['', ''] : [],
    }));
}

/** Converts drafts to the API payload. Array position defines order. */
export function toInputs(drafts: DraftQuestion[]): CfpQuestionInput[] {
  return drafts.map((d) => {
    const input: CfpQuestionInput = {
      ...(d.questionId ? { questionId: d.questionId } : {}),
      type: d.type,
      label: d.label.trim(),
      required: d.required,
    };
    if (d.helpText.trim()) input.helpText = d.helpText.trim();
    if (isSelectType(d.type)) input.options = d.options.map((o) => o.trim());
    return input;
  });
}

export function addQuestion(list: DraftQuestion[], type: QuestionType = 'short_text'): DraftQuestion[] {
  return [...list, newDraftQuestion(type)];
}

export function updateQuestion(
  list: DraftQuestion[],
  key: string,
  patch: Partial<Omit<DraftQuestion, 'key' | 'questionId'>>,
): DraftQuestion[] {
  return list.map((q) => {
    if (q.key !== key) return q;
    const next = { ...q, ...patch };
    if (patch.type && patch.type !== q.type) {
      if (isSelectType(patch.type) && next.options.length < MIN_SELECT_OPTIONS) {
        next.options = [...next.options, ...Array<string>(MIN_SELECT_OPTIONS - next.options.length).fill('')];
      }
      if (!isSelectType(patch.type)) next.options = [];
    }
    return next;
  });
}

export function deleteQuestion(list: DraftQuestion[], key: string): DraftQuestion[] {
  return list.filter((q) => q.key !== key);
}

/** Moves a question by `delta` positions; out-of-range moves return the list unchanged. */
export function moveQuestion(list: DraftQuestion[], key: string, delta: -1 | 1): DraftQuestion[] {
  const from = list.findIndex((q) => q.key === key);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function addOption(list: DraftQuestion[], key: string): DraftQuestion[] {
  return list.map((q) => (q.key === key ? { ...q, options: [...q.options, ''] } : q));
}

export function updateOption(list: DraftQuestion[], key: string, index: number, value: string): DraftQuestion[] {
  return list.map((q) =>
    q.key === key ? { ...q, options: q.options.map((o, i) => (i === index ? value : o)) } : q,
  );
}

export function removeOption(list: DraftQuestion[], key: string, index: number): DraftQuestion[] {
  return list.map((q) => (q.key === key ? { ...q, options: q.options.filter((_, i) => i !== index) } : q));
}

/** Select questions need at least 2 distinct, non-blank options. */
export function validateOptions(options: string[]): string | undefined {
  if (options.some((o) => o.trim() === '')) return 'Options cannot be blank';
  const trimmed = options.map((o) => o.trim());
  if (new Set(trimmed).size !== trimmed.length) return 'Options must be unique';
  if (trimmed.length < MIN_SELECT_OPTIONS) return `Add at least ${MIN_SELECT_OPTIONS} options`;
  return undefined;
}

export function validateDraft(q: DraftQuestion): QuestionErrors {
  const errors: QuestionErrors = {};
  if (q.label.trim() === '') errors.label = 'Label is required';
  if (isSelectType(q.type)) {
    const message = validateOptions(q.options);
    if (message) errors.options = message;
  }
  return errors;
}

/** Errors keyed by draft `key`; empty when the whole list is valid. */
export function validateDrafts(list: DraftQuestion[]): Record<string, QuestionErrors> {
  const out: Record<string, QuestionErrors> = {};
  for (const q of list) {
    const e = validateDraft(q);
    if (e.label || e.options) out[q.key] = e;
  }
  return out;
}
