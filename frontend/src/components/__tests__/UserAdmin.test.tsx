import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserAdmin from '../admin/UserAdmin';
import type { AdminUser } from '../../services/apiTypes';

const mockApi = {
  listUsers: jest.fn(),
  inviteAdmin: jest.fn(),
  promoteUser: jest.fn(),
  demoteUser: jest.fn(),
};
jest.mock('../../services/api', () => ({
  __esModule: true,
  get default() {
    return mockApi;
  },
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userId: 'u1', email: 'me@example.com' } }),
}));

const users: AdminUser[] = [
  { userId: 'u1', username: 'me@example.com', email: 'me@example.com', status: 'CONFIRMED', groups: ['admin'] },
  { userId: 'u2', username: 'other@example.com', email: 'other@example.com', status: 'CONFIRMED', groups: ['admin'] },
  { userId: 'u3', username: 'sam@example.com', email: 'sam@example.com', status: 'CONFIRMED', groups: [] },
];

const okRole = (userId: string, role: string) => ({ ok: true, status: 200, data: { userId, role } });

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.listUsers.mockResolvedValue({ ok: true, status: 200, data: users });
});

describe('UserAdmin', () => {
  it('shows role badges and the sign-in-again note', async () => {
    render(<UserAdmin />);
    const table = await screen.findByRole('table', { name: 'Users' });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByText('Admin')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Speaker')).toBeInTheDocument();
    expect(screen.getByText(/take effect after the affected user signs in again/i)).toBeInTheDocument();
  });

  it('disables demote for the current user and explains why', async () => {
    render(<UserAdmin />);
    const own = await screen.findByRole('button', { name: 'Demote me@example.com' });
    expect(own).toBeDisabled();
    expect(screen.getByText(/cannot demote yourself/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Demote other@example.com' })).toBeEnabled();
  });

  it('promotes a speaker', async () => {
    mockApi.promoteUser.mockResolvedValue(okRole('u3', 'admin'));
    render(<UserAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: 'Promote sam@example.com' }));
    await waitFor(() => expect(mockApi.promoteUser).toHaveBeenCalledWith('u3'));
    expect(await screen.findByRole('status')).toHaveTextContent(/sam@example.com is now an admin/);
  });

  it('asks for confirmation before demoting, and can cancel', async () => {
    mockApi.demoteUser.mockResolvedValue(okRole('u2', 'speaker'));
    render(<UserAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: 'Demote other@example.com' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockApi.demoteUser).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Demote other@example.com' }));
    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Demote' }));
    await waitFor(() => expect(mockApi.demoteUser).toHaveBeenCalledWith('u2'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('shows a server error from a failed demote', async () => {
    mockApi.demoteUser.mockResolvedValue({
      ok: false,
      kind: 'error',
      status: 400,
      error: { code: 'VALIDATION_ERROR', message: 'Nope' },
    });
    render(<UserAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: 'Demote other@example.com' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Demote' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nope');
  });

  it('invites an admin and clears the form', async () => {
    mockApi.inviteAdmin.mockResolvedValue({
      ok: true,
      status: 201,
      data: { userId: 'u9', username: 'new@example.com', email: 'new@example.com', groups: ['admin'] },
    });
    render(<UserAdmin />);
    await screen.findByRole('table');
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    await waitFor(() => expect(mockApi.inviteAdmin).toHaveBeenCalledWith('new@example.com'));
    expect(await screen.findByText(/Invitation sent to new@example.com/)).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('');
  });

  it('shows the email field error from the API', async () => {
    mockApi.inviteAdmin.mockResolvedValue({
      ok: false,
      kind: 'error',
      status: 400,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid', fields: { email: 'A valid email address is required' } },
    });
    render(<UserAdmin />);
    await screen.findByRole('table');
    await userEvent.type(screen.getByLabelText('Email'), 'bad');
    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    const input = screen.getByLabelText('Email');
    expect(await screen.findByText('A valid email address is required')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a load error', async () => {
    mockApi.listUsers.mockResolvedValue({
      ok: false,
      kind: 'error',
      status: 500,
      error: { code: 'X', message: 'Boom' },
    });
    render(<UserAdmin />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
  });
});
