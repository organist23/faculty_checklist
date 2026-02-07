import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { login, error: authError, loading: authLoading, clearError } = useAuth();
  
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
          <div className="logo-badge mb-4" style={{ fontSize: '48px', textAlign: 'center' }}>🏛️</div>
          <h1 className="login-title" style={{ fontSize: 'var(--text-4xl)', letterSpacing: '-0.02em', textAlign: 'center' }}>NVSU</h1>
          <p className="login-subtitle" style={{ fontWeight: '600', color: 'var(--nvsu-green)', textAlign: 'center' }}>
            Faculty Compliance Checklist<br />
            <span style={{ fontWeight: '400', color: 'var(--gray-500)', fontSize: 'var(--text-sm)' }}>Management System</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 'var(--space-6)' }}>
          {(error || authError) && (
            <div className="alert alert-danger" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
              {error || authError}
            </div>
          )}

          <div className="form-group">
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

          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              className="form-input"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              disabled={loading || authLoading}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-6)' }}>
            <button 
              type="button"
              className="link-btn"
              onClick={() => alert("Please contact the CTED-BPED Office or IT center to reset your institutional credentials.")}
              style={{ padding: 0, background: 'none', border: 'none', color: 'var(--nvsu-green)', fontWeight: '600', cursor: 'pointer' }}
            >
              Forgot password?
            </button>
          </div>

          <button 
            type="submit" 
            className={`btn btn-primary ${loading || authLoading ? 'btn-loading' : ''}`} 
            style={{ width: '100%' }}
            disabled={loading || authLoading}
          >
            {loading || authLoading ? 'Authenticating...' : 'Authenticate Access'}
          </button>
        </form>

        <div style={{ marginTop: 'var(--space-8)', textAlign: 'center', paddingTop: 'var(--space-6)', borderTop: '1px solid var(--gray-200)' }}>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-500)' }}>
            <strong>NVSU CTED-BPED Institutional Portal</strong><br />
            Use your institutional credentials to access the system.
          </p>
        </div>
      </div>

    </div>
  );
}
