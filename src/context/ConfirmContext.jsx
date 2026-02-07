import { createContext, useContext, useState, useCallback } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({
    isOpen: false,
    title: '',
    message: '',
    resolve: null,
    type: 'confirm' // 'confirm' or 'alert'
  });

  const confirm = useCallback((message, title = 'Confirmation') => {
    setState({
      isOpen: true,
      title,
      message,
      type: 'confirm',
      resolve: null // Will be set in the return promise
    });

    return new Promise((resolve) => {
      setState(prev => ({ ...prev, resolve }));
    });
  }, []);

  const showAlert = useCallback((message, title = 'Notification') => {
    setState({
      isOpen: true,
      title,
      message,
      type: 'alert',
      resolve: null
    });

    return new Promise((resolve) => {
      setState(prev => ({ ...prev, resolve }));
    });
  }, []);

  const handleClose = (value) => {
    if (state.resolve) state.resolve(value);
    setState(prev => ({ ...prev, isOpen: false }));
  };

  return (
    <ConfirmContext.Provider value={{ confirm, showAlert }}>
      {children}
      {state.isOpen && (
        <div className="modal-overlay" style={{ 
          zIndex: 100000, 
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          backgroundColor: 'rgba(0,0,0,0.6)', 
          backdropFilter: 'blur(4px)',
          padding: 'var(--space-4)'
        }}>
          <div className="card animate-scale-in" style={{ maxWidth: '450px', width: '95%', padding: '0', overflow: 'hidden', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', borderRadius: 'var(--radius-xl)' }}>
            <div style={{ height: '4px', background: state.type === 'confirm' ? 'var(--nvsu-red)' : 'var(--brand-blue)' }}></div>
            <div style={{ padding: 'var(--space-6) var(--space-8)' }}>
              <h3 style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--text-2xl)', color: 'var(--brand-blue-dark)', fontWeight: '800', letterSpacing: '-0.5px' }}>{state.title}</h3>
              <p style={{ margin: 0, color: 'var(--gray-600)', lineHeight: '1.6', fontSize: 'var(--text-md)' }}>{state.message}</p>
            </div>
            <div style={{ padding: 'var(--space-5) var(--space-8)', background: 'var(--gray-50)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              {state.type === 'confirm' && (
                <button className="btn btn-outline" style={{ borderRadius: 'var(--radius-md)', fontWeight: '600' }} onClick={() => handleClose(false)}>Cancel</button>
              )}
              <button className="btn btn-primary" style={{ borderRadius: 'var(--radius-md)', fontWeight: '600', padding: 'var(--space-2) var(--space-6)' }} onClick={() => handleClose(true)}>
                {state.type === 'confirm' ? 'Confirm' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used within ConfirmProvider');
  return context;
}
