import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import './App.css';
import { SystemProvider } from './context/SystemContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';

// Pages
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import FacultyDashboard from './pages/FacultyDashboard';
import ChecklistView from './pages/ChecklistView';
import ManageFaculty from './pages/ManageFaculty';
import ForgotPassword from './pages/ForgotPassword';
import UpdatePassword from './pages/UpdatePassword';

// Protected Route Component
function ProtectedRoute({ children, allowedRoles }) {
  const { user, isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  const role = user?.role?.toLowerCase();
  
  if (allowedRoles && !allowedRoles.map(r => r.toLowerCase()).includes(role)) {
    // If user has a valid authenticated session but wrong role for this specific route
    const redirectPath = role === 'admin' ? '/admin/dashboard' : '/faculty/dashboard';
    return <Navigate to={redirectPath} replace />;
  }
  
  return children;
}

import { useNetworkStatus } from './hooks/useNetworkStatus';

// Main App Router
function AppRouter() {
  const { isAuthenticated, user } = useAuth();
  const isOnline = useNetworkStatus();
  
  return (
    <>
      {!isOnline && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          backgroundColor: '#ef4444', 
          color: 'white', 
          textAlign: 'center', 
          padding: '8px', 
          zIndex: 99999,
          fontSize: '14px',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}>
          <span>📡</span> Please check your internet connection.
        </div>
      )}
      <Routes>
      <Route 
        path="/login" 
        element={
          isAuthenticated ? (
            <Navigate to={user?.role === 'admin' ? '/admin/dashboard' : '/faculty/dashboard'} replace />
          ) : (
            <Login />
          )
        } 
      />
      
      <Route 
        path="/forgot-password" 
        element={
          isAuthenticated ? (
            <Navigate to={user?.role === 'admin' ? '/admin/dashboard' : '/faculty/dashboard'} replace />
          ) : (
            <ForgotPassword />
          )
        } 
      />
      
      <Route 
        path="/update-password" 
        element={
          <UpdatePassword />
        } 
      />
      
      <Route 
        path="/" 
        element={
          isAuthenticated && user ? (
            user.role ? (
              user.role.toLowerCase() === 'admin' ? (
                <Navigate to="/admin/dashboard" replace />
              ) : (
                <Navigate to="/faculty/dashboard" replace />
              )
            ) : (
              // If we have a user but NO role yet, stay put and let AuthContext handle it
              <div className="flex-center" style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="spinner-large"></div>
              </div>
            )
          ) : (
            <Navigate to="/login" replace />
          )
        } 
      />
      
      <Route 
        path="/admin/dashboard" 
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/admin/checklist/:id" 
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <ChecklistView />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/admin/faculty/manage" 
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <ManageFaculty />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/faculty/dashboard" 
        element={
          <ProtectedRoute allowedRoles={['faculty']}>
            <FacultyDashboard />
          </ProtectedRoute>
        } 
      />
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

import { ConfirmProvider } from './context/ConfirmContext';

function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SystemProvider>
        <AuthProvider>
          <ConfirmProvider>
            <ToastProvider>
              <AppRouter />
            </ToastProvider>
          </ConfirmProvider>
        </AuthProvider>
      </SystemProvider>
    </Router>
  );
}

export default App;
