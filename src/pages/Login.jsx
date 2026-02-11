import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';

export default function Login() {
  const navigate = useNavigate();
  const { login, error: authError, loading: authLoading, clearError } = useAuth();
  const { showAlert } = useConfirm();
  
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
    if (authError) clearError();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    if (!navigator.onLine) {
       setError('No internet connection. Please check your network and try again.');
       setLoading(false);
       return;
    }

    if (!formData.email || !formData.password) {
      setError('Please enter both email and password');
      setLoading(false);
      return;
    }

    const result = await login(formData.email, formData.password);
    
    if (result.success) {
      // Navigation will be handled by App.jsx based on role or by navigate('/')
      navigate('/');
    } else {
      setError(result.error);
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="logo-badge mb-4" style={{ textAlign: 'center' }}>
            <img src="/Logo/educlogo.jpg" alt="NVSU Logo" style={{ width: '100px', height: '100px', objectFit: 'contain', marginBottom: '1rem' }} />
          </div>
          <h1 className="login-title">NVSU CTED-BPED</h1>
          <p className="login-subtitle">
            Faculty Compliance Checklist<br />
            <span>Management System</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 'var(--space-6)' }}>
          {(error || authError) && (
            <div className="alert alert-danger" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
              {error || authError}
            </div>
          )}

          <div className="form-group" style={{ marginBottom: '10px' }}>
            <label htmlFor="email" className="form-label">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              className="form-input"
              placeholder="name@nvsu.edu.ph"
              value={formData.email}
              onChange={handleChange}
              disabled={loading || authLoading}
              autoFocus
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '10px' }}>
            <label htmlFor="password" className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                className="form-input"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                disabled={loading || authLoading}
                required
                style={{ paddingRight: '45px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="password-toggle-btn"
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-6)' }}>
            <Link 
              to="/forgot-password"
              className="link-btn"
              style={{ padding: 0, background: 'none', border: 'none', color: 'var(--nvsu-green)', fontWeight: '600', cursor: 'pointer', textDecoration: 'none', fontSize: '14px' }}
            >
              Forgot password?
            </Link>
          </div>

          <button 
            type="submit" 
            className={`btn btn-primary ${loading || authLoading ? 'btn-loading' : ''}`} 
            style={{ width: '100%' }}
            disabled={loading || authLoading}
          >
            {loading || authLoading ? 'Logging in...' : 'Log in'}
          </button>
        </form>


      </div>

    </div>
  );
}
