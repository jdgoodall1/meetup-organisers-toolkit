import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EventCalendar from '../admin/EventCalendar';
import EventForm from '../admin/EventForm';
import EventsPage from '../admin/EventsPage';
import type { EventItem } from '../../services/apiTypes';

const mockApi = {
  listEvents: jest.fn(),
  deleteEvent: jest.fn(),
  getEvent: jest.fn(),
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
};
jest.mock('../../services/api', () => ({
  __esModule: true,
  get default() {
    return mockApi;
  },
}));

const makeEvent = (over: Partial<EventItem> = {}): EventItem => ({
  eventId: 'e1',
  title: 'June Meetup',
  startDateTime: new Date(2025, 5, 12, 18, 0).toISOString(),
  endDateTime: new Date(2025, 5, 12, 20, 0).toISOString(),
  location: 'Hall',
  isOnline: false,
  description: '',
  format: 'Talks',
  status: 'scheduled',
  createdAt: '',
  createdBy: '',
  updatedAt: 'u1',
  updatedBy: '',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EventCalendar', () => {
  const june = new Date(2025, 5, 1);

  it('renders a labelled grid with events on their day', () => {
    render(<EventCalendar events={[makeEvent()]} month={june} onMonthChange={jest.fn()} onSelectEvent={jest.fn()} />);
    expect(screen.getByRole('grid', { name: /june 2025/i })).toBeInTheDocument();
    const cell = screen.getByRole('gridcell', { name: /12 June 2025|June 12, 2025/ });
    expect(within(cell).getByRole('button', { name: /June Meetup/ })).toBeInTheDocument();
  });

  it('selects an event via its button', async () => {
    const onSelect = jest.fn();
    render(<EventCalendar events={[makeEvent()]} month={june} onMonthChange={jest.fn()} onSelectEvent={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /June Meetup/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'e1' }));
  });

  it('moves focus with arrow keys and changes month at the boundary', async () => {
    const onMonthChange = jest.fn();
    render(<EventCalendar events={[]} month={june} onMonthChange={onMonthChange} onSelectEvent={jest.fn()} />);
    const first = document.querySelector<HTMLElement>('[data-date="2025-06-01"]')!;
    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toHaveAttribute('data-date', '2025-06-02');
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(onMonthChange).toHaveBeenCalledWith(new Date(2025, 4, 1));
  });

  it('pages months with the buttons', async () => {
    const onMonthChange = jest.fn();
    render(<EventCalendar events={[]} month={june} onMonthChange={onMonthChange} onSelectEvent={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onMonthChange).toHaveBeenCalledWith(new Date(2025, 6, 1));
  });
});

describe('EventForm', () => {
  it('rejects a missing title and date without calling the API', async () => {
    const onSubmit = jest.fn();
    render(<EventForm onSubmit={onSubmit} onSaved={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(screen.getByText('Date is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects an end time before the start time', async () => {
    const onSubmit = jest.fn();
    render(<EventForm onSubmit={onSubmit} onSaved={jest.fn()} />);
    await userEvent.type(screen.getByLabelText(/Title/), 'Talk night');
    await userEvent.type(screen.getByLabelText(/Date/), '2025-06-12');
    await userEvent.type(screen.getByLabelText('Start time'), '19:00');
    await userEvent.type(screen.getByLabelText('End time'), '18:00');
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));
    expect(screen.getByText('End time must not be before start time')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid input and shows API field errors', async () => {
    const onSubmit = jest
      .fn()
      .mockResolvedValue({
        ok: false,
        kind: 'error',
        status: 400,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid', fields: { title: 'Title is taken' } },
      });
    const onSaved = jest.fn();
    render(<EventForm onSubmit={onSubmit} onSaved={onSaved} />);
    await userEvent.type(screen.getByLabelText(/Title/), 'Talk night');
    await userEvent.type(screen.getByLabelText(/Date/), '2025-06-12');
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));
    await waitFor(() => expect(screen.getByText('Title is taken')).toBeInTheDocument());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Talk night', status: 'draft' }));
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('EventsPage', () => {
  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={['/admin/events']}>
        <Routes>
          <Route path="/admin/events" element={<EventsPage />} />
          <Route path="/admin/events/:id" element={<p>detail page</p>} />
        </Routes>
      </MemoryRouter>,
    );

  it('lists events and applies status and date range filters to the query', async () => {
    mockApi.listEvents.mockResolvedValue({ ok: true, status: 200, data: [makeEvent()] });
    renderPage();
    expect(await screen.findByRole('link', { name: 'June Meetup' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New event' })).toHaveClass('btn', 'btn-primary');

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'draft');
    await userEvent.type(screen.getByLabelText('From date'), '2025-06-01');
    await userEvent.type(screen.getByLabelText('To date'), '2025-06-30');

    await waitFor(() => {
      const last = mockApi.listEvents.mock.calls[mockApi.listEvents.mock.calls.length - 1][0];
      expect(last.status).toBe('draft');
      expect(last.from).toBe(new Date(2025, 5, 1, 0, 0).toISOString());
      expect(last.to).toBe(new Date(2025, 5, 30, 23, 59, 59, 999).toISOString());
    });
  });

  it('toggles to the calendar view', async () => {
    mockApi.listEvents.mockResolvedValue({ ok: true, status: 200, data: [] });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Calendar' }));
    expect(await screen.findByRole('grid')).toBeInTheDocument();
  });

  it('asks for confirmation when deleting an event with bookings, then deletes', async () => {
    mockApi.listEvents.mockResolvedValue({ ok: true, status: 200, data: [makeEvent()] });
    mockApi.deleteEvent
      .mockResolvedValueOnce({ ok: false, kind: 'confirm_required', status: 409, message: 'Has 2 bookings', warnings: [] })
      .mockResolvedValueOnce({ ok: true, status: 204, data: undefined });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /Delete/ }));
    expect(mockApi.deleteEvent).toHaveBeenCalledWith('e1', false);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Has 2 bookings');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete event' }));
    await waitFor(() => expect(mockApi.deleteEvent).toHaveBeenCalledWith('e1', true));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
