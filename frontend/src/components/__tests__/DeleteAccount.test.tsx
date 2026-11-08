import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DeleteAccount from '../speaker/DeleteAccount';

const mockApi = { deleteMyAccount: jest.fn() };
const mockLogout = jest.fn();

jest.mock('../../services/api', () => ({
  __esModule: true,
  get default() {
    return mockApi;
  },
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

const setup = () =>
  render(
    <MemoryRouter initialEntries={['/speaker/profile']}>
      <Routes>
        <Route path="/speaker/profile" element={<DeleteAccount />} />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>
  );

const openDialog = async () => {
  await userEvent.type(screen.getByLabelText(/type delete/i), 'DELETE');
  await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLogout.mockResolvedValue(undefined);
});

describe('DeleteAccount', () => {
  it('keeps the button disabled until DELETE is typed', async () => {
    setup();
    const button = screen.getByRole('button', { name: 'Delete my account' });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/type delete/i), 'DELETE');
    expect(button).toBeEnabled();
  });

  it('does nothing when the dialog is cancelled', async () => {
    setup();
    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mockApi.deleteMyAccount).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('calls the API, signs out and redirects to /login on confirm', async () => {
    mockApi.deleteMyAccount.mockResolvedValue({ ok: true, status: 200, data: { deleted: true } });
    setup();
    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete my account' }));
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(mockApi.deleteMyAccount).toHaveBeenCalledTimes(1);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('shows an error and stays signed in when deletion fails', async () => {
    mockApi.deleteMyAccount.mockResolvedValue({
      ok: false,
      kind: 'error',
      status: 500,
      error: { code: 'INTERNAL', message: 'Boom' },
    });
    setup();
    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete my account' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Boom'));
    expect(mockLogout).not.toHaveBeenCalled();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });
});
