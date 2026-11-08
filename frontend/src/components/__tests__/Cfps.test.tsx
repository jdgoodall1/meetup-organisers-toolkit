import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CfpEditPage from '../admin/CfpEditPage';
import CfpForm from '../admin/CfpForm';
import CfpList from '../admin/CfpList';
import type { AdminCfp } from '../../services/apiTypes';

const mockApi = {
  listCfps: jest.fn(),
  listEvents: jest.fn(),
  getCfp: jest.fn(),
  createCfp: jest.fn(),
  updateCfp: jest.fn(),
  deleteCfp: jest.fn(),
  duplicateCfp: jest.fn(),
  listTemplates: jest.fn(),
  replaceCfpQuestions: jest.fn(),
};
jest.mock('../../services/api', () => ({
  __esModule: true,
  get default() {
    return mockApi;
  },
}));

const makeCfp = (over: Partial<AdminCfp> = {}): AdminCfp => ({
  cfpId: 'c1',
  title: 'Autumn CFP',
  description: 'Talks wanted',
  opensAt: new Date(2025, 0, 1, 9, 0).toISOString(),
  closesAt: new Date(2025, 1, 1, 9, 0).toISOString(),
  status: 'open',
  effectiveStatus: 'closed',
  questions: [],
  createdAt: '',
  createdBy: '',
  updatedAt: 'u1',
  updatedBy: '',
  ...over,
});

const okResult = <T,>(data: T) => ({ ok: true, status: 200, data });

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.listTemplates.mockResolvedValue(okResult([]));
});

describe('CfpForm', () => {
  it('requires only a title; closing before opening is rejected without calling the API', async () => {
    const onSubmit = jest.fn();
    render(<CfpForm onSubmit={onSubmit} onSaved={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create CFP' }));
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(screen.queryByText(/date is required/)).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/Title/), 'CFP');
    await userEvent.type(screen.getByLabelText(/Opens/), '2025-03-01T09:00');
    await userEvent.type(screen.getByLabelText(/Closes/), '2025-02-01T09:00');
    await userEvent.click(screen.getByRole('button', { name: 'Create CFP' }));
    expect(screen.getByText('Closing date must be after the opening date')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a standing CFP with no dates, explains the blank close date, and has no event selector', async () => {
    const onSubmit = jest.fn().mockResolvedValue(okResult(makeCfp()));
    render(<CfpForm onSubmit={onSubmit} onSaved={jest.fn()} />);
    expect(screen.getByText('Leave blank for a standing CFP that stays open until you close it')).toBeInTheDocument();
    expect(screen.getByLabelText(/Closes/)).toHaveAccessibleDescription(/standing CFP/);
    expect(screen.queryByLabelText('Linked event')).toBeNull();

    await userEvent.type(screen.getByLabelText(/Title/), 'Standing');
    await userEvent.click(screen.getByRole('button', { name: 'Create CFP' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const input = onSubmit.mock.calls[0][0];
    expect(input).toMatchObject({ title: 'Standing', status: 'draft', closesAt: null, opensAt: null });
    expect(input).not.toHaveProperty('eventId');
  });

  it('sends closesAt null when the close date of a saved CFP is cleared', async () => {
    const onSubmit = jest.fn().mockResolvedValue(okResult(makeCfp()));
    render(<CfpForm cfp={makeCfp()} onSubmit={onSubmit} onSaved={jest.fn()} />);
    await userEvent.clear(screen.getByLabelText(/Closes/));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ closesAt: null, updatedAt: 'u1' });
  });

  it('shows API field errors', async () => {
    const onSubmit = jest.fn().mockResolvedValue({
      ok: false,
      kind: 'error',
      status: 400,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid', fields: { closesAt: 'Close date must be after open date' } },
    });
    render(<CfpForm onSubmit={onSubmit} onSaved={jest.fn()} />);
    await userEvent.type(screen.getByLabelText(/Title/), 'CFP');
    await userEvent.click(screen.getByRole('button', { name: 'Create CFP' }));
    expect(await screen.findByText('Close date must be after open date')).toBeInTheDocument();
    expect(screen.getByLabelText(/Closes/)).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('CfpList', () => {
  const renderList = () =>
    render(
      <MemoryRouter initialEntries={['/admin/cfps']}>
        <Routes>
          <Route path="/admin/cfps" element={<CfpList />} />
          <Route path="/admin/cfps/:id" element={<p>detail page</p>} />
        </Routes>
      </MemoryRouter>,
    );

  it('shows stored and effective status in text, with no event column (legacy eventId ignored)', async () => {
    mockApi.listCfps.mockResolvedValue(okResult([{ ...makeCfp(), eventId: 'e-legacy' }]));
    renderList();
    expect(await screen.findByRole('link', { name: 'Autumn CFP' })).toBeInTheDocument();
    expect(screen.getByText('Stored: open. Currently closed by date.')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Event' })).toBeNull();
    expect(screen.queryByText('Not linked')).toBeNull();
    expect(mockApi.listEvents).not.toHaveBeenCalled();
  });

  it('lists a standing CFP (no closesAt) as open with no invalid date, and can close it', async () => {
    mockApi.listCfps.mockResolvedValue(
      okResult([makeCfp({ closesAt: undefined, opensAt: undefined, effectiveStatus: 'open' })]),
    );
    mockApi.updateCfp.mockResolvedValue(okResult(makeCfp({ status: 'closed', closesAt: undefined })));
    renderList();
    expect(await screen.findByText('Stored: open. No close date, so it stays open until closed.')).toBeInTheDocument();
    expect(screen.getByText('No close date (standing)')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Close/ }));
    expect(mockApi.updateCfp).toHaveBeenCalledWith('c1', { status: 'closed', updatedAt: 'u1' });
  });

  it('styles New CFP and Submissions links as buttons', async () => {
    mockApi.listCfps.mockResolvedValue(okResult([makeCfp()]));
    renderList();
    expect(await screen.findByRole('link', { name: 'New CFP' })).toHaveClass('btn', 'btn-primary');
    expect(screen.getByRole('link', { name: /Submissions/ })).toHaveClass('btn', 'btn-secondary', 'btn-small');
  });

  it('closes an open CFP', async () => {
    mockApi.listCfps.mockResolvedValue(okResult([makeCfp({ effectiveStatus: 'open' })]));
    mockApi.updateCfp.mockResolvedValue(okResult(makeCfp({ status: 'closed' })));
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: /^Close/ }));
    expect(mockApi.updateCfp).toHaveBeenCalledWith('c1', { status: 'closed', updatedAt: 'u1' });
  });

  it('reopens a closed CFP, including a standing one', async () => {
    mockApi.listCfps.mockResolvedValue(okResult([makeCfp({ status: 'closed', closesAt: undefined })]));
    mockApi.updateCfp.mockResolvedValue(okResult(makeCfp()));
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: /^Reopen/ }));
    expect(mockApi.updateCfp).toHaveBeenCalledWith('c1', { status: 'open', updatedAt: 'u1' });
  });

  it('duplicates and navigates to the copy', async () => {
    mockApi.listCfps.mockResolvedValue(okResult([makeCfp()]));
    mockApi.duplicateCfp.mockResolvedValue(okResult(makeCfp({ cfpId: 'c2', status: 'draft' })));
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: /^Duplicate/ }));
    expect(mockApi.duplicateCfp).toHaveBeenCalledWith('c1');
    expect(await screen.findByText('detail page')).toBeInTheDocument();
  });

  it('confirms before deleting a CFP with submissions', async () => {
    mockApi.listCfps.mockResolvedValue(okResult([makeCfp()]));
    mockApi.deleteCfp
      .mockResolvedValueOnce({ ok: false, kind: 'confirm_required', status: 409, message: 'Has 3 submissions', warnings: [] })
      .mockResolvedValueOnce({ ok: true, status: 204, data: undefined });
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: /^Delete/ }));
    expect(mockApi.deleteCfp).toHaveBeenCalledWith('c1', false);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Has 3 submissions');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete CFP' }));
    await waitFor(() => expect(mockApi.deleteCfp).toHaveBeenCalledWith('c1', true));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});

