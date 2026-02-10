import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function UpdatePassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const { updatePassword, logout } = useAuth();
  
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // In a real Supabase implementation, the user arrives here with a session 
  // from the recovery link. We should verify if they are authorized to be here.
  useEffect(() => {
    // Basic check for mock flow - in Supabase, the hash/token is in the URL
    if (!window.location.hash && !window.location.search.includes('type=recovery')) {
      console.warn('No recovery token found in URL');
    }
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const validate = () => {
    if (!formData.password) {
      setError('New password is required');
      return false;
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return false;
    }
    if (!/[A-Z]/.test(formData.password)) {
      setError('Password must contain at least one uppercase letter');
      return false;
    }
    if (!/[0-9]/.test(formData.password)) {
      setError('Password must contain at least one number');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validate()) return;

    setLoading(true);

    // TODO: Replace with actual Supabase password update
    // const { error } = await supabase.auth.updateUser({ password: formData.password })
    
    const result = await updatePassword(formData.password);
    
    if (result.success) {
      // Force logout so user has to sign in with new credentials
      await logout();

      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } else {
      setError(result.error || 'Failed to update password');
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="login-container">
        <div className="login-card" style={{ maxWidth: '450px', textAlign: 'center' }}>
          <div style={{ 
            width: '64px', 
            height: '64px', 
            margin: '0 auto var(--space-6)', 
            backgroundColor: 'var(--brand-green-pale)', 
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ fontSize: '32px', color: 'var(--brand-green)' }}>✓</span>
          </div>
          
          <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-3)' }}>
            Password Updated!
          </h1>
          <p style={{ color: 'var(--gray-600)', marginBottom: 'var(--space-6)' }}>
            Your password has been changed successfully.<br />
            Redirecting you to the login page...
          </p>

          <button onClick={() => navigate('/login')} className="btn btn-primary" style={{ width: '100%' }}>
            Go to Login Now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card" style={{ maxWidth: '450px' }}>
        <div className="login-header">
          <div className="logo-badge mb-4" style={{ textAlign: 'center' }}>
            <img src="/Logo/educlogo.jpg" alt="NVSU Logo" style={{ width: '100px', height: '100px', objectFit: 'contain', marginBottom: '1rem' }} />
          </div>
          <h1 className="login-title" style={{ fontSize: 'var(--text-3xl)', letterSpacing: '-0.02em', textAlign: 'center' }}>NVSU CTED-BPED</h1>
          <p className="login-subtitle" style={{ fontWeight: '600', color: 'var(--nvsu-green)', textAlign: 'center' }}>
            New Password Setup<br />
            <span style={{ fontWeight: '400', color: 'var(--gray-500)', fontSize: 'var(--text-sm)' }}>Faculty Compliance System</span>
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              New Password <span style={{ color: 'var(--nvsu-red)' }}>*</span>
            </label>
            <input
              type="password"
              id="password"
              name="password"
              className="form-input"
              placeholder="Min. 8 chars, 1 uppercase, 1 number"
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword" className="form-label">
              Confirm New Password <span style={{ color: 'var(--nvsu-red)' }}>*</span>
            </label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              className="form-input"
              placeholder="Repeat your new password"
              value={formData.confirmPassword}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%' }}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Updating...
              </>
            ) : (
              'Update Password & Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
