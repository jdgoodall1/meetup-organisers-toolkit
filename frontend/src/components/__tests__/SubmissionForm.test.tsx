import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SubmissionForm from '../speaker/SubmissionForm';
import OpenCfps from '../speaker/OpenCfps';
import CfpDetail from '../speaker/CfpDetail';
import { NewSubmissionPage } from '../speaker/SubmissionPages';
import type { SpeakerCfp, SpeakerSubmission } from '../../services/apiTypes';

const mockApi = {
  listOpenCfps: jest.fn(),
  getOpenCfp: jest.fn(),
  listMySubmissions: jest.fn(),
  getMyProfile: jest.fn(),
  createSubmission: jest.fn(),
  updateMySubmission: jest.fn(),
  submitMySubmission: jest.fn(),
};
jest.mock('../../services/api', () => ({
  __esModule: true,
  get default() {
    return mockApi;
  },
}));

const ok = <T,>(data: T) => ({ ok: true, status: 200, data });
const apiError = (status: number, code: string, message: string, fields?: Record<string, string>) => ({
  ok: false,
  kind: 'error',
  status,
  error: { code, message, ...(fields ? { fields } : {}) },
});

const cfp: SpeakerCfp = {
  cfpId: 'c1',
  title: 'Spring CFP',
  description: 'Talk to us',
  opensAt: '2025-01-01T00:00:00Z',
  closesAt: '2099-01-01T00:00:00Z',
  questions: [
    { questionId: 'q1', type: 'short_text', label: 'Why you?', helpText: 'Be brief', required: true, order: 1 },
    { questionId: 'q2', type: 'single_select', label: 'Level', required: false, options: ['Beginner', 'Expert'], order: 2 },
  ],
};

const saved: SpeakerSubmission = {
  submissionId: 's1',
  cfpId: 'c1',
  status: 'Draft',
  talkTitle: 'Hello',
  abstract: 'World',
  durationMinutes: 30,
  answers: {},
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const renderForm = (props: { submission?: SpeakerSubmission } = {}) =>
  render(
    <MemoryRouter>
      <SubmissionForm cfp={cfp} {...props} />
    </MemoryRouter>,
  );

describe('SubmissionForm', () => {
  beforeEach(() => jest.resetAllMocks());

  it('renders dynamic questions with help text, required marker and radio options', () => {
    renderForm();
    expect(screen.getByLabelText(/Why you\?/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByText('Be brief')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Beginner' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Expert' })).toBeInTheDocument();
  });

  it('saves a draft with only entered values and no required check', async () => {
    mockApi.createSubmission.mockResolvedValue(ok(saved));
    renderForm();
    await userEvent.type(screen.getByLabelText(/Talk title/), 'Hello');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(mockApi.createSubmission).toHaveBeenCalled());
    expect(mockApi.createSubmission).toHaveBeenCalledWith({ cfpId: 'c1', talkTitle: 'Hello', answers: {} });
    expect(await screen.findByText('Draft saved.')).toBeInTheDocument();
  });

  it('blocks submit with errors and focuses the first invalid field', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(mockApi.createSubmission).not.toHaveBeenCalled();
    expect(screen.getAllByText('Talk title is required').length).toBeGreaterThan(0);
    const title = screen.getByLabelText(/Talk title/);
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAttribute('aria-describedby', 'sf-talkTitle-error');
    expect(title).toHaveFocus();
  });

  it('shows API field errors for answers and focuses that field', async () => {
    mockApi.createSubmission.mockResolvedValue(ok(saved));
    mockApi.submitMySubmission.mockResolvedValue(apiError(400, 'VALIDATION_ERROR', 'Invalid', { 'answers.q1': 'Server says no' }));
    renderForm();
    await userEvent.type(screen.getByLabelText(/Talk title/), 'T');
    await userEvent.type(screen.getByLabelText(/Abstract/), 'A');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /^Duration/ }), '30');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /^Level/ }), '200');
    await userEvent.type(screen.getByLabelText(/Why you\?/), 'Because');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect((await screen.findAllByText('Server says no')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Why you\?/)).toHaveFocus();
    // The draft was created once; a retry reuses it.
    expect(mockApi.createSubmission).toHaveBeenCalledTimes(1);
  });

  it('disables the form with a clear message when the CFP is closed', async () => {
    mockApi.updateMySubmission.mockResolvedValue(apiError(409, 'CFP_CLOSED', 'This CFP is closed and no longer accepts changes'));
    renderForm({ submission: saved });
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText(/CFP is closed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('shows a locked message on SUBMISSION_LOCKED', async () => {
    mockApi.updateMySubmission.mockResolvedValue(apiError(409, 'SUBMISSION_LOCKED', 'This submission can no longer be changed.'));
    renderForm({ submission: saved });
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText(/can no longer be changed/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Talk title/)).toBeDisabled();
  });
});

describe('OpenCfps', () => {
  beforeEach(() => jest.resetAllMocks());

  it('lists title, closing date and description', async () => {
    mockApi.listOpenCfps.mockResolvedValue(ok([cfp]));
    render(
      <MemoryRouter>
        <OpenCfps />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: 'Spring CFP' })).toHaveAttribute('href', '/speaker/cfps/c1');
    expect(screen.getByText('Talk to us')).toBeInTheDocument();
    expect(screen.getByText(/Closes/)).toBeInTheDocument();
  });

  it('shows "Open until further notice" for a standing CFP, never an invalid date', async () => {
    const standing: SpeakerCfp = { ...cfp, closesAt: undefined };
    mockApi.listOpenCfps.mockResolvedValue(ok([standing]));
    render(
      <MemoryRouter>
        <OpenCfps />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Open until further notice')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
    expect(screen.queryByText(/Closes/)).toBeNull();
  });
});

describe('CfpDetail', () => {
  beforeEach(() => jest.resetAllMocks());

  const renderDetail = () =>
    render(
      <MemoryRouter initialEntries={['/speaker/cfps/c1']}>
        <Routes>
          <Route path="/speaker/cfps/:id" element={<CfpDetail />} />
        </Routes>
      </MemoryRouter>,
    );

  it('shows the closing date and a button-styled "Start a submission" link', async () => {
    mockApi.getOpenCfp.mockResolvedValue(ok(cfp));
    mockApi.listMySubmissions.mockResolvedValue(ok([]));
    renderDetail();
    const start = await screen.findByRole('link', { name: 'Start a submission' });
    expect(start).toHaveAttribute('href', '/speaker/cfps/c1/submit');
    expect(start).toHaveClass('btn', 'btn-primary');
    expect(screen.getByText(/Closes/)).toBeInTheDocument();
  });

  it('shows "Open until further notice" for a standing CFP and lets the speaker start a submission', async () => {
    const standing: SpeakerCfp = { ...cfp, closesAt: undefined };
    mockApi.getOpenCfp.mockResolvedValue(ok(standing));
    mockApi.listMySubmissions.mockResolvedValue(ok([]));
    renderDetail();
    expect(await screen.findByText('Open until further notice')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Start a submission' })).toBeInTheDocument();
  });
});

describe('NewSubmissionPage', () => {
  beforeEach(() => jest.resetAllMocks());

  it('blocks without a profile and links to the profile page', async () => {
    mockApi.getMyProfile.mockResolvedValue(ok({ exists: false, name: '', bio: '', location: '', topics: [], links: [], pastTalks: [] }));
    mockApi.getOpenCfp.mockResolvedValue(ok(cfp));
    render(
      <MemoryRouter initialEntries={['/cfps/c1/submit']}>
        <Routes>
          <Route path="/cfps/:id/submit" element={<NewSubmissionPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/need a speaker profile/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create your profile/i })).toHaveAttribute('href', '/speaker/profile');
    expect(screen.getByRole('link', { name: /create your profile/i })).toHaveClass('btn', 'btn-primary');
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });
});

describe('SubmissionForm required fields and select options', () => {
  beforeEach(() => jest.resetAllMocks());

  const radioOptions = ['One', 'Two', 'Three', 'Four', 'Five'];
  const dropdownOptions = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Violet'];
  // Option order deliberately differs from alphabetical order.
  const multiOptions = ['Zeta', 'Alpha', 'Mu'];

  const fullCfp: SpeakerCfp = {
    ...cfp,
    questions: [
      { questionId: 'a1', type: 'short_text', label: 'Shorty', required: true, order: 1 },
      { questionId: 'a2', type: 'long_text', label: 'Longform', required: true, order: 2 },
      { questionId: 'a3', type: 'number', label: 'Quantity', required: true, order: 3 },
      { questionId: 'a4', type: 'yes_no', label: 'Agreed', required: true, order: 4 },
      { questionId: 'a5', type: 'single_select', label: 'Pick radio', required: true, options: radioOptions, order: 5 },
      { questionId: 'a6', type: 'multi_select', label: 'Pick many', required: true, options: multiOptions, order: 6 },
      { questionId: 'a7', type: 'single_select', label: 'Pick drop', required: true, options: dropdownOptions, order: 7 },
      { questionId: 'a8', type: 'short_text', label: 'Optional bit', required: false, order: 8 },
    ],
  };

  const renderFull = (submission?: SpeakerSubmission) =>
    render(
      <MemoryRouter>
        <SubmissionForm cfp={fullCfp} submission={submission} />
      </MemoryRouter>,
    );

  const group = (name: RegExp) => screen.getByRole('group', { name });
  const click = (name: string) => userEvent.click(screen.getByRole('button', { name }));

  const fillCore = async () => {
    await userEvent.type(screen.getByLabelText(/Talk title/), 'T');
    await userEvent.type(screen.getByLabelText(/Abstract/), 'A');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /^Duration/ }), '30');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /^Level/ }), '200');
  };

  it('shows a (required) marker only on required questions', () => {
    renderFull();
    expect(screen.getByLabelText('Shorty (required)')).toBeInTheDocument();
    expect(screen.getByLabelText('Optional bit')).not.toHaveAttribute('aria-required');
    expect(screen.queryByLabelText(/Optional bit.*\(required\)/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Shorty/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/Longform/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/Quantity/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/Pick drop/)).toHaveAttribute('aria-required', 'true');
    expect(group(/Agreed \(required\)/)).toBeInTheDocument();
    expect(group(/Pick radio \(required\)/)).toBeInTheDocument();
    expect(group(/Pick many \(required\)/)).toBeInTheDocument();
  });

  it('blocks Submit when required answers of every type are missing, with a per-field error', async () => {
    renderFull();
    await fillCore();
    await click('Submit');

    expect(mockApi.createSubmission).not.toHaveBeenCalled();
    expect(mockApi.submitMySubmission).not.toHaveBeenCalled();

    for (const [label, id] of [
      [/Shorty/, 'answer-a1'],
      [/Longform/, 'answer-a2'],
      [/Quantity/, 'answer-a3'],
      [/Pick drop/, 'answer-a7'],
    ] as const) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      // Number questions also point at their "Enter a number" hint, so match on containing the error id.
      expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(`${id}-error`);
      expect(document.getElementById(`${id}-error`)).toHaveTextContent('This question is required');
    }
    for (const [name, id] of [
      [/Agreed/, 'answer-a4'],
      [/Pick radio/, 'answer-a5'],
      [/Pick many/, 'answer-a6'],
    ] as const) {
      const g = group(name);
      expect(g).toHaveAttribute('aria-invalid', 'true');
      expect(g).toHaveAttribute('aria-describedby', `${id}-error`);
      expect(within(g).getByRole('alert')).toHaveTextContent('This question is required');
    }
    // The optional question is not flagged.
    expect(screen.getByLabelText('Optional bit')).not.toHaveAttribute('aria-invalid');
  });

  it('focuses the first input of the first invalid radio/checkbox group', async () => {
    renderFull();
    await fillCore();
    await userEvent.type(screen.getByLabelText(/Shorty/), 's');
    await userEvent.type(screen.getByLabelText(/Longform/), 'l');
    await userEvent.type(screen.getByLabelText(/Quantity/), '2');
    await click('Submit');
    expect(screen.getByRole('radio', { name: 'Yes' })).toHaveFocus();

    await userEvent.click(screen.getByRole('radio', { name: 'No' }));
    await click('Submit');
    expect(screen.getByRole('radio', { name: 'One' })).toHaveFocus();

    await userEvent.click(screen.getByRole('radio', { name: 'Two' }));
    await click('Submit');
    expect(screen.getByRole('checkbox', { name: 'Zeta' })).toHaveFocus();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Mu' }));
    await click('Submit');
    expect(screen.getByLabelText(/Pick drop/)).toHaveFocus();
  });

  it('does not block Save draft on missing required answers', async () => {
    mockApi.createSubmission.mockResolvedValue(ok(saved));
    renderFull();
    await userEvent.type(screen.getByLabelText(/Talk title/), 'Only title');
    await click('Save draft');
    await waitFor(() => expect(mockApi.createSubmission).toHaveBeenCalledTimes(1));
    expect(mockApi.createSubmission).toHaveBeenCalledWith({ cfpId: 'c1', talkTitle: 'Only title', answers: {} });
    expect(screen.queryByText('This question is required')).not.toBeInTheDocument();
  });

  it('offers duration as length bands and level as 100 to 500, both required to submit', async () => {
    renderFull();
    const duration = screen.getByRole('combobox', { name: /^Duration/ });
    expect(within(duration).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Select a duration',
      'Under 15 minutes',
      '15 to 30 minutes',
      '30 to 45 minutes',
      '45 to 60 minutes',
    ]);
    const level = screen.getByRole('combobox', { name: /^Level/ });
    expect(within(level).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Select a level',
      '100',
      '200',
      '300',
      '400',
      '500',
    ]);
    expect(duration).toHaveAttribute('aria-required', 'true');
    expect(level).toHaveAttribute('aria-required', 'true');

    await click('Submit');
    expect(mockApi.createSubmission).not.toHaveBeenCalled();
    expect(duration).toHaveAttribute('aria-invalid', 'true');
    expect(level).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById('sf-level-error')).toHaveTextContent('Level is required');
  });

  it('does not require duration or level to save a draft, and sends the chosen values', async () => {
    mockApi.createSubmission.mockResolvedValue(ok(saved));
    renderFull();
    await userEvent.type(screen.getByLabelText(/Talk title/), 'Only title');
    await click('Save draft');
    await waitFor(() => expect(mockApi.createSubmission).toHaveBeenCalledTimes(1));
    expect(mockApi.createSubmission.mock.calls[0][0]).not.toHaveProperty('level');
    expect(mockApi.createSubmission.mock.calls[0][0]).not.toHaveProperty('durationMinutes');
  });

  it('shows a number hint on number questions', () => {
    renderFull();
    const qty = screen.getByLabelText(/Quantity/);
    expect(qty).toHaveAttribute('inputmode', 'decimal');
    expect(document.getElementById('answer-a3-number')).toHaveTextContent('Enter a number');
    expect(qty.getAttribute('aria-describedby')).toContain('answer-a3-number');
  });

  it('renders radios for up to 5 options and a dropdown with a placeholder for more, in CFP order', () => {
    renderFull();
    const radios = within(group(/Pick radio/)).getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(radioOptions);
    expect(screen.queryByRole('combobox', { name: /Pick radio/ })).not.toBeInTheDocument();

    const select = screen.getByRole('combobox', { name: /Pick drop/ });
    expect(screen.queryByRole('group', { name: /Pick drop/ })).not.toBeInTheDocument();
    const labels = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(labels).toEqual(['Select an option', ...dropdownOptions]);
    expect(select).toHaveValue('');
  });

  it('renders one checkbox per option in order and keeps option order when toggling', async () => {
    renderFull();
    const boxes = within(group(/Pick many/)).getAllByRole('checkbox');
    expect(boxes.map((b) => (b as HTMLInputElement).value)).toEqual(multiOptions);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Mu' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Zeta' }));
    expect(screen.getByRole('checkbox', { name: 'Mu' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Zeta' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Mu' }));
    expect(screen.getByRole('checkbox', { name: 'Mu' })).not.toBeChecked();
  });

  it('preselects saved answers when editing an existing submission', () => {
    renderFull({
      ...saved,
      answers: {
        a1: { questionLabel: 'Shorty', questionType: 'short_text', value: 'hi' },
        a3: { questionLabel: 'Quantity', questionType: 'number', value: 7 },
        a4: { questionLabel: 'Agreed', questionType: 'yes_no', value: false },
        a5: { questionLabel: 'Pick radio', questionType: 'single_select', value: 'Three' },
        a6: { questionLabel: 'Pick many', questionType: 'multi_select', value: ['Alpha', 'Mu'] },
        a7: { questionLabel: 'Pick drop', questionType: 'single_select', value: 'Green' },
      },
    });
    expect(screen.getByLabelText(/Shorty/)).toHaveValue('hi');
    expect(screen.getByLabelText(/Quantity/)).toHaveValue(7);
    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Yes' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Three' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'One' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Mu' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Zeta' })).not.toBeChecked();
    expect(screen.getByRole('combobox', { name: /Pick drop/ })).toHaveValue('Green');
  });

  it('clears errors once fixed and submits correctly typed answers', async () => {
    mockApi.createSubmission.mockResolvedValue(ok(saved));
    mockApi.submitMySubmission.mockResolvedValue(ok({ ...saved, status: 'Submitted' }));
    renderFull();
    await fillCore();
    await click('Submit');
    expect(screen.getByLabelText(/Shorty/)).toHaveAttribute('aria-invalid', 'true');

    await userEvent.type(screen.getByLabelText(/Shorty/), '  short  ');
    await userEvent.type(screen.getByLabelText(/Longform/), 'long');
    await userEvent.type(screen.getByLabelText(/Quantity/), '4.5');
    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Four' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mu' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Zeta' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Pick drop/ }), 'Blue');
    await click('Submit');

    await waitFor(() => expect(mockApi.submitMySubmission).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('This question is required')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Shorty/)).not.toHaveAttribute('aria-invalid');
    expect(mockApi.submitMySubmission).toHaveBeenCalledWith('s1', {
      talkTitle: 'T',
      abstract: 'A',
      durationMinutes: 30,
      level: 200,
      answers: {
        a1: 'short',
        a2: 'long',
        a3: 4.5,
        a4: true,
        a5: 'Four',
        a6: ['Zeta', 'Mu'],
        a7: 'Blue',
      },
      updatedAt: saved.updatedAt,
    });
  });
});
