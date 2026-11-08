import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminBookings from '../admin/AdminBookings';

const mockApi = { listBookings: jest.fn(), listEvents: jest.fn() };
jest.mock('../../services/api', () => ({
  __esModule: true,
  get default() {
    return mockApi;
  },
}));

const ok = <T,>(data: T) => ({ ok: true, status: 200, data });

const events = [
  { eventId: 'e2', title: 'August Meetup', startDateTime: '2025-08-14T18:00:00Z', endDateTime: '2025-08-14T20:00:00Z' },
  { eventId: 'e1', title: 'June Meetup', startDateTime: '2025-06-12T18:00:00Z', endDateTime: '2025-06-12T20:00:00Z' },
];

const bookings = [
  { bookingId: 'b1', eventId: 'e2', speakerId: 's1', status: 'confirmed', speakerNameSnapshot: 'Ada Lovelace' },
  { bookingId: 'b2', eventId: 'e1', speakerId: 's2', status: 'proposed', speakerNameSnapshot: 'Grace Hopper' },
  { bookingId: 'b3', eventId: 'gone', speakerId: 's3', status: 'declined', speakerNameSnapshot: 'Bob Bad' },
];

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminBookings />
    </MemoryRouter>,
  );

beforeEach(() => {
  jest.resetAllMocks();
  mockApi.listBookings.mockResolvedValue(ok(bookings));
  mockApi.listEvents.mockResolvedValue(ok(events));
});

describe('AdminBookings', () => {
  it('lists every booking with event titles, soonest event first, never raw ids', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'Bookings' });
    expect(mockApi.listBookings).toHaveBeenCalledWith({});
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('rowheader')[0].textContent)).toEqual([
      'June Meetup',
      'August Meetup',
      'Event no longer exists',
    ]);
    expect(within(table).getByRole('link', { name: 'June Meetup' })).toHaveAttribute('href', '/admin/events/e1');
    expect(within(table).getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute('href', '/admin/speakers/s1');
    expect(table.textContent).not.toMatch(/\be1\b|\bgone\b/);
  });

  it('filters by status and by event', async () => {
    renderPage();
    await screen.findByRole('table', { name: 'Bookings' });

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'confirmed');
    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Status'), '');
    await userEvent.selectOptions(screen.getByLabelText('Event'), 'e1');
    expect(screen.getByRole('link', { name: 'Grace Hopper' })).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'declined');
    expect(screen.getByText('No bookings match these filters.')).toBeInTheDocument();
  });

  it('shows an empty state and errors', async () => {
    mockApi.listBookings.mockResolvedValue(ok([]));
    renderPage();
    expect(await screen.findByText('No bookings yet.')).toBeInTheDocument();
  });

  it('shows a load error', async () => {
    mockApi.listBookings.mockResolvedValue({
      ok: false,
      kind: 'error',
      status: 500,
      error: { code: 'X', message: 'Boom' },
    });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
  });
});
