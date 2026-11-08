import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../Login';

// import.meta is unavailable under Jest
jest.mock('../../aws-config', () => ({}));

const mockSignup = jest.fn();
const mockAuthContext = {
  user: null,
  isAuthenticated: false,
  login: jest.fn(),
  signup: mockSignup,
  confirmSignup: jest.fn(),
  logout: jest.fn(),
  loading: false,
};

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockAuthContext,
}));

describe('Login sign-up password validation', () => {
  beforeEach(() => {
    mockSignup.mockReset();
  });

  const openSignup = async () => {
    const user = userEvent.setup();
    render(<Login />);
    await user.click(screen.getByRole('button', { name: /create account/i }));
    return user;
  };

  it('blocks sign-up without an uppercase letter and does not call signup', async () => {
    const user = await openSignup();
    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    const password = screen.getByLabelText(/password/i);
    await user.type(password, 'lowercase1');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(mockSignup).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/uppercase letter/i);
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password.getAttribute('aria-describedby')).toContain('password-errors');
  });

  it('shows requirement hints as text that update while typing', async () => {
    const user = await openSignup();
    expect(screen.getByTestId('password-rule-uppercase')).toHaveTextContent('Required');
    await user.type(screen.getByLabelText(/password/i), 'A');
    expect(screen.getByTestId('password-rule-uppercase')).toHaveTextContent('Met');
    expect(screen.getByTestId('password-rule-length')).toHaveTextContent('Required');
  });

  it('calls signup once the password satisfies the policy', async () => {
    mockSignup.mockResolvedValue(undefined);
    const user = await openSignup();
    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/password/i), 'Abcdefg1');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(mockSignup).toHaveBeenCalledWith('new@example.com', 'Abcdefg1', '');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
