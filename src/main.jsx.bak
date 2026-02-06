import React, { Component } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("CRITICAL UI ERROR:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '40px', 
          textAlign: 'center', 
          fontFamily: 'sans-serif',
          background: '#fef2f2',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <h1 style={{ color: '#991b1b' }}>Something went wrong.</h1>
          <p style={{ color: '#4b5563', maxWidth: '500px' }}>
            The application encountered a runtime error. Please try refreshing the page or contact support if the issue persists.
          </p>
          <pre style={{ 
            background: '#fff', 
            padding: '15px', 
            borderRadius: '8px', 
            border: '1px solid #fee2e2',
            textAlign: 'left',
            marginTop: '20px',
            fontSize: '12px',
            maxWidth: '90%',
            overflowX: 'auto'
          }}>
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            style={{
              marginTop: '30px',
              padding: '12px 24px',
              background: '#ed1c24',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
