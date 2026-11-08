import React from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { APP_NAME } from '../../config/app';
import { canUseView } from '../../utils/roles';
import type { Role } from '../../types';

interface NavItem {
  to: string;
  label: string;
}

const NAV_ITEMS: Record<Role, NavItem[]> = {
  admin: [
    { to: '/admin/events', label: 'Events' },
    { to: '/admin/speakers', label: 'Speakers' },
    { to: '/admin/cfps', label: 'CFPs' },
    { to: '/admin/bookings', label: 'Bookings' },
    { to: '/admin/users', label: 'Users' },
  ],
  speaker: [
    { to: '/speaker/profile', label: 'My profile' },
    { to: '/speaker/cfps', label: 'Open CFPs' },
    { to: '/speaker/submissions', label: 'My submissions' },
    { to: '/speaker/bookings', label: 'My bookings' },
  ],
};

const VIEW_LABEL: Record<Role, string> = { admin: 'Admin', speaker: 'Speaker' };
const OTHER_VIEW: Record<Role, Role> = { admin: 'speaker', speaker: 'admin' };

/** The area being viewed, from the URL prefix; null outside /admin and /speaker. */
const areaFromPath = (pathname: string): Role | null => {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
  if (pathname === '/speaker' || pathname.startsWith('/speaker/')) return 'speaker';
  return null;
};

const Layout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { role, groups, user, logout } = useAuth();
  const { pathname } = useLocation();

  // Nav follows the area being viewed (not the resolved role) so an admin who
  // is also a speaker sees the speaker nav in the speaker view. Outside both
  // areas, fall back to the resolved role.
  const pathArea = areaFromPath(pathname);
  const area: Role | null = pathArea && canUseView(groups, role, pathArea) ? pathArea : role;
  const items = area ? NAV_ITEMS[area] : [];

  // Switcher only for users who can use both views.
  const canSwitch = canUseView(groups, role, 'admin') && canUseView(groups, role, 'speaker');
  const other = area ? OTHER_VIEW[area] : null;

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header>
        <span className="app-name">{APP_NAME}</span>
        <nav aria-label="Main">
          <ul>
            {items.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to}>{item.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
        {canSwitch && area && other && (
          <div className="view-switcher" role="group" aria-label="Switch view">
            <span className="view-label">Viewing as: {VIEW_LABEL[area]}</span>
            <Link className="btn btn-secondary btn-small" to={`/${other}`}>
              {VIEW_LABEL[other]} view
            </Link>
          </div>
        )}
        <div className="user-menu">
          {user?.email && <span>{user.email}</span>}
          <button type="button" onClick={() => void logout()}>Sign out</button>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children ?? <Outlet />}
      </main>
    </div>
  );
};

export default Layout;