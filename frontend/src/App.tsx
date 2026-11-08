import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, type RouteObject } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import RequireRole from './components/common/RequireRole';
import Layout from './components/common/Layout';
import { adminRoutes } from './routes/adminRoutes';
import { speakerRoutes } from './routes/speakerRoutes';
import { homePathForRole } from './utils/roles';
import './App.css';



const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading, role } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return !isAuthenticated ? <>{children}</> : <Navigate to={homePathForRole(role)} replace />;
};

const RoleRedirect: React.FC = () => {
  const { loading, role } = useAuth();
  if (loading) return null;
  return <Navigate to={homePathForRole(role)} replace />;
};

// Converts per-area route configs into <Route> elements (flat configs only).
const renderRoutes = (routes: RouteObject[]) =>
  routes.map((r, i) =>
    r.index ? (
      <Route key={i} index element={r.element} />
    ) : (
      <Route key={r.path} path={r.path} element={r.element} />
    ),
  );

const AppContent: React.FC = () => {
  return (
    <Routes>
      <Route 
        path="/login" 
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        } 
      />
      <Route path="/admin" element={<RequireRole role="admin"><Layout /></RequireRole>}>
        {renderRoutes(adminRoutes)}
      </Route>
      <Route path="/speaker" element={<RequireRole role="speaker"><Layout /></RequireRole>}>
        {renderRoutes(speakerRoutes)}
      </Route>
      <Route path="/" element={<RoleRedirect />} />
      <Route path="*" element={<RoleRedirect />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
};

export default App;
