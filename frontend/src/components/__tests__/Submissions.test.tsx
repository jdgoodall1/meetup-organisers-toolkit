import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SubmissionList from '../admin/SubmissionList';
import SubmissionReview from '../admin/SubmissionReview';
import type { AdminSubmissionDetail, AdminSubmissionListItem } from '../../services/apiTypes';

const mockApi = {
  getCfp: jest.fn(),
  listEvents: jest.fn(),
  listCfpSubmissions: jest.fn(),
  getSubmission: jest.fn(),
  setSubmissionStatus: jest.fn(),
  reviewSubmission: jest.fn(),
  createBooking: jest.fn(),
};
jest.mock('../../services/api', () => ({
  __esModule: true,
  get default() {
    return mockApi;
  },
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userId: 'admin1', email: 'me@example.com' } }),
}));

const ok = <T,>(data: T) => ({ ok: true, status: 200, data });

const item = (over: Partial<AdminSubmissionListItem> = {}): AdminSubmissionListItem => ({
  submissionId: 'sub1',
  cfpId: 'c1',
  speakerId: 's1',
  speakerName: 'Ada Lovelace',
  status: 'submitted',
  talkTitle: 'Engines',
  durationMinutes: 30,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  marker: null,
  markerNote: null,
  averageRating: null,
  ratingCount: 0,
  ...over,
});

const detail = (over: Partial<AdminSubmissionDetail> = {}): AdminSubmissionDetail => ({
  submissionId: 'sub1',
  cfpId: 'c1',
  speakerId: 's1',
  status: 'submitted',
  talkTitle: 'Engines',
  abstract: 'All about engines',
  durationMinutes: 30,
  answers: { q1: { questionLabel: 'Why you?', questionType: 'short_text', value: 'Because maths' } },
  createdAt: '2025-01-01T00:00:00Z',
  createdBy: 'u',
  updatedAt: '2025-01-02T00:00:00Z',
  updatedBy: 'u',
  speaker: {
    speakerId: 's1',
    name: 'Ada Lovelace',
    bio: 'Pioneer',
    location: 'London',
    topics: ['math'],
    links: [],
    pastTalks: [],
  },
  marker: null,
  markerNote: null,
  averageRating: null,
  ratingCount: 0,
  reviews: [],
  ...over,
});

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const ev = (eventId: string, title: string, days: number, status = 'scheduled') => ({
  eventId,
  title,
  startDateTime: future(days),
  endDateTime: future(days),
  status,
});
const events = [
  ev('e-past', 'Old meetup', -30, 'completed'),
  ev('e-cancelled', 'Cancelled meetup', 10, 'cancelled'),
  ev('e2', 'July meetup', 20),
  ev('e1', 'June meetup', 10),
];

const renderList = () =>
  render(
    <MemoryRouter initialEntries={['/admin/cfps/c1/submissions']}>
      <Routes>
        <Route path="/admin/cfps/:id/submissions" element={<SubmissionList />} />
      </Routes>
    </MemoryRouter>,
  );

const renderReview = () =>
  render(
    <MemoryRouter initialEntries={['/admin/submissions/sub1']}>
      <Routes>
        <Route path="/admin/submissions/:id" element={<SubmissionReview />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  jest.resetAllMocks();
  mockApi.getCfp.mockResolvedValue(ok({ cfpId: 'c1', title: 'Spring CFP' }));
  mockApi.listEvents.mockResolvedValue(ok(events));
  mockApi.listCfpSubmissions.mockResolvedValue(ok([item()]));
  mockApi.getSubmission.mockResolvedValue(ok(detail()));
});

describe('SubmissionList', () => {
  it('shows rows with a text label for the not_again marker and rating', async () => {
    mockApi.listCfpSubmissions.mockResolvedValue(
      ok([item({ marker: 'not_again', averageRating: 4.5, ratingCount: 2 })]),
    );
    renderList();
    expect(await screen.findByText('Engines')).toBeInTheDocument();
    expect(screen.getByText('Not again')).toBeInTheDocument();
    expect(screen.getByText('4.5 (2 ratings)')).toBeInTheDocument();
  });

  it('requests the server with the chosen status filter', async () => {
    renderList();
    await screen.findByText('Engines');
    expect(mockApi.listCfpSubmissions).toHaveBeenLastCalledWith('c1', undefined);
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'accepted');
    await waitFor(() => expect(mockApi.listCfpSubmissions).toHaveBeenLastCalledWith('c1', 'accepted'));
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'all');
    await waitFor(() => expect(mockApi.listCfpSubmissions).toHaveBeenLastCalledWith('c1', 'all'));
  });
});

