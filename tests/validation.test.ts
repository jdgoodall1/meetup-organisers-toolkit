import {
  validateEvent,
  validateCfp,
  validateQuestion,
  validateQuestions,
  validateSpeakerProfile,
  validateHeadshot,
} from '../src/shared/validation';
import { effectiveStatus, validateSubmission } from '../src/shared/cfp-logic';

describe('validators', () => {
  test('validateEvent', () => {
    expect(validateEvent({ title: 'T', startDateTime: '2030-01-01T10:00:00Z' })).toEqual({});
    expect(validateEvent({ title: ' ', startDateTime: '' })).toHaveProperty('title');
    expect(validateEvent({ title: 'T', startDateTime: 'nope' })).toHaveProperty('startDateTime');
    expect(
      validateEvent({ title: 'T', startDateTime: '2030-01-02T00:00:00Z', endDateTime: '2030-01-01T00:00:00Z' }),
    ).toHaveProperty('endDateTime');
  });

  test('validateCfp', () => {
    const ok = { title: 'C', opensAt: '2030-01-01T00:00:00Z', closesAt: '2030-02-01T00:00:00Z' };
    expect(validateCfp(ok)).toEqual({});
    expect(validateCfp({ ...ok, closesAt: ok.opensAt })).toHaveProperty('closesAt');
    // Only the title is required; open/close dates are optional (standing CFP).
    expect(validateCfp({})).toEqual({ title: expect.any(String) });
    expect(validateCfp({ title: 'C' })).toEqual({});
    expect(validateCfp({ title: 'C', opensAt: ok.opensAt })).toEqual({});
    expect(validateCfp({ title: 'C', closesAt: ok.closesAt })).toEqual({});
    expect(validateCfp({ title: 'C', opensAt: '', closesAt: null })).toEqual({});
    // closes-after-opens only applies when both exist; given dates must parse.
    expect(validateCfp({ title: 'C', opensAt: ok.closesAt, closesAt: ok.opensAt })).toHaveProperty('closesAt');
    expect(validateCfp({ title: 'C', closesAt: 'nope' })).toHaveProperty('closesAt');
    expect(validateCfp({ title: 'C', opensAt: 'nope' })).toHaveProperty('opensAt');
  });

  test('validateQuestion(s)', () => {
    expect(validateQuestion({ label: 'L', type: 'short_text' })).toEqual({});
    expect(validateQuestion({ label: '', type: 'short_text' })).toHaveProperty('label');
    expect(validateQuestion({ label: 'L', type: 'bogus' })).toHaveProperty('type');
    expect(validateQuestion({ label: 'L', type: 'single_select', options: ['a'] })).toHaveProperty('options');
    expect(validateQuestion({ label: 'L', type: 'multi_select', options: ['a', 'a'] })).toHaveProperty('options');
    expect(validateQuestion({ label: 'L', type: 'multi_select', options: ['a', 'b'] })).toEqual({});
    expect(validateQuestions('x')).toHaveProperty('questions');
    expect(validateQuestions([{ label: '', type: 'yes_no' }])).toHaveProperty(['questions[0].label']);
  });

  test('validateSpeakerProfile', () => {
    expect(validateSpeakerProfile({ name: 'A', bio: 'B' })).toEqual({});
    expect(Object.keys(validateSpeakerProfile({}))).toEqual(['name', 'bio']);
  });

  test('validateHeadshot', () => {
    expect(validateHeadshot('image/png', 1000)).toEqual({});
    expect(validateHeadshot('image/gif', 1000)).toHaveProperty('contentType');
    expect(validateHeadshot('image/jpeg', 5 * 1024 * 1024 + 1)).toHaveProperty('size');
    expect(validateHeadshot('image/webp', 5 * 1024 * 1024)).toEqual({});
    expect(validateHeadshot('image/jpeg', 0)).toHaveProperty('size');
  });
});

describe('effectiveStatus', () => {
  const closesAt = '2030-01-01T00:00:00Z';
  test('open before close, closed after', () => {
    expect(effectiveStatus({ status: 'open', closesAt }, '2029-12-31T00:00:00Z')).toBe('open');
    expect(effectiveStatus({ status: 'open', closesAt }, closesAt)).toBe('closed');
    expect(effectiveStatus({ status: 'closed', closesAt }, '2020-01-01T00:00:00Z')).toBe('closed');
    expect(effectiveStatus({ status: 'draft', closesAt }, '2020-01-01T00:00:00Z')).toBe('draft');
  });

  test('a CFP with no closesAt is open until closed (standing CFP)', () => {
    const now = '2099-01-01T00:00:00Z';
    expect(effectiveStatus({ status: 'open' }, now)).toBe('open');
    expect(effectiveStatus({ status: 'open', closesAt: undefined }, now)).toBe('open');
    expect(effectiveStatus({ status: 'open', closesAt: null }, now)).toBe('open');
    expect(effectiveStatus({ status: 'closed' }, now)).toBe('closed');
    expect(effectiveStatus({ status: 'draft' }, now)).toBe('draft');
  });

  test('opensAt, when present, must have passed', () => {
    const opensAt = '2030-01-01T00:00:00Z';
    expect(effectiveStatus({ status: 'open', opensAt }, '2029-12-31T00:00:00Z')).toBe('closed');
    expect(effectiveStatus({ status: 'open', opensAt }, opensAt)).toBe('open');
    expect(effectiveStatus({ status: 'open', opensAt, closesAt: '2031-01-01T00:00:00Z' }, '2030-06-01T00:00:00Z')).toBe('open');
  });
});

describe('validateSubmission modes', () => {
  const cfp = {
    questions: [
      { questionId: 'q1', label: 'a', type: 'short_text', required: true },
      { questionId: 'q2', label: 'b', type: 'single_select', required: false, options: ['x', 'y'] },
    ],
  } as any;

  test('draft allows missing fields', () => {
    expect(validateSubmission(cfp, {}, 'draft')).toEqual({});
  });
  test('draft still type-checks provided values', () => {
    expect(validateSubmission(cfp, { durationMinutes: -1, answers: { q2: 'z' } }, 'draft')).toEqual(
      expect.objectContaining({ durationMinutes: expect.any(String), 'answers.q2': expect.any(String) }),
    );
  });
  test('submit requires core fields and required questions', () => {
    const e = validateSubmission(cfp, {}, 'submit');
    expect(Object.keys(e).sort()).toEqual(['abstract', 'answers.q1', 'durationMinutes', 'level', 'talkTitle']);
  });
  test('submit valid', () => {
    expect(
      validateSubmission(
        cfp,
        { talkTitle: 'T', abstract: 'A', durationMinutes: 30, level: 200, answers: { q1: 'hi', q2: 'x' } },
        'submit',
      ),
    ).toEqual({});
  });
  test('level must be 100, 200, 300, 400 or 500', () => {
    for (const level of [100, 200, 300, 400, 500]) {
      expect(validateSubmission(cfp, { level }, 'draft')).not.toHaveProperty('level');
    }
    for (const level of [0, 50, 250, 600, '200', false]) {
      expect(validateSubmission(cfp, { level }, 'draft')).toHaveProperty('level');
    }
  });
});
