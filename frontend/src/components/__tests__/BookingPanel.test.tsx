import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import BookingPanel from '../admin/BookingPanel';
import type { AdminSubmissionListItem, Booking, EventItem } from '../../services/apiTypes';

const mockApi = {
  listBookings: jest.fn(),
  listSpeakers: jest.fn(),
  listCfps: jest.fn(),
  listCfpSubmissions: jest.fn(),
  createBooking: jest.fn(),
  updateBooking: jest.fn(),
  deleteBooking: jest.fn(),
};
jest.mock('../../services/api', () => ({
  __esModule: true,
  get default() {
    return mockApi;
  },
}));

const ok = <T,>(data: T) => ({ ok: true, status: 200, data });

const event: EventItem = {
  eventId: 'e1',
  title: 'Meetup',
  startDateTime: '2025-06-01T18:00:00Z',
  endDateTime: '2025-06-01T20:00:00Z',
  location: '',
  isOnline: false,
  description: '',
  format: '',
  status: 'scheduled' as EventItem['status'],
  createdAt: '2025-01-01T00:00:00Z',
  createdBy: 'u',
  updatedAt: '2025-01-01T00:00:00Z',
  updatedBy: 'u',
} as EventItem;

const booking: Booking = {
  bookingId: 'b1',
  eventId: 'e1',
  speakerId: 's1',
  status: 'proposed',
  speakerNameSnapshot: 'Ada Lovelace',
  createdAt: '2025-01-01T00:00:00Z',
  createdBy: 'u',
  updatedAt: '2025-01-01T00:00:00Z',
  updatedBy: 'u',
} as Booking;

const sub: AdminSubmissionListItem = {
  submissionId: 'sub1',
  cfpId: 'c1',
  speakerId: 's2',
  speakerName: 'Grace Hopper',
  status: 'accepted',
  talkTitle: 'Compilers',
  durationMinutes: 30,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  marker: null,
  markerNote: null,
  averageRating: null,
  ratingCount: 0,
};

const sub2: AdminSubmissionListItem = {
  ...sub,
  submissionId: 'sub2',
  cfpId: 'c2',
  speakerId: 's1',
  speakerName: 'Ada Lovelace',
  talkTitle: 'Engines',
};

const speakers = [
  { speakerId: 's1', name: 'Ada Lovelace', location: '', topics: [], linked: true },
  { speakerId: 's2', name: 'Grace Hopper', location: '', topics: [], linked: true },
  { speakerId: 's3', name: 'Bob Bad', location: '', topics: [], linked: true, marker: 'not_again' },
];

beforeEach(() => {
  jest.resetAllMocks();
  mockApi.listBookings.mockResolvedValue(ok([booking]));
  mockApi.listSpeakers.mockResolvedValue(ok(speakers));
  // CFPs are not tied to events: submissions from every CFP are offered.
  mockApi.listCfps.mockResolvedValue(
    ok([
      { cfpId: 'c1', title: 'Spring CFP' },
      { cfpId: 'c2', title: 'Standing CFP' },
    ]),
  );
  mockApi.listCfpSubmissions.mockImplementation(async (cfpId: string) =>
    ok(cfpId === 'c1' ? [sub] : [sub2]),
  );
});

const renderPanel = async () => {
  render(
    <MemoryRouter>
      <BookingPanel event={event} />
    </MemoryRouter>,
  );
  await screen.findByRole('link', { name: 'Ada Lovelace' });
};

describe('BookingPanel speaker search', () => {
  it('narrows the speaker list as you type and says how many match', async () => {
    await renderPanel();
    const select = screen.getByRole('combobox', { name: 'Speaker' });
    expect(within(select).getAllByRole('option')).toHaveLength(4); // placeholder + 3 speakers

    await userEvent.type(screen.getByLabelText(/Search speakers/), 'gra');
    const options = within(screen.getByRole('listbox', { name: 'Speaker' })).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Select a speaker', 'Grace Hopper']);
    expect(screen.getByText('1 speaker matches. Pick one below.')).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    await renderPanel();
    await userEvent.type(screen.getByLabelText(/Search speakers/), 'zzz');
    expect(screen.getByText('No speakers match "zzz".')).toBeInTheDocument();
  });

  it('keeps the chosen speaker selectable after the search changes', async () => {
    await renderPanel();
    await userEvent.type(screen.getByLabelText(/Search speakers/), 'gra');
    await userEvent.selectOptions(screen.getByRole('listbox', { name: 'Speaker' }), 'Grace Hopper');
    expect(screen.getByRole('listbox', { name: 'Speaker' })).toHaveValue('s2');
  });
});