describe('SubmissionReview', () => {
  it('shows answers with stored labels, speaker link and marker with note', async () => {
    mockApi.getSubmission.mockResolvedValue(ok(detail({ marker: 'not_again', markerNote: 'No-show last time' })));
    renderReview();
    expect(await screen.findByText('Why you?')).toBeInTheDocument();
    expect(screen.getByText('Because maths')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute('href', '/admin/speakers/s1');
    expect(screen.getByText('Not again')).toBeInTheDocument();
    expect(screen.getByText(/No-show last time/)).toBeInTheDocument();
  });

  it('saves the review, prefilling own rating and showing field errors', async () => {
    mockApi.getSubmission.mockResolvedValue(
      ok(
        detail({
          averageRating: 3,
          ratingCount: 1,
          reviews: [{ adminUserId: 'admin1', rating: 3, notes: 'ok talk', updatedAt: 'x' }],
        }),
      ),
    );
    renderReview();
    expect(await screen.findByLabelText('Your rating (1 to 5)')).toHaveValue('3');
    expect(screen.getByLabelText('Your private notes')).toHaveValue('ok talk');

    mockApi.reviewSubmission.mockResolvedValueOnce({
      ok: false,
      kind: 'error',
      status: 400,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid', fields: { notes: 'Notes too long' } },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save review' }));
    expect(await screen.findByText('Notes too long')).toBeInTheDocument();
    expect(screen.getByLabelText('Your private notes')).toHaveAttribute('aria-invalid', 'true');

    mockApi.reviewSubmission.mockResolvedValueOnce(
      ok(
        detail({
          averageRating: 4.5,
          ratingCount: 2,
          reviews: [{ adminUserId: 'admin1', rating: 5, notes: 'great', updatedAt: 'y' }],
        }),
      ),
    );
    await userEvent.selectOptions(screen.getByLabelText('Your rating (1 to 5)'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Save review' }));
    expect(await screen.findByText('Review saved.')).toBeInTheDocument();
    expect(mockApi.reviewSubmission).toHaveBeenLastCalledWith('sub1', { rating: 5, notes: 'ok talk' });
    expect(screen.getByText('Average rating: 4.5 from 2 reviews')).toBeInTheDocument();
  });

  it('changes status using updatedAt and does not offer a booking for non-accepted statuses', async () => {
    mockApi.setSubmissionStatus.mockResolvedValue(ok(detail({ status: 'shortlisted', updatedAt: '2025-01-03T00:00:00Z' })));
    renderReview();
    await userEvent.selectOptions(await screen.findByLabelText('Status', { selector: 'select' }), 'shortlisted');
    await userEvent.click(screen.getByRole('button', { name: 'Change status' }));
    expect(await screen.findByText('Status changed to shortlisted.')).toBeInTheDocument();
    expect(mockApi.setSubmissionStatus).toHaveBeenCalledWith('sub1', 'shortlisted', '2025-01-02T00:00:00Z');
    expect(screen.queryByText('Book this speaker onto an event?')).not.toBeInTheDocument();
    expect(mockApi.listEvents).not.toHaveBeenCalled();
  });

  it('offers an event picker on accept (upcoming, non-cancelled events only) and resubmits with confirmWarnings after warnings', async () => {
    mockApi.setSubmissionStatus.mockResolvedValue(ok(detail({ status: 'accepted' })));
    mockApi.createBooking
      .mockResolvedValueOnce({
        ok: false,
        kind: 'booking_warnings',
        status: 409,
        message: 'Warnings',
        warnings: [{ code: 'SPEAKER_NOT_AGAIN', message: 'Speaker is marked not again' }],
      })
      .mockResolvedValueOnce(ok({ bookingId: 'b1' }));
    renderReview();
    await userEvent.selectOptions(await screen.findByLabelText('Status', { selector: 'select' }), 'accepted');
    await userEvent.click(screen.getByRole('button', { name: 'Change status' }));

    expect(await screen.findByRole('heading', { name: 'Book this speaker onto an event?' })).toBeInTheDocument();
    const picker = screen.getByLabelText('Event');
    const labels = within(picker).getAllByRole('option').map((o) => o.textContent ?? '');
    expect(labels).toHaveLength(3); // placeholder + 2 upcoming events
    expect(labels.join('|')).not.toMatch(/Old meetup|Cancelled meetup/);
    // soonest first
    expect(labels[1]).toMatch(/^June meetup/);
    expect(labels[2]).toMatch(/^July meetup/);

    await userEvent.selectOptions(picker, 'e1');
    await userEvent.click(screen.getByRole('button', { name: 'Create booking' }));
    expect(mockApi.createBooking).toHaveBeenLastCalledWith({
      eventId: 'e1',
      speakerId: 's1',
      submissionId: 'sub1',
    });
    expect(await screen.findByText('Speaker is marked not again')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Confirm and create booking' }));
    expect(await screen.findByText('Booking created.')).toBeInTheDocument();
    expect(mockApi.createBooking).toHaveBeenLastCalledWith({
      eventId: 'e1',
      speakerId: 's1',
      submissionId: 'sub1',
      confirmWarnings: true,
    });
  });

  it('asks for an event before booking and never needs the CFP to have an event', async () => {
    mockApi.setSubmissionStatus.mockResolvedValue(ok(detail({ status: 'accepted' })));
    renderReview();
    await userEvent.selectOptions(await screen.findByLabelText('Status', { selector: 'select' }), 'accepted');
    await userEvent.click(screen.getByRole('button', { name: 'Change status' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Create booking' }));
    expect(await screen.findByText('Choose an event to book.')).toBeInTheDocument();
    expect(mockApi.createBooking).not.toHaveBeenCalled();
    expect(mockApi.getCfp).not.toHaveBeenCalled();
  });

  it('clears warnings when a different event is chosen', async () => {
    mockApi.setSubmissionStatus.mockResolvedValue(ok(detail({ status: 'accepted' })));
    mockApi.createBooking.mockResolvedValueOnce({
      ok: false,
      kind: 'booking_warnings',
      status: 409,
      message: 'Warnings',
      warnings: [{ code: 'OVERLAPPING_EVENT', message: 'Overlaps another booking' }],
    });
    renderReview();
    await userEvent.selectOptions(await screen.findByLabelText('Status', { selector: 'select' }), 'accepted');
    await userEvent.click(screen.getByRole('button', { name: 'Change status' }));
    await userEvent.selectOptions(await screen.findByLabelText('Event'), 'e1');
    await userEvent.click(screen.getByRole('button', { name: 'Create booking' }));
    expect(await screen.findByText('Overlaps another booking')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Event'), 'e2');
    expect(screen.queryByText('Overlaps another booking')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create booking' })).toBeInTheDocument();
  });
});
