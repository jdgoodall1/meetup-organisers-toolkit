import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MySubmissions from '../speaker/MySubmissions';
import MyBookings from '../speaker/MyBookings';
import type { SpeakerBooking, SpeakerSubmission } from '../../services/apiTypes';

const mockApi = {
  listMySubmissions: jest.fn(),
  listOpenCfps: jest.fn(),
  withdrawMySubmission: jest.fn(),
  listMyBookings: jest.fn(),
};
jest.mock('../../services/api', () => ({
  __esModule: true,
  get default() {
    return mockApi;
  },
}));

const ok = <T,>(data: T) => ({ ok: true, status: 200, data });
const sub = (over: Partial<SpeakerSubmission> = {}): SpeakerSubmission => ({
  submissionId: 's1',
  cfpId: 'c1',
  status: 'Draft',
  talkTitle: 'Engines',
  abstract: '',
  durationMinutes: 30,
  answers: {},
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  ...over,
});

const renderSubs = () =>
  render(
    <MemoryRouter>
      <MySubmissions />
    </MemoryRouter>,
  );

beforeEach(() => {
  jest.resetAllMocks();
  mockApi.listOpenCfps.mockResolvedValue(ok([{ cfpId: 'c1', title: 'Spring CFP' }]));
});

describe('MySubmissions', () => {
  it('shows empty state with link to open CFPs', async () => {
    mockApi.listMySubmissions.mockResolvedValue(ok([]));
    renderSubs();
    expect(await screen.findByRole('link', { name: /open calls for papers/i })).toBeInTheDocument();
  });

  it('lists submissions with CFP title, status and actions only where allowed', async () => {
    mockApi.listMySubmissions.mockResolvedValue(
      ok([sub(), sub({ submissionId: 's2', status: 'Accepted', talkTitle: 'Gears', cfpId: 'old' })]),
    );
    renderSubs();
    expect(await screen.findByText('Spring CFP')).toBeInTheDocument();
    expect(screen.getByText('Closed call for papers')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit Engines' })).toHaveAttribute('href', '/speaker/submissions/s1/edit');
    expect(screen.getByRole('link', { name: 'Edit Engines' })).toHaveClass('btn', 'btn-secondary', 'btn-small');
    expect(screen.queryByRole('link', { name: 'Edit Gears' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Withdraw Gears' })).not.toBeInTheDocument();
  });

  it('withdraws after confirmation and announces it', async () => {
    mockApi.listMySubmissions.mockResolvedValue(ok([sub({ status: 'Under review' })]));
    mockApi.withdrawMySubmission.mockResolvedValue(ok(sub({ status: 'Withdrawn' })));
    renderSubs();
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw Engines' }));
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(await screen.findByText(/has been withdrawn/)).toBeInTheDocument();
    expect(screen.getByText('Withdrawn')).toBeInTheDocument();
    expect(mockApi.withdrawMySubmission).toHaveBeenCalledWith('s1');
  });

  it('tells the speaker to contact organisers when locked', async () => {
    mockApi.listMySubmissions.mockResolvedValue(ok([sub()]));
    mockApi.withdrawMySubmission.mockResolvedValue({
      ok: false,
      kind: 'error',
      status: 409,
      error: { code: 'SUBMISSION_LOCKED', message: 'locked' },
    });
    renderSubs();
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw Engines' }));
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(await screen.findByText(/contact the organisers/)).toBeInTheDocument();
  });
});

describe('MyBookings', () => {
  const booking = (id: string, start: string | null): SpeakerBooking => ({
    bookingId: id,
    eventId: `e${id}`,
    status: 'confirmed',
    event: start
      ? {
          eventId: `e${id}`,
          title: `Event ${id}`,
          startDateTime: start,
          endDateTime: start,
          location: 'Town Hall',
          isOnline: false,
          description: '',
          format: '',
        }
      : null,
  });

  it('orders upcoming first, then past, then unknown', async () => {
    const future = (y: number) => `${y}-01-01T10:00:00Z`;
    mockApi.listMyBookings.mockResolvedValue(ok([booking('past', '2020-01-01T10:00:00Z'), booking('none', null), booking('later', future(2090)), booking('soon', future(2080))]));
    render(<MyBookings />);
    await screen.findByText('Event soon');
    const text = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    const idx = ['Event soon', 'Event later', 'Event past', 'not available'].map((k) => text.findIndex((t) => t.includes(k)));
    expect(idx).toEqual([0, 1, 2, 3]);
  });

  it('renders event details', async () => {
    mockApi.listMyBookings.mockResolvedValue(ok([booking('1', '2030-01-01T10:00:00Z')]));
    render(<MyBookings />);
    expect(await screen.findByRole('heading', { name: 'Event 1' })).toBeInTheDocument();
    expect(screen.getByText(/In person: Town Hall/)).toBeInTheDocument();
  });

  it('shows empty state', async () => {
    mockApi.listMyBookings.mockResolvedValue(ok([]));
    render(<MyBookings />);
    await waitFor(() => expect(screen.getByText(/no confirmed bookings/)).toBeInTheDocument());
  });
});