describe('BookingPanel', () => {
  it('lists bookings with a speaker link and accepted submissions from ALL CFPs, grouped by CFP title', async () => {
    await renderPanel();
    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute('href', '/admin/speakers/s1');
    expect(await screen.findByText(/Compilers by Grace Hopper/)).toBeInTheDocument();
    expect(screen.getByText(/Engines by Ada Lovelace/)).toBeInTheDocument();
    expect(mockApi.listCfpSubmissions).toHaveBeenCalledTimes(2);
    expect(mockApi.listCfpSubmissions).toHaveBeenCalledWith('c1');
    expect(mockApi.listCfpSubmissions).toHaveBeenCalledWith('c2');

    const spring = screen.getByRole('group', { name: 'Accepted submissions from Spring CFP' });
    expect(within(spring).getByRole('heading', { name: 'Spring CFP' })).toBeInTheDocument();
    expect(within(spring).getByText(/Compilers/)).toBeInTheDocument();
    const standing = screen.getByRole('group', { name: 'Accepted submissions from Standing CFP' });
    expect(within(standing).getByText(/Engines/)).toBeInTheDocument();
  });

  it('filters accepted submissions by CFP', async () => {
    await renderPanel();
    await screen.findByText(/Compilers by Grace Hopper/);
    await userEvent.selectOptions(screen.getByLabelText('Filter by CFP'), 'c2');
    expect(screen.queryByText(/Compilers by Grace Hopper/)).toBeNull();
    expect(screen.getByText(/Engines by Ada Lovelace/)).toBeInTheDocument();
  });

  it('books a submission from a CFP regardless of any event link, and marks only this event booked', async () => {
    mockApi.listBookings.mockResolvedValue(ok([{ ...booking, submissionId: 'sub2' }]));
    mockApi.createBooking.mockResolvedValue(ok({ ...booking, bookingId: 'b9', speakerNameSnapshot: 'Grace Hopper' }));
    await renderPanel();
    // sub2 is already booked onto this event; sub1 (other CFP) can still be booked.
    expect(await screen.findByText('Booked')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Book\s+Grace Hopper/ }));
    await waitFor(() =>
      expect(mockApi.createBooking).toHaveBeenCalledWith({ eventId: 'e1', speakerId: 's2', submissionId: 'sub1' }),
    );
  });
  it('adds a booking for the chosen speaker', async () => {
    mockApi.createBooking.mockResolvedValue(ok({ ...booking, bookingId: 'b2', speakerNameSnapshot: 'Grace Hopper' }));
    await renderPanel();
    await userEvent.selectOptions(screen.getByLabelText('Speaker'), 's2');
    await userEvent.click(screen.getByRole('button', { name: 'Add booking' }));
    await waitFor(() =>
      expect(mockApi.createBooking).toHaveBeenCalledWith({ eventId: 'e1', speakerId: 's2' }),
    );
    expect(await screen.findByText('Booked Grace Hopper.')).toBeInTheDocument();
  });

  it('shows a marker badge for a not_again speaker and resubmits with confirmWarnings', async () => {
    mockApi.createBooking
      .mockResolvedValueOnce({
        ok: false,
        kind: 'booking_warnings',
        status: 409,
        message: 'Confirm',
        warnings: [{ code: 'SPEAKER_NOT_AGAIN', message: 'Marked not again' }],
      })
      .mockResolvedValueOnce(ok({ ...booking, bookingId: 'b3', speakerNameSnapshot: 'Bob Bad' }));
    await renderPanel();
    await userEvent.selectOptions(screen.getByLabelText('Speaker'), 's3');
    expect(screen.getAllByText('Not again').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Add booking' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Marked not again/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Book anyway' }));

    await waitFor(() =>
      expect(mockApi.createBooking).toHaveBeenLastCalledWith({
        eventId: 'e1',
        speakerId: 's3',
        confirmWarnings: true,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('books an accepted submission with its submissionId', async () => {
    mockApi.createBooking.mockResolvedValue(ok({ ...booking, bookingId: 'b4', speakerNameSnapshot: 'Grace Hopper' }));
    await renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /Book\s+Grace Hopper/ }));
    await waitFor(() =>
      expect(mockApi.createBooking).toHaveBeenCalledWith({ eventId: 'e1', speakerId: 's2', submissionId: 'sub1' }),
    );
  });

  it('changes booking status', async () => {
    mockApi.updateBooking.mockResolvedValue(ok({ ...booking, status: 'confirmed' }));
    await renderPanel();
    await userEvent.selectOptions(screen.getByLabelText('Status for Ada Lovelace'), 'confirmed');
    await waitFor(() =>
      expect(mockApi.updateBooking).toHaveBeenCalledWith('b1', { status: 'confirmed', updatedAt: booking.updatedAt }),
    );
    expect(await screen.findByText(/changed to confirmed/)).toBeInTheDocument();
  });

  it('removes a booking after confirmation', async () => {
    mockApi.deleteBooking.mockResolvedValue(ok(undefined));
    await renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /Remove/ }));
    expect(mockApi.deleteBooking).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove booking' }));
    await waitFor(() => expect(mockApi.deleteBooking).toHaveBeenCalledWith('b1'));
    expect(await screen.findByText('Removed booking for Ada Lovelace.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ada Lovelace' })).not.toBeInTheDocument();
  });
});

