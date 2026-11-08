import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RequireRole from '../common/RequireRole';
import Layout from '../common/Layout';
import { APP_NAME } from '../../config/app';

jest.mock('../../aws-config', () => ({}));

let mockAuth: Record<string, unknown>;
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/speaker" element={<p>speaker home</p>} />
        <Route path="/admin" element={<RequireRole role="admin"><Layout><p>admin home</p></Layout></RequireRole>} />
        <Route path="/speaker-view" element={<RequireRole role="speaker"><Layout><p>speaker view</p></Layout></RequireRole>} />
      </Routes>
    </MemoryRouter>
  );

describe('RequireRole and Layout', () => {
  it('redirects unauthenticated users to login', () => {
    mockAuth = { isAuthenticated: false, loading: false, role: null };
    renderAt('/admin');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('redirects a speaker away from admin pages to the speaker area', () => {
    mockAuth = { isAuthenticated: true, loading: false, role: 'speaker', user: { email: 's@x.com' } };
    renderAt('/admin');
    expect(screen.getByText('speaker home')).toBeInTheDocument();
  });

  it('renders admin layout with labelled nav, main landmark and APP_NAME', () => {
    mockAuth = { isAuthenticated: true, loading: false, role: 'admin', user: { email: 'a@x.com' }, logout: jest.fn() };
    renderAt('/admin');
    expect(screen.getByText('admin home')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByText(APP_NAME)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Events' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My profile' })).toBeNull();
  });

  it('shows no view switcher to an admin who is not in the speaker group', () => {
    mockAuth = { isAuthenticated: true, loading: false, role: 'admin', groups: ['admin'], user: { email: 'a@x.com' }, logout: jest.fn() };
    renderAt('/admin');
    expect(screen.queryByRole('link', { name: /view$/ })).toBeNull();
    expect(screen.queryByText(/Viewing as/)).toBeNull();
  });

  it('shows no view switcher to a speaker-only user', () => {
    mockAuth = { isAuthenticated: true, loading: false, role: 'speaker', groups: ['speaker'], user: { email: 's@x.com' }, logout: jest.fn() };
    renderAt('/speaker-view');
    expect(screen.getByText('speaker view')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /view$/ })).toBeNull();
    expect(screen.queryByText(/Viewing as/)).toBeNull();
  });

  it('shows an admin who is also a speaker a labelled switcher to the speaker view on /admin', () => {
    mockAuth = {
      isAuthenticated: true, loading: false, role: 'admin', groups: ['admin', 'speaker'],
      user: { email: 'a@x.com' }, logout: jest.fn(),
    };
    renderAt('/admin');
    expect(screen.getByText('Viewing as: Admin')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Speaker view' });
    expect(link).toHaveAttribute('href', '/speaker');
    expect(link).toHaveClass('btn', 'btn-secondary');
    expect(screen.getByRole('link', { name: 'Events' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My profile' })).toBeNull();
  });

  it('picks the nav from the area: an admin+speaker at a speaker path sees the speaker nav and a link back', () => {
    mockAuth = {
      isAuthenticated: true, loading: false, role: 'admin', groups: ['admin', 'speaker'],
      user: { email: 'a@x.com' }, logout: jest.fn(),
    };
    render(
      <MemoryRouter initialEntries={['/speaker/cfps']}>
        <Layout><p>content</p></Layout>
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Open CFPs' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Events' })).toBeNull();
    expect(screen.getByText('Viewing as: Speaker')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin view' })).toHaveAttribute('href', '/admin');
  });
});
