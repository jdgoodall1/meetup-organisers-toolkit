import {
  addOption,
  addQuestion,
  deleteQuestion,
  moveQuestion,
  newDraftQuestion,
  removeOption,
  toDrafts,
  toInputs,
  updateOption,
  updateQuestion,
  validateDraft,
  validateDrafts,
  validateOptions,
  type DraftQuestion,
} from '../questions';

const draft = (over: Partial<DraftQuestion> = {}): DraftQuestion => ({
  ...newDraftQuestion(),
  label: 'Label',
  ...over,
});

describe('utils/questions', () => {
  describe('newDraftQuestion / addQuestion', () => {
    it('creates text questions without options and select questions with two blanks', () => {
      expect(newDraftQuestion('long_text').options).toEqual([]);
      expect(newDraftQuestion('single_select').options).toEqual(['', '']);
      expect(newDraftQuestion('multi_select').options).toEqual(['', '']);
    });

    it('appends with unique keys', () => {
      const list = addQuestion(addQuestion([]), 'number');
      expect(list).toHaveLength(2);
      expect(list[0].key).not.toEqual(list[1].key);
      expect(list[1].type).toBe('number');
    });
  });

  describe('moveQuestion', () => {
    const list = [draft({ key: 'a' }), draft({ key: 'b' }), draft({ key: 'c' })];
    it('swaps neighbours', () => {
      expect(moveQuestion(list, 'b', -1).map((q) => q.key)).toEqual(['b', 'a', 'c']);
      expect(moveQuestion(list, 'b', 1).map((q) => q.key)).toEqual(['a', 'c', 'b']);
    });
    it('returns the same list when out of range or unknown', () => {
      expect(moveQuestion(list, 'a', -1)).toBe(list);
      expect(moveQuestion(list, 'c', 1)).toBe(list);
      expect(moveQuestion(list, 'zzz', 1)).toBe(list);
    });
  });

  describe('deleteQuestion', () => {
    it('removes by key', () => {
      const list = [draft({ key: 'a' }), draft({ key: 'b' })];
      expect(deleteQuestion(list, 'a').map((q) => q.key)).toEqual(['b']);
    });
  });

  describe('updateQuestion type changes', () => {
    it('adds blank options when switching to a select type', () => {
      const out = updateQuestion([draft({ key: 'a' })], 'a', { type: 'single_select' });
      expect(out[0].options).toEqual(['', '']);
    });
    it('tops up to two options and keeps existing ones', () => {
      const out = updateQuestion([draft({ key: 'a', options: ['x'] })], 'a', { type: 'multi_select' });
      expect(out[0].options).toEqual(['x', '']);
    });
    it('keeps options when switching between select types', () => {
      const out = updateQuestion([draft({ key: 'a', type: 'single_select', options: ['x', 'y', 'z'] })], 'a', {
        type: 'multi_select',
      });
      expect(out[0].options).toEqual(['x', 'y', 'z']);
    });
    it('clears options when switching to a non-select type', () => {
      const out = updateQuestion([draft({ key: 'a', type: 'single_select', options: ['x', 'y'] })], 'a', {
        type: 'yes_no',
      });
      expect(out[0].options).toEqual([]);
    });
    it('leaves other questions untouched', () => {
      const other = draft({ key: 'b' });
      expect(updateQuestion([draft({ key: 'a' }), other], 'a', { label: 'New' })[1]).toBe(other);
    });
  });

  describe('option editing', () => {
    const base = [draft({ key: 'a', type: 'single_select', options: ['x', 'y'] })];
    it('adds, updates and removes options', () => {
      expect(addOption(base, 'a')[0].options).toEqual(['x', 'y', '']);
      expect(updateOption(base, 'a', 1, 'z')[0].options).toEqual(['x', 'z']);
      expect(removeOption(base, 'a', 0)[0].options).toEqual(['y']);
    });
  });

  describe('validateOptions', () => {
    it('accepts two distinct options', () => {
      expect(validateOptions(['a', 'b'])).toBeUndefined();
    });
    it('rejects blank options', () => {
      expect(validateOptions(['a', '  '])).toBe('Options cannot be blank');
    });
    it('rejects duplicates after trimming', () => {
      expect(validateOptions(['a', ' a '])).toBe('Options must be unique');
    });
    it('rejects fewer than two options', () => {
      expect(validateOptions(['a'])).toBe('Add at least 2 options');
      expect(validateOptions([])).toBe('Add at least 2 options');
    });
  });

  describe('validateDraft / validateDrafts', () => {
    it('requires a label', () => {
      expect(validateDraft(draft({ label: '  ' })).label).toBe('Label is required');
    });
    it('ignores options for non-select types', () => {
      expect(validateDraft(draft({ type: 'short_text', options: [] }))).toEqual({});
    });
    it('reports option errors for select types', () => {
      expect(validateDraft(draft({ type: 'single_select', options: ['a'] })).options).toBe('Add at least 2 options');
    });
    it('keys errors by draft key and omits valid drafts', () => {
      const out = validateDrafts([
        draft({ key: 'ok' }),
        draft({ key: 'bad', label: '', type: 'multi_select', options: ['a', 'a'] }),
      ]);
      expect(Object.keys(out)).toEqual(['bad']);
      expect(out.bad).toEqual({ label: 'Label is required', options: 'Options must be unique' });
    });
  });

  describe('toDrafts / toInputs', () => {
    it('sorts by order and fills defaults', () => {
      const drafts = toDrafts([
        { questionId: 'b', type: 'single_select', label: 'B', required: true, order: 1 },
        { questionId: 'a', type: 'short_text', label: 'A', required: false, order: 0, helpText: 'h' },
      ]);
      expect(drafts.map((d) => d.questionId)).toEqual(['a', 'b']);
      expect(drafts[0].helpText).toBe('h');
      expect(drafts[1].options).toEqual(['', '']);
    });

    it('trims values, omits empty help text and options for non-select types', () => {
      const inputs = toInputs([
        draft({ key: 'k1', label: ' Hi ', helpText: '  ', required: true }),
        draft({
          key: 'k2',
          questionId: 'q2',
          type: 'single_select',
          label: 'Pick',
          helpText: ' Choose ',
          options: [' a ', 'b'],
        }),
      ]);
      expect(inputs[0]).toEqual({ type: 'short_text', label: 'Hi', required: true });
      expect(inputs[1]).toEqual({
        questionId: 'q2',
        type: 'single_select',
        label: 'Pick',
        required: false,
        helpText: 'Choose',
        options: ['a', 'b'],
      });
    });
  });
});