describe('CfpEditPage', () => {
  it('loads a CFP, links to submissions and saves changes (no event selector)', async () => {
    mockApi.getCfp.mockResolvedValue(okResult({ ...makeCfp(), eventId: 'e-legacy' }));
    mockApi.updateCfp.mockResolvedValue(okResult(makeCfp({ title: 'Renamed' })));
    render(
      <MemoryRouter initialEntries={['/admin/cfps/c1']}>
        <Routes>
          <Route path="/admin/cfps/:id" element={<CfpEditPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const title = await screen.findByLabelText(/Title/);
    expect(screen.getByRole('link', { name: 'View submissions' })).toHaveAttribute('href', '/admin/cfps/c1/submissions');
    expect(screen.queryByLabelText('Linked event')).toBeNull();
    expect(mockApi.listEvents).not.toHaveBeenCalled();

    await userEvent.clear(title);
    await userEvent.type(title, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(mockApi.updateCfp).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'Renamed', updatedAt: 'u1' })),
    );
    expect(mockApi.updateCfp.mock.calls[0][1]).not.toHaveProperty('eventId');
    expect(await screen.findByText('CFP saved.')).toBeInTheDocument();
  });

  it('shows the standing-CFP status line for a CFP with no close date', async () => {
    mockApi.getCfp.mockResolvedValue(okResult(makeCfp({ closesAt: undefined, effectiveStatus: 'open' })));
    render(
      <MemoryRouter initialEntries={['/admin/cfps/c1']}>
        <Routes>
          <Route path="/admin/cfps/:id" element={<CfpEditPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Stored: open. No close date, so it stays open until closed.')).toBeInTheDocument();
  });
});
