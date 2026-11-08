import * as fc from 'fast-check';
import { validateSubmission, toSpeakerStatus } from '../src/shared/cfp-logic';

const optionsArb = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 2, maxLength: 5 });

describe('cfp-logic properties', () => {
  // **Validates: Requirements 8.5, 8.6**
  it('single_select answers outside options are rejected', () => {
    fc.assert(
      fc.property(optionsArb, fc.string(), (options, v) => {
        fc.pre(!options.includes(v));
        const cfp = { questions: [{ questionId: 'q', label: 'l', type: 'single_select', required: false, options }] } as any;
        for (const mode of ['draft', 'submit'] as const) {
          const e = validateSubmission(cfp, { answers: { q: v } }, mode);
          // empty string is treated as unanswered in draft mode / optional
          if (v.trim() === '' && mode === 'draft') continue;
          if (v.trim() === '') continue;
          expect(e['answers.q']).toBeDefined();
        }
      }),
    );
  });

  // **Validates: Requirements 8.5, 8.6**
  it('multi_select answers containing a value outside options are rejected', () => {
    fc.assert(
      fc.property(optionsArb, fc.string({ minLength: 1 }), fc.boolean(), (options, bad, withValid) => {
        fc.pre(!options.includes(bad));
        const cfp = { questions: [{ questionId: 'q', label: 'l', type: 'multi_select', required: false, options }] } as any;
        const value = withValid ? [options[0], bad] : [bad];
        for (const mode of ['draft', 'submit'] as const) {
          expect(validateSubmission(cfp, { answers: { q: value } }, mode)['answers.q']).toBeDefined();
        }
      }),
    );
  });

  // **Validates: Requirements 8.5, 8.6**
  it('unknown question IDs are always rejected', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.jsonValue(), (id, value) => {
        fc.pre(id !== 'known' && id !== '__proto__');
        const cfp = { questions: [{ questionId: 'known', label: 'l', type: 'short_text', required: false }] } as any;
        const answers = Object.create(null);
        answers[id] = value;
        for (const mode of ['draft', 'submit'] as const) {
          expect(validateSubmission(cfp, { answers: { ...answers } }, mode)[`answers.${id}`]).toBe('Unknown question');
        }
      }),
    );
  });

  // **Validates: Requirements 8.12**
  it('speaker status never reveals shortlisted', () => {
    const statuses = ['draft', 'submitted', 'shortlisted', 'accepted', 'rejected', 'withdrawn'] as const;
    fc.assert(
      fc.property(fc.constantFrom(...statuses), (s) => {
        expect(toSpeakerStatus(s).toLowerCase()).not.toContain('shortlist');
      }),
    );
    expect(toSpeakerStatus('shortlisted')).toBe(toSpeakerStatus('submitted'));
  });
});
