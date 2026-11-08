import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuestionBuilder from '../admin/QuestionBuilder';
import type { CfpQuestion } from '../../services/apiTypes';

const mockApi = {
  replaceCfpQuestions: jest.fn(),
  listTemplates: jest.fn(),
  createTemplate: jest.fn(),
  applyTemplate: jest.fn(),
  deleteTemplate: jest.fn(),
};
jest.mock('../../services/api', () => ({
  __esModule: true,
  get default() {
    return mockApi;
  },
}));

const q = (over: Partial<CfpQuestion>): CfpQuestion => ({
  questionId: 'a',
  type: 'short_text',
  label: 'Audience',
  required: false,
  order: 0,
  ...over,
});

const cfp = (questions: CfpQuestion[] = []) => ({ cfpId: 'c1', updatedAt: 'u1', questions });

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.listTemplates.mockResolvedValue({ ok: true, status: 200, data: [] });
});

describe('QuestionBuilder', () => {
  it('moves a question down with the button and saves the new order', async () => {
    mockApi.replaceCfpQuestions.mockResolvedValue({ ok: true, status: 200, data: {} });
    const onChanged = jest.fn();
    render(
      <QuestionBuilder
        cfp={cfp([q({ questionId: 'a', label: 'First' }), q({ questionId: 'b', label: 'Second', order: 1 })])}
        onChanged={onChanged}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Move question 1 down' }));
    expect(screen.getByText('First moved to position 2 of 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save questions' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const sent = mockApi.replaceCfpQuestions.mock.calls[0][1];
    expect(sent.map((x: { label: string }) => x.label)).toEqual(['Second', 'First']);
  });

  it('blocks saving a select question with duplicate options', async () => {
    render(<QuestionBuilder cfp={cfp()} onChanged={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
    await userEvent.type(screen.getByLabelText('Label for question 1'), 'Level');
    await userEvent.selectOptions(screen.getByLabelText('Type of question 1'), 'single_select');
    await userEvent.type(screen.getByLabelText('Option 1 for question 1'), 'Beginner');
    await userEvent.type(screen.getByLabelText('Option 2 for question 1'), 'Beginner');
    await userEvent.click(screen.getByRole('button', { name: 'Save questions' }));
    expect(screen.getByText('Options must be unique')).toBeInTheDocument();
    expect(mockApi.replaceCfpQuestions).not.toHaveBeenCalled();
  });

  describe('adding questions', () => {
    it.each([
      ['short_text', false],
      ['long_text', false],
      ['number', false],
      ['yes_no', false],
      ['single_select', true],
      ['multi_select', true],
    ])('adding a %s question shows option editor: %s', async (type, hasOptions) => {
      render(<QuestionBuilder cfp={cfp()} onChanged={jest.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
      expect(screen.getByText('Question 1 added')).toBeInTheDocument();
      await userEvent.selectOptions(screen.getByLabelText('Type of question 1'), type);
      if (hasOptions) {
        expect(screen.getByRole('group', { name: 'Options for question 1' })).toBeInTheDocument();
        expect(screen.getByLabelText('Option 1 for question 1')).toBeInTheDocument();
        expect(screen.getByLabelText('Option 2 for question 1')).toBeInTheDocument();
      } else {
        expect(screen.queryByRole('group', { name: 'Options for question 1' })).not.toBeInTheDocument();
      }
    });

    it('starts with the save button disabled until something changes', async () => {
      render(<QuestionBuilder cfp={cfp([q({})])} onChanged={jest.fn()} />);
      expect(screen.getByRole('button', { name: 'Save questions' })).toBeDisabled();
      await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
      expect(screen.getByRole('button', { name: 'Save questions' })).toBeEnabled();
    });
  });

  describe('reordering', () => {
    const three = () =>
      cfp([
        q({ questionId: 'a', label: 'First' }),
        q({ questionId: 'b', label: 'Second', order: 1 }),
        q({ questionId: 'c', label: 'Third', order: 2 }),
      ]);

    it('disables move up on the first and move down on the last question', () => {
      render(<QuestionBuilder cfp={three()} onChanged={jest.fn()} />);
      expect(screen.getByRole('button', { name: 'Move question 1 up' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Move question 1 down' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Move question 2 up' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Move question 2 down' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Move question 3 up' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Move question 3 down' })).toBeDisabled();
    });

    it('moves up, announces the new position and updates button states', async () => {
      render(<QuestionBuilder cfp={three()} onChanged={jest.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Move question 3 up' }));
      expect(screen.getByRole('status')).toHaveTextContent('Third moved to position 2 of 3');
      expect(screen.getByLabelText('Label for question 2')).toHaveValue('Third');
      expect(screen.getByLabelText('Label for question 3')).toHaveValue('Second');
      expect(screen.getByRole('button', { name: 'Move question 3 down' })).toBeDisabled();
    });

    it('saves the reordered list in the new order', async () => {
      mockApi.replaceCfpQuestions.mockResolvedValue({ ok: true, status: 200, data: {} });
      render(<QuestionBuilder cfp={three()} onChanged={jest.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Move question 3 up' }));
      await userEvent.click(screen.getByRole('button', { name: 'Move question 2 up' }));
      await userEvent.click(screen.getByRole('button', { name: 'Save questions' }));
      await screen.findByText('Questions saved.');
      expect(mockApi.replaceCfpQuestions).toHaveBeenCalled();
      expect(mockApi.replaceCfpQuestions.mock.calls[0][1].map((x: { questionId: string }) => x.questionId)).toEqual([
        'c',
        'a',
        'b',
      ]);
    });
  });

  describe('deleting', () => {
    it('removes the question, announces it and renumbers the rest', async () => {
      render(
        <QuestionBuilder
          cfp={cfp([q({ questionId: 'a', label: 'First' }), q({ questionId: 'b', label: 'Second', order: 1 })])}
          onChanged={jest.fn()}
        />,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Delete question 1' }));
      expect(screen.getByRole('status')).toHaveTextContent('First deleted');
      expect(screen.getByLabelText('Label for question 1')).toHaveValue('Second');
      expect(screen.queryByLabelText('Label for question 2')).not.toBeInTheDocument();
    });
  });

  describe('saved payload', () => {
    it('carries required and help text, trimming values', async () => {
      mockApi.replaceCfpQuestions.mockResolvedValue({ ok: true, status: 200, data: {} });
      render(<QuestionBuilder cfp={cfp()} onChanged={jest.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
      await userEvent.type(screen.getByLabelText('Label for question 1'), '  Audience ');
      await userEvent.type(screen.getByLabelText('Help text for question 1'), ' Who is it for? ');
      await userEvent.click(screen.getByLabelText('Required (question 1)'));
      await userEvent.click(screen.getByRole('button', { name: 'Save questions' }));
      await screen.findByText('Questions saved.');
      expect(mockApi.replaceCfpQuestions).toHaveBeenCalled();
      expect(mockApi.replaceCfpQuestions.mock.calls[0][1]).toEqual([
        { type: 'short_text', label: 'Audience', required: true, helpText: 'Who is it for?' },
      ]);
    });

    it('sends trimmed options for a valid select question', async () => {
      mockApi.replaceCfpQuestions.mockResolvedValue({ ok: true, status: 200, data: {} });
      render(<QuestionBuilder cfp={cfp()} onChanged={jest.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
      await userEvent.type(screen.getByLabelText('Label for question 1'), 'Level');
      await userEvent.selectOptions(screen.getByLabelText('Type of question 1'), 'multi_select');
      await userEvent.type(screen.getByLabelText('Option 1 for question 1'), ' Beginner ');
      await userEvent.type(screen.getByLabelText('Option 2 for question 1'), 'Expert');
      await userEvent.click(screen.getByRole('button', { name: 'Save questions' }));
      await screen.findByText('Questions saved.');
      expect(mockApi.replaceCfpQuestions).toHaveBeenCalled();
      expect(mockApi.replaceCfpQuestions.mock.calls[0][1]).toEqual([
        { type: 'multi_select', label: 'Level', required: false, options: ['Beginner', 'Expert'] },
      ]);
    });
  });

  describe('option validation', () => {
    const setup = async () => {
      render(<QuestionBuilder cfp={cfp()} onChanged={jest.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
      await userEvent.type(screen.getByLabelText('Label for question 1'), 'Level');
      await userEvent.selectOptions(screen.getByLabelText('Type of question 1'), 'single_select');
    };

    it('blocks save with fewer than 2 options', async () => {
      await setup();
      await userEvent.type(screen.getByLabelText('Option 1 for question 1'), 'Only');
      await userEvent.click(screen.getByRole('button', { name: 'Remove option 2 of question 1' }));
      await userEvent.click(screen.getByRole('button', { name: 'Save questions' }));
      expect(screen.getByText('Add at least 2 options')).toBeInTheDocument();
      expect(mockApi.replaceCfpQuestions).not.toHaveBeenCalled();
    });

    it('blocks save with a blank option', async () => {
      await setup();
      await userEvent.type(screen.getByLabelText('Option 1 for question 1'), 'Beginner');
      await userEvent.type(screen.getByLabelText('Option 2 for question 1'), '   ');
      await userEvent.click(screen.getByRole('button', { name: 'Save questions' }));
      expect(screen.getByText('Options cannot be blank')).toBeInTheDocument();
      expect(mockApi.replaceCfpQuestions).not.toHaveBeenCalled();
    });

    it('treats options that differ only by surrounding whitespace as duplicates', async () => {
      await setup();
      await userEvent.type(screen.getByLabelText('Option 1 for question 1'), 'Beginner');
      await userEvent.type(screen.getByLabelText('Option 2 for question 1'), ' Beginner ');
      await userEvent.click(screen.getByRole('button', { name: 'Save questions' }));
      expect(screen.getByText('Options must be unique')).toBeInTheDocument();
      expect(mockApi.replaceCfpQuestions).not.toHaveBeenCalled();
    });

    it('shows errors per question and announces the failure', async () => {
      render(<QuestionBuilder cfp={cfp()} onChanged={jest.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
      await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
      await userEvent.type(screen.getByLabelText('Label for question 2'), 'Fine');
      await userEvent.click(screen.getByRole('button', { name: 'Save questions' }));
      expect(screen.getAllByText('Label is required')).toHaveLength(1);
      expect(screen.getByLabelText('Label for question 1')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText('Label for question 2')).not.toHaveAttribute('aria-invalid');
      expect(screen.getByRole('status')).toHaveTextContent('Fix the highlighted questions before saving');
    });

    it('allows adding an option and clears the error once fixed', async () => {
      await setup();
      await userEvent.type(screen.getByLabelText('Option 1 for question 1'), 'A');
      await userEvent.click(screen.getByRole('button', { name: 'Save questions' }));
      expect(screen.getByText('Options cannot be blank')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Remove option 2 of question 1' }));
      await userEvent.click(screen.getByRole('button', { name: 'Add option to question 1' }));
      await userEvent.type(screen.getByLabelText('Option 2 for question 1'), 'B');
      mockApi.replaceCfpQuestions.mockResolvedValue({ ok: true, status: 200, data: {} });
      await userEvent.click(screen.getByRole('button', { name: 'Save questions' }));
      await screen.findByText('Questions saved.');
      expect(mockApi.replaceCfpQuestions).toHaveBeenCalled();
      expect(screen.queryByText('Options cannot be blank')).not.toBeInTheDocument();
    });
  });

  describe('changing question type', () => {
    it('drops options when switching from select to a text type', async () => {
      mockApi.replaceCfpQuestions.mockResolvedValue({ ok: true, status: 200, data: {} });
      render(
        <QuestionBuilder
          cfp={cfp([q({ type: 'single_select', options: ['x', 'y'] })])}
          onChanged={jest.fn()}
        />,
      );
      expect(screen.getByLabelText('Option 1 for question 1')).toHaveValue('x');
      await userEvent.selectOptions(screen.getByLabelText('Type of question 1'), 'long_text');
      expect(screen.queryByLabelText('Option 1 for question 1')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Save questions' }));
      await screen.findByText('Questions saved.');
      expect(mockApi.replaceCfpQuestions).toHaveBeenCalled();
      expect(mockApi.replaceCfpQuestions.mock.calls[0][1][0]).not.toHaveProperty('options');
    });

    it('adds two blank options when switching from text to select', async () => {
      render(<QuestionBuilder cfp={cfp([q({})])} onChanged={jest.fn()} />);
      await userEvent.selectOptions(screen.getByLabelText('Type of question 1'), 'multi_select');
      expect(screen.getByLabelText('Option 1 for question 1')).toHaveValue('');
      expect(screen.getByLabelText('Option 2 for question 1')).toHaveValue('');
    });

    it('keeps existing options when switching between select types', async () => {
      render(
        <QuestionBuilder cfp={cfp([q({ type: 'single_select', options: ['x', 'y', 'z'] })])} onChanged={jest.fn()} />,
      );
      await userEvent.selectOptions(screen.getByLabelText('Type of question 1'), 'multi_select');
      expect(screen.getByLabelText('Option 3 for question 1')).toHaveValue('z');
    });
  });

  it('asks for confirmation on CONFIRM_REQUIRED then retries with confirm', async () => {
    mockApi.replaceCfpQuestions
      .mockResolvedValueOnce({
        ok: false,
        kind: 'confirm_required',
        status: 409,
        message: 'Answers exist',
        warnings: ['Question "Audience" will be removed'],
      })
      .mockResolvedValueOnce({ ok: true, status: 200, data: {} });
    render(<QuestionBuilder cfp={cfp([q({})])} onChanged={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete question 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save questions' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
    await waitFor(() => expect(mockApi.replaceCfpQuestions).toHaveBeenCalledTimes(2));
    expect(mockApi.replaceCfpQuestions.mock.calls[1][2]).toMatchObject({ confirm: true });
  });
});
