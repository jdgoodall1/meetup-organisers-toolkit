import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SpeakerDetail from '../admin/SpeakerDetail';
import SpeakerCreatePage from '../admin/SpeakerCreatePage';
import type { SpeakerDetail as Detail } from '../../services/apiTypes';

const mockApi = {
  getSpeaker: jest.fn(),
  createSpeaker: jest.fn(),
  updateSpeaker: jest.fn(),
  setSpeakerMarker: jest.fn(),
  setSpeakerNotes: jest.fn(),
  linkSpeaker: jest.fn(),
  requestSpeakerHeadshotUpload: jest.fn(),
  listEvents: jest.fn(),
};
jest.mock('../../services/api', () => ({
  __esModule: true,
  get default() {
    return mockApi;
  },
}));

const audit = { createdAt: '2025-01-01T00:00:00Z', createdBy: 'a', updatedAt: '2025-01-01T00:00:00Z', updatedBy: 'a' };

const baseDetail = (over: Partial<Detail> = {}): Detail => ({
  speaker: {
    ...audit,
    speakerId: 's1',
    name: 'Ada Lovelace',
    bio: 'Pioneer',
    location: 'London',
    topics: ['math'],
    links: [],
    pastTalks: [],
  },
  admin: null,
  submissions: [
    {
      ...audit,
      submissionId: 'sub1',
      cfpId: 'c1',
      speakerId: 's1',
      status: 'submitted',
      talkTitle: 'Engines',
      abstract: '',
      durationMinutes: 30,
      answers: {},
    },
  ],
  bookings: [
    { ...audit, bookingId: 'b1', eventId: 'e1', speakerId: 's1', status: 'confirmed', speakerNameSnapshot: 'Ada' },
  ],
  ...over,
});

const ok = <T,>(data: T) => ({ ok: true, status: 200, data });

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={['/admin/speakers/s1']}>
      <Routes>
        <Route path="/admin/speakers/:id" element={<SpeakerDetail />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  jest.resetAllMocks();
  mockApi.getSpeaker.mockResolvedValue(ok(baseDetail()));
  mockApi.listEvents.mockResolvedValue(
    ok([{ eventId: 'e1', title: 'June Meetup', startDateTime: '2025-06-12T18:00:00Z', endDateTime: '2025-06-12T20:00:00Z' }]),
  );
});

describe('SpeakerDetail', () => {
  it('shows history with links to submissions', async () => {
    renderDetail();
    expect(await screen.findByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Engines' })).toHaveAttribute('href', '/admin/submissions/sub1');
    // Bookings show the event title, never the raw id.
    expect(await screen.findByRole('link', { name: 'June Meetup' })).toHaveAttribute('href', '/admin/events/e1');
    expect(screen.queryByText(/e1/)).not.toBeInTheDocument();
  });

  it('shows the linked account email instead of an id', async () => {
    mockApi.getSpeaker.mockResolvedValue(
      ok(baseDetail({ speaker: { ...baseDetail().speaker, userId: '8642e2c4-60f1' }, linkedEmail: 'ada@example.com' })),
    );
    renderDetail();
    expect(await screen.findByText('Linked to the account for ada@example.com.')).toBeInTheDocument();
    expect(screen.queryByText(/8642e2c4/)).not.toBeInTheDocument();
  });

  it('sets a marker with a note', async () => {
    mockApi.setSpeakerMarker.mockResolvedValue(
      ok({ ...audit, speakerId: 's1', marker: 'not_again', markerNote: 'late' }),
    );
    renderDetail();
    await userEvent.click(await screen.findByLabelText('Not again'));
    await userEvent.type(screen.getByLabelText('Marker note (private)'), 'late');
    await userEvent.click(screen.getByRole('button', { name: 'Save marker' }));
    expect(mockApi.setSpeakerMarker).toHaveBeenCalledWith('s1', { marker: 'not_again', markerNote: 'late' });
    expect(await screen.findByText('Marker saved.')).toBeInTheDocument();
  });

  it('unsets a marker', async () => {
    mockApi.getSpeaker.mockResolvedValue(
      ok(baseDetail({ admin: { ...audit, speakerId: 's1', marker: 'have_back', markerNote: 'great' } })),
    );
    mockApi.setSpeakerMarker.mockResolvedValue(ok({ ...audit, speakerId: 's1' }));
    renderDetail();
    expect(await screen.findByLabelText('Have back')).toBeChecked();
    await userEvent.click(screen.getByLabelText('None'));
    await userEvent.click(screen.getByRole('button', { name: 'Save marker' }));
    expect(mockApi.setSpeakerMarker).toHaveBeenCalledWith('s1', { marker: 'unset', markerNote: null });
    expect(await screen.findByLabelText('None')).toBeChecked();
  });

  it('saves admin notes', async () => {
    mockApi.setSpeakerNotes.mockResolvedValue(ok({ ...audit, speakerId: 's1', adminNotes: 'Needs AV' }));
    renderDetail();
    await userEvent.type(await screen.findByLabelText(/Admin notes \(admin only/), 'Needs AV');
    await userEvent.click(screen.getByRole('button', { name: 'Save notes' }));
    expect(mockApi.setSpeakerNotes).toHaveBeenCalledWith('s1', 'Needs AV');
    expect(await screen.findByText('Notes saved.')).toBeInTheDocument();
  });

  it('shows a conflict message when linking fails', async () => {
    mockApi.linkSpeaker.mockResolvedValue({
      ok: false,
      kind: 'error',
      status: 409,
      error: { code: 'CONFLICT', message: 'That account already has a speaker profile' },
    });
    renderDetail();
    await userEvent.type(await screen.findByLabelText('Account email address'), 'sam@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Link to account' }));
    expect(mockApi.linkSpeaker).toHaveBeenCalledWith('s1', 'sam@example.com');
    expect(await screen.findByRole('alert')).toHaveTextContent('That account already has a speaker profile');
  });

  it('shows API field errors when saving the profile', async () => {
    mockApi.updateSpeaker.mockResolvedValue({
      ok: false,
      kind: 'error',
      status: 400,
      error: { code: 'VALIDATION', message: 'Invalid', fields: { location: 'Location too long' } },
    });
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Location too long')).toBeInTheDocument();
  });
});

describe('SpeakerDetail headshot', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  it('rejects a bad type or oversized file without calling the API', async () => {
    renderDetail();
    const input = await screen.findByLabelText(/upload headshot/i);
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] } });
    expect(await screen.findByText('Headshot must be a JPEG, PNG or WebP image')).toBeInTheDocument();
    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText('Headshot must be 5 MB or smaller')).toBeInTheDocument();
    expect(mockApi.requestSpeakerHeadshotUpload).not.toHaveBeenCalled();
  });

  it('uploads to S3 and saves the new key with the profile', async () => {
    mockApi.requestSpeakerHeadshotUpload.mockResolvedValue(
      ok({ url: 'https://s3.example/up', fields: { key: 'headshots/s1/k' }, key: 'headshots/s1/k', expiresInSeconds: 900 }),
    );
    fetchMock.mockResolvedValue({ ok: true });
    mockApi.updateSpeaker.mockResolvedValue(ok({ ...baseDetail().speaker, headshotKey: 'headshots/s1/k' }));
    renderDetail();
    const input = await screen.findByLabelText(/upload headshot/i);
    await userEvent.upload(input, new File(['img'], 'me.png', { type: 'image/png' }));

    expect(mockApi.requestSpeakerHeadshotUpload).toHaveBeenCalledWith('s1', { contentType: 'image/png', size: 3 });
    expect(fetchMock).toHaveBeenCalledWith('https://s3.example/up', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByText(/Headshot uploaded/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(mockApi.updateSpeaker).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ headshotKey: 'headshots/s1/k' }),
    );
  });

  it('shows an error and keeps the old headshot when the S3 upload fails', async () => {
    mockApi.requestSpeakerHeadshotUpload.mockResolvedValue(
      ok({ url: 'https://s3.example/up', fields: {}, key: 'headshots/s1/k', expiresInSeconds: 900 }),
    );
    fetchMock.mockResolvedValue({ ok: false });
    mockApi.updateSpeaker.mockResolvedValue(ok(baseDetail().speaker));
    renderDetail();
    await userEvent.upload(await screen.findByLabelText(/upload headshot/i), new File(['i'], 'me.png', { type: 'image/png' }));
    expect(await screen.findByText('Headshot upload failed. Please try again.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(mockApi.updateSpeaker.mock.calls[0][1]).not.toHaveProperty('headshotKey');
  });

  it('removes an existing headshot by saving headshotKey null', async () => {
    const withShot = baseDetail();
    withShot.speaker = { ...withShot.speaker, headshotKey: 'headshots/s1/old', headshotUrl: 'https://signed/old' };
    mockApi.getSpeaker.mockResolvedValue(ok(withShot));
    mockApi.updateSpeaker.mockResolvedValue(ok(baseDetail().speaker));
    renderDetail();
    expect(await screen.findByAltText('Ada Lovelace headshot')).toHaveAttribute('src', 'https://signed/old');
    await userEvent.click(screen.getByRole('button', { name: 'Remove headshot' }));
    expect(screen.queryByAltText('Ada Lovelace headshot')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(mockApi.updateSpeaker).toHaveBeenCalledWith('s1', expect.objectContaining({ headshotKey: null }));
  });
});

describe('SpeakerCreatePage', () => {
  const renderCreate = () =>
    render(
      <MemoryRouter initialEntries={['/admin/speakers/new']}>
        <Routes>
          <Route path="/admin/speakers/new" element={<SpeakerCreatePage />} />
          <Route path="/admin/speakers/:id" element={<p>Detail page</p>} />
        </Routes>
      </MemoryRouter>,
    );

  it('requires a name', async () => {
    renderCreate();
    await userEvent.click(screen.getByRole('button', { name: 'Create speaker' }));
    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(mockApi.createSpeaker).not.toHaveBeenCalled();
  });

  it('creates a speaker and navigates to the detail page', async () => {
    mockApi.createSpeaker.mockResolvedValue(ok({ ...baseDetail().speaker, speakerId: 'new1' }));
    renderCreate();
    await userEvent.type(screen.getByLabelText('Name (required)'), 'Grace Hopper');
    await userEvent.type(screen.getByLabelText('Topics (comma separated)'), 'compilers, cobol');
    await userEvent.click(screen.getByRole('button', { name: 'Create speaker' }));
    expect(mockApi.createSpeaker).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Grace Hopper', topics: ['compilers', 'cobol'], links: [], pastTalks: [] }),
    );
    expect(await screen.findByText('Detail page')).toBeInTheDocument();
  });
});
