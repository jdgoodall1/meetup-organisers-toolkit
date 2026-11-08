import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../../components/common/Layout';

// Validates: Requirements 12.1, 12.4
jest.mock('../app', () => ({ APP_NAME: 'Mocked Product Name' }));

let mockAuth: Record<string, unknown>;
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

const ORIGINAL_NAME = 'Speaker Toolkit';

describe.each(['admin', 'speaker'])('Layout header for %s', (role) => {
  it('shows the configured APP_NAME and not the original name', () => {
    mockAuth = { isAuthenticated: true, loading: false, role, user: { email: 'u@x.com' }, logout: jest.fn() };
    const { container } = render(
      <MemoryRouter>
        <Layout>
          <p>content</p>
        </Layout>
      </MemoryRouter>
    );
    const header = container.querySelector('header') as HTMLElement;
    expect(header).toHaveTextContent('Mocked Product Name');
    expect(header).not.toHaveTextContent(ORIGINAL_NAME);
    expect(screen.queryByText(ORIGINAL_NAME)).toBeNull();
  });
});
