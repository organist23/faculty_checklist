import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Header() {
  const { user, logout } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Reset confirmation state when closing dropdown
  useEffect(() => {
    if (!showDropdown) {
      setShowLogoutConfirm(false);
    }
  }, [showDropdown]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="app-header">
      <div className="container">
        <div className="header-content">
          <div className="header-main">
            <div className="header-branding">
              <img 
                src="/Logo/educlogo.jpg" 
                alt="NVSU Logo" 
                className="header-logo"
              />
              <div className="header-title">
                <h1>NVSU CTED-BPED</h1>
                <div className="header-user-display">
                  <span className="header-display-name">{user?.name}</span>
                  <span className="header-display-role"> | {user?.role === 'admin' ? 'CHAIR' : 'FACULTY'}</span>
                </div>
                <p className="header-description">College of Teacher Education Faculty Compliance</p>
              </div>
            </div>
          </div>

          <div className="header-user" ref={dropdownRef}>
            <button 
              className={`user-avatar-btn ${showDropdown ? 'active' : ''}`}
              onClick={() => setShowDropdown(!showDropdown)}
              aria-label="User menu"
            >
              <div className="avatar-circle">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <span className="desktop-only chevron">▼</span>
            </button>

            {showDropdown && (
              <>
                {/* Desktop Dropdown */}
                <div className="user-dropdown-menu desktop-only shadow-nvsu">
                  {!showLogoutConfirm ? (
                    <>
                      <div className="dropdown-header">
                        <div className="dropdown-user-info">
                          <p className="user-name">{user?.name}</p>
                          <p className="user-email">{user?.email || 'NVSU Faculty member'}</p>
                          <span className={`role-badge ${user?.role}`}>
                            {user?.role === 'admin' ? 'System Administrator' : 'Faculty Member'}
                          </span>
                        </div>
                      </div>
                      <div className="dropdown-divider"></div>
                      <button 
                        className="dropdown-item destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowLogoutConfirm(true);
                        }}
                      >
                        <span className="icon">🚪</span>
                        Logout Account
                      </button>
                    </>
                  ) : (
                    <div className="logout-confirm-view">
                      <div className="confirm-icon">⚠️</div>
                      <h3>Sign out?</h3>
                      <p>Do you really want to end your current session?</p>
                      <div className="confirm-actions">
                        <button 
                          className="btn-cancel-logout premium-pulse"
                          onClick={() => setShowLogoutConfirm(false)}
                        >
                          Stay Signed In
                        </button>
                        <button 
                          className="btn-confirm-logout"
                          onClick={handleLogout}
                        >
                          Yes, Log out
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Mobile Full-Screen Menu Overlay */}
                <div className="mobile-fullscreen-menu mobile-only">
                  <div className="mobile-menu-inner">
                    <button className="mobile-menu-close" onClick={() => setShowDropdown(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                    
                    <div className="mobile-profile-card">
                      <div className="profile-card-header">
                        <div className="avatar-circle large">
                          {user?.name?.charAt(0) || 'U'}
                        </div>
                      </div>
                      <div className="profile-card-content">
                        <h2 className="user-name">{user?.name}</h2>
                        <p className="user-email">{user?.email || 'NVSU Faculty staff'}</p>
                        <div className="badge-container">
                          <span className={`role-badge premium ${user?.role}`}>
                            {user?.role === 'admin' ? 'SYSTEM CHAIR' : 'FACULTY MEMBER'}
                          </span>
                        </div>
                        <div className="college-info">
                          <p>College of Teacher Education</p>
                          <p>Faculty Compliance System</p>
                        </div>
                      </div>
                    </div>

                    <div className="mobile-menu-actions">
                      <div className="mobile-logout-confirm-premium">
                        <div className="confirm-icon-large">⚠️</div>
                        <h3>End your session?</h3>
                        <p>This will securely sign you out from the dashboard.</p>
                        
                        <button 
                          className="premium-btn primary-nvsu pulse"
                          onClick={() => setShowDropdown(false)}
                        >
                          Stay Signed In
                        </button>
                        
                        <button 
                          className="premium-btn-outline destructive-nvsu"
                          onClick={handleLogout}
                        >
                          Yes, Log me out
                        </button>
                      </div>
                    </div>

                    <div className="mobile-menu-footer">
                      <p>NVSU CTED-BPED v1.0</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
