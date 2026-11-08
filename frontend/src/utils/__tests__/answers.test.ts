import type { CfpQuestion } from '../../services/apiTypes';
import { buildPayload, emptyFormValues, initialAnswers, toggleOption, validateValues } from '../answers';

const qs: CfpQuestion[] = [
  { questionId: 'a', type: 'short_text', label: 'A', required: true, order: 1 },
  { questionId: 'b', type: 'yes_no', label: 'B', required: true, order: 2 },
  { questionId: 'c', type: 'multi_select', label: 'C', required: false, options: ['x', 'y', 'z'], order: 3 },
  { questionId: 'd', type: 'number', label: 'D', required: false, order: 4 },
];

describe('answers helpers', () => {
  it('draft mode needs nothing; submit mode flags required fields', () => {
    const v = emptyFormValues(qs);
    expect(validateValues(qs, v, 'draft')).toEqual({});
    expect(Object.keys(validateValues(qs, v, 'submit')).sort()).toEqual(
      ['abstract', 'answers.a', 'answers.b', 'durationMinutes', 'level', 'talkTitle'].sort(),
    );
  });

  it('builds a typed payload and omits unanswered questions', () => {
    const v = { ...emptyFormValues(qs), talkTitle: ' T ', durationMinutes: '30', level: '200' };
    v.answers = { a: ' hi ', b: 'no', c: ['x'], d: '' };
    expect(buildPayload(qs, v)).toEqual({
      talkTitle: 'T',
      durationMinutes: 30,
      level: 200,
      answers: { a: 'hi', b: false, c: ['x'] },
    });
  });

  it('rejects a level outside 100 to 500', () => {
    const v = { ...emptyFormValues(qs), level: '250' };
    expect(validateValues(qs, v, 'draft')).toHaveProperty('level');
    expect(validateValues(qs, { ...v, level: '300' }, 'draft')).not.toHaveProperty('level');
  });

  it('restores saved answers and toggles multi-select in option order', () => {
    const answers = initialAnswers(qs, {
      b: { questionLabel: 'B', questionType: 'yes_no', value: true },
      c: { questionLabel: 'C', questionType: 'multi_select', value: ['z'] },
    });
    expect(answers).toMatchObject({ a: '', b: 'yes', c: ['z'] });
    expect(toggleOption(qs[2], ['z'], 'x')).toEqual(['x', 'z']);
    expect(toggleOption(qs[2], ['x', 'z'], 'z')).toEqual(['x']);
  });
});
