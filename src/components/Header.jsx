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
    if (!navigator.onLine) {
      alert("⚠️ Network Error: Cannot sign out while offline. Please check your internet connection to end your session securely.");
      return;
    }
    
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout failed:', err);
      alert("Failed to logout. Please try again.");
    }
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
                          <p className="user-email">{user?.email || 'NVSU Faculty staff'}</p>
                          <div style={{ marginTop: '4px' }}>
                            <span className={`role-badge ${user?.role === 'admin' ? 'admin' : 'faculty'}`}>
                              {user?.role === 'admin' ? 'System Administrator' : 'Faculty Staff'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="dropdown-divider" style={{ opacity: 0.1 }}></div>
                      <div style={{ padding: '8px 0' }}>
                        <button 
                          className="dropdown-item destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowLogoutConfirm(true);
                          }}
                        >
                          <span className="icon">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                              <polyline points="16 17 21 12 16 7"></polyline>
                              <line x1="21" y1="12" x2="9" y2="12"></line>
                            </svg>
                          </span>
                          <span style={{ fontWeight: '700' }}>Logout Account</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="logout-confirm-view animate-slide-up">
                      <div className="confirm-icon" style={{ fontSize: '3rem', filter: 'drop-shadow(0 4px 12px rgba(239, 68, 68, 0.3))' }}>⚠️</div>
                      <h3 style={{ fontSize: '1.4rem', fontWeight: 900, marginBottom: '8px' }}>Sign out?</h3>
                      <p style={{ fontSize: '1rem', color: 'var(--gray-600)', marginBottom: '24px' }}>Do you really want to end your current session?</p>
                      <div className="confirm-actions">
                        <button 
                          className="btn-cancel-logout premium-pulse"
                          style={{ padding: '14px', borderRadius: '16px', fontSize: '1rem' }}
                          onClick={() => setShowLogoutConfirm(false)}
                        >
                          Stay Signed In
                        </button>
                        <button 
                          className="btn-confirm-logout"
                          style={{ margin: '8px 0', fontSize: '0.9rem', fontWeight: '700', opacity: 0.7 }}
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
                        <div className="badge-container" style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
                          <span className={`role-badge ${user?.role === 'admin' ? 'admin' : 'faculty'}`} style={{ transform: 'scale(1.1)' }}>
                            {user?.role === 'admin' ? 'SYSTEM CHAIR' : 'FACULTY STAFF'}
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
                        <div className="confirm-icon-large">
                          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                            <line x1="12" y1="9" x2="12" y2="13"></line>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                          </svg>
                        </div>
                        <h3>End your session?</h3>
                        <p>This will securely sign you out from the dashboard.</p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                          <button 
                            className="premium-btn primary-nvsu pulse"
                            style={{ 
                              background: 'linear-gradient(135deg, var(--nvsu-green-dark), var(--nvsu-green))',
                              borderRadius: '20px',
                              padding: '18px',
                              fontSize: '1.1rem'
                            }}
                            onClick={() => setShowDropdown(false)}
                          >
                            Stay Signed In
                          </button>
                          
                          <button 
                            className="premium-btn-outline destructive-nvsu"
                            style={{ 
                              border: 'none',
                              color: 'var(--nvsu-red)',
                              background: 'rgba(239, 68, 68, 0.05)',
                              borderRadius: '16px',
                              padding: '12px',
                              fontSize: '0.95rem'
                            }}
                            onClick={handleLogout}
                          >
                            Yes, Log me out
                          </button>
                        </div>
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
