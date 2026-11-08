import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RequireRole from '../common/RequireRole';
import App from '../../App';

jest.mock('../../aws-config', () => ({}));
jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    listEvents: jest.fn().mockResolvedValue({ ok: true, status: 200, data: [] }),
    getMyProfile: jest.fn().mockResolvedValue({ ok: true, status: 200, data: { exists: false, name: '', bio: '', location: '', topics: [], links: [], pastTalks: [] } }),
  },
}));
jest.mock('../Login', () => ({ __esModule: true, default: () => <p>login page</p> }));

let mockAuth: Record<string, unknown>;
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const admin = { isAuthenticated: true, loading: false, role: 'admin', user: { email: 'a@x.com' }, logout: jest.fn() };
const speaker = { isAuthenticated: true, loading: false, role: 'speaker', user: { email: 's@x.com' }, logout: jest.fn() };

const renderApp = (path: string) => {
  window.history.pushState({}, '', path);
  return render(<App />);
};

describe('RequireRole redirects', () => {
  it('redirects an admin who is NOT in the speaker group away from a speaker page', () => {
    mockAuth = { ...admin, groups: ['admin'] };
    render(
      <MemoryRouter initialEntries={['/speaker']}>
        <Routes>
          <Route path="/admin" element={<p>admin home</p>} />
          <Route path="/speaker" element={<RequireRole role="speaker"><p>speaker home</p></RequireRole>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('admin home')).toBeInTheDocument();
    expect(screen.queryByText('speaker home')).toBeNull();
  });

  it('lets an admin who is also in the speaker group open the speaker area', () => {
    mockAuth = { ...admin, groups: ['admin', 'speaker'], canUseSpeakerView: true };
    render(
      <MemoryRouter initialEntries={['/speaker']}>
        <Routes>
          <Route path="/admin" element={<p>admin home</p>} />
          <Route path="/speaker" element={<RequireRole role="speaker"><p>speaker home</p></RequireRole>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('speaker home')).toBeInTheDocument();
    expect(screen.queryByText('admin home')).toBeNull();
  });

  it('keeps redirecting a speaker-only user away from the admin area', () => {
    mockAuth = { ...speaker, groups: ['speaker'] };
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/speaker" element={<p>speaker home</p>} />
          <Route path="/admin" element={<RequireRole role="admin"><p>admin home</p></RequireRole>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('speaker home')).toBeInTheDocument();
    expect(screen.queryByText('admin home')).toBeNull();
  });
  it('shows a loading status and no redirect or content while loading', () => {
    mockAuth = { isAuthenticated: false, loading: true, role: null };
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/login" element={<p>login page</p>} />
          <Route path="/admin" element={<RequireRole role="admin"><p>admin home</p></RequireRole>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading...');
    expect(screen.queryByText('login page')).toBeNull();
    expect(screen.queryByText('admin home')).toBeNull();
  });
});

describe('App role routing', () => {
  it('sends an admin at "/" to the admin area', () => {
    mockAuth = admin;
    renderApp('/');
    expect(window.location.pathname).toBe('/admin/events');
    expect(screen.getByRole('heading', { name: 'Events' })).toBeInTheDocument();
  });

  it('sends a speaker at "/" to the speaker area', async () => {
    mockAuth = speaker;
    renderApp('/');
    expect(window.location.pathname).toBe('/speaker/profile');
    expect(await screen.findByRole('heading', { name: 'My profile' })).toBeInTheDocument();
  });

  it('sends an unauthenticated user at "/" to login', () => {
    mockAuth = { isAuthenticated: false, loading: false, role: null };
    renderApp('/');
    expect(window.location.pathname).toBe('/login');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('lands a user in both groups (role resolved as admin) on /admin by default', () => {
    mockAuth = { ...admin, groups: ['speaker', 'admin'] };
    renderApp('/');
    expect(window.location.pathname.startsWith('/admin')).toBe(true);
    expect(screen.queryByRole('heading', { name: 'My profile' })).toBeNull();
  });

  it('lets an admin in both groups open /speaker, with the speaker nav and a link back to the admin view', async () => {
    mockAuth = { ...admin, groups: ['admin', 'speaker'] };
    renderApp('/speaker/profile');
    expect(window.location.pathname).toBe('/speaker/profile');
    expect(await screen.findByRole('heading', { name: 'My profile' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My submissions' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull();
    expect(screen.getByText('Viewing as: Speaker')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin view' })).toHaveAttribute('href', '/admin');
  });

  it('redirects an admin who is not in the speaker group from /speaker to the admin area', () => {
    mockAuth = { ...admin, groups: ['admin'] };
    renderApp('/speaker/profile');
    expect(window.location.pathname).toBe('/admin/events');
    expect(screen.queryByRole('link', { name: 'Speaker view' })).toBeNull();
  });
  it('redirects a speaker from /admin to the speaker area', () => {
    mockAuth = speaker;
    renderApp('/admin/events');
    expect(window.location.pathname).toBe('/speaker/profile');
  });

  it('redirects unknown admin paths to the admin index', () => {
    mockAuth = admin;
    renderApp('/admin/nope/deeper');
    expect(window.location.pathname).toBe('/admin/events');
  });

  it('redirects unknown speaker paths to the speaker index', () => {
    mockAuth = speaker;
    renderApp('/speaker/nope');
    expect(window.location.pathname).toBe('/speaker/profile');
  });

  it('redirects unknown top-level paths by role', () => {
    mockAuth = speaker;
    renderApp('/whatever');
    expect(window.location.pathname).toBe('/speaker/profile');
  });
});
