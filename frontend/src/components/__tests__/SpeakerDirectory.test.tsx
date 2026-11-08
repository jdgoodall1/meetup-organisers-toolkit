import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SpeakerDirectory from '../admin/SpeakerDirectory';
import type { SpeakerSummary } from '../../services/apiTypes';

const mockApi = { listSpeakers: jest.fn() };
jest.mock('../../services/api', () => ({
  __esModule: true,
  get default() {
    return mockApi;
  },
}));

const speakers: SpeakerSummary[] = [
  { speakerId: 's1', name: 'Ada Lovelace', location: 'London', topics: ['math', 'ai'], linked: true, marker: 'have_back' },
  { speakerId: 's2', name: 'Bob Byte', location: 'Leeds', topics: ['ops'], linked: false, marker: 'not_again' },
  { speakerId: 's3', name: 'Cy Plain', location: 'York', topics: [], linked: false },
];

const renderPage = () =>
  render(
    <MemoryRouter>
      <SpeakerDirectory />
    </MemoryRouter>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.listSpeakers.mockResolvedValue({ ok: true, status: 200, data: speakers });
});

describe('SpeakerDirectory', () => {
  it('lists speakers with text marker badges and linked state', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'Speakers' });
    expect(screen.getByRole('link', { name: 'New speaker' })).toHaveClass('btn', 'btn-primary');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByText('Have back')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Linked')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Not again')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Unlinked')).toBeInTheDocument();
    expect(within(rows[3]).getByText('None')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute('href', '/admin/speakers/s1');
  });

  it('submits search and filters to the API', async () => {
    renderPage();
    await screen.findByRole('table');
    await userEvent.type(screen.getByLabelText('Search'), 'ada');
    await userEvent.type(screen.getByLabelText('Topic'), 'ai');
    await userEvent.type(screen.getByLabelText('Location'), 'London');
    await userEvent.selectOptions(screen.getByLabelText('Marker'), 'none');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() =>
      expect(mockApi.listSpeakers).toHaveBeenLastCalledWith({
        q: 'ada',
        topic: 'ai',
        location: 'London',
        marker: 'none',
      }),
    );
  });

  it('clears filters', async () => {
    renderPage();
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Marker'), 'not_again');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(mockApi.listSpeakers).toHaveBeenLastCalledWith({ marker: 'not_again' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(mockApi.listSpeakers).toHaveBeenLastCalledWith({}));
    expect(screen.getByLabelText('Marker')).toHaveValue('');
  });

  it('shows empty and error states', async () => {
    mockApi.listSpeakers.mockResolvedValueOnce({ ok: true, status: 200, data: [] });
    const { unmount } = renderPage();
    expect(await screen.findByText('No speakers match these filters.')).toBeInTheDocument();
    unmount();

    mockApi.listSpeakers.mockResolvedValueOnce({
      ok: false,
      kind: 'error',
      status: 500,
      error: { code: 'X', message: 'Boom' },
    });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
  });
});
