import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { canUseView, homePathForRole } from '../../utils/roles';
import type { Role } from '../../types';

interface RequireRoleProps {
  role: Role;
  children?: React.ReactNode;
}

/**
 * Route guard (UX only; the server is the authority, Req 1.9).
 * Unauthenticated users go to /login. A user may open an area when their Cognito groups include\n * the required role (so an admin who is also a speaker can open the speaker view); anyone else\n * goes to their own home (Req 1.6, 1.7).
 */
const RequireRole: React.FC<RequireRoleProps> = ({ role: required, children }) => {
  const { isAuthenticated, loading, role, groups } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen" role="status" aria-live="polite">
        <div className="loading-spinner" aria-hidden="true"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!canUseView(groups, role, required)) return <Navigate to={homePathForRole(role)} replace />;

  return <>{children ?? <Outlet />}</>;
};

export default RequireRole;
