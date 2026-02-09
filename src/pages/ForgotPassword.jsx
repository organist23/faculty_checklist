import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
export default function ForgotPassword() {
  const { resetPasswordForEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    setLoading(true);
    
    // Use Real Auth Context
    const { success, error: apiError } = await resetPasswordForEmail(email);
    
    if (success) {
       setSent(true);
    } else {
       setError(apiError || 'Failed to send reset link. Please check the email and try again.');
    }
    setLoading(false);
  };

  if (sent) {
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
            <span style={{ fontSize: '32px' }}>✓</span>
          </div>
          
          <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-3)' }}>
            Check Your Email
          </h1>
          <p style={{ color: 'var(--gray-600)', marginBottom: 'var(--space-6)' }}>
            We've sent password reset instructions to:<br />
            <strong>{email}</strong>
          </p>
          
          <div className="alert alert-info" style={{ textAlign: 'left', marginBottom: 'var(--space-6)' }}>
            <strong>Next Steps:</strong>
            <ol style={{ margin: 'var(--space-2) 0 0 var(--space-4)', paddingLeft: 'var(--space-4)' }}>
              <li>Check your inbox (and spam folder)</li>
              <li>Click the reset link in the email</li>
              <li>Create a new password</li>
            </ol>
          </div>

          <Link to="/login" className="btn btn-primary" style={{ width: '100%', textDecoration: 'none', display: 'inline-block' }}>
            Return to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card" style={{ maxWidth: '450px' }}>
        <div className="login-header">
          <img 
            src="/Logo/educlogo.jpg" 
            alt="NVSU Logo" 
            className="login-logo"
          />
          <h1 className="login-title" style={{ fontSize: 'var(--text-3xl)', letterSpacing: '-0.02em' }}>
            Forgot Password?
          </h1>
          <p className="login-subtitle" style={{ fontWeight: '400', color: 'var(--gray-500)', fontSize: 'var(--text-sm)' }}>
            Enter your email to receive reset instructions
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email" className="form-label">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              className="form-input"
              placeholder="e.g. juandelacruz@gmail.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              disabled={loading}
              autoFocus
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
                Sending...
              </>
            ) : (
              'Send Reset Link'
            )}
          </button>
        </form>

        <div style={{ marginTop: 'var(--space-6)', textAlign: 'center', paddingTop: 'var(--space-6)', borderTop: '1px solid var(--gray-200)' }}>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-600)' }}>
            Remember your password?{' '}
            <Link to="/login" style={{ color: 'var(--brand-green)', fontWeight: '600', textDecoration: 'none' }}>
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
