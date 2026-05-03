import React from 'react';
import { useAuth } from '../contexts/AuthContext';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  const { user, logout } = useAuth();

  const navItems = [
    { id: 'events', label: 'Events', icon: '📅' },
    { id: 'social', label: 'Social Media', icon: '📱' },
    { id: 'messaging', label: 'Messaging', icon: '💬' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
  ];

  return (
    <nav className="navigation">
      <div className="nav-header">
        <h1>EventPush</h1>
        <div className="user-info">
          <span className="user-name">{user?.name}</span>
          <button onClick={logout} className="logout-btn">
            Logout
          </button>
        </div>
      </div>

      <div className="nav-menu">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => onTabChange(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default Navigation;