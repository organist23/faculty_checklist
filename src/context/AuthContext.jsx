import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState({
    user: null,
    isAuthenticated: false,
    loading: true,
    error: null
  });

  /* Ref to track latest auth event to prevent race conditions without async calls */
  const latestEvent = useRef('INITIAL_SESSION');

  useEffect(() => {
    let mounted = true;
    
    // Safety timeout: Increased to 30s for slower connections
    const safetyTimer = setTimeout(() => {
      if (mounted) {
        setAuthState(prev => prev.loading ? { ...prev, loading: false, error: 'Connection timeout. Please check your internet connection.' } : prev);
      }
    }, 30000);

    const initAuth = async () => {
      try {
        // 1. Check active session immediately
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
           console.warn('Session Check Warning:', error);
           // Do not immediately throw/logout on soft errors, might be momentary.
           // But if no session data, we must assume logged out eventually.
           // Let's rely on onAuthStateChange to catch it if getSession fails?
           // No, we need definitive answer.
           
           // If network error, maybe retry?
           // For now, let's treat it as no-session but log it deeply.
           throw error;
        }

        if (session) {
          if (mounted) await fetchProfile(session.user.id, session.user.email);
        } else {
          // No session found
          if (mounted) setAuthState(prev => ({ ...prev, loading: false, isAuthenticated: false }));
        }
      } catch (err) {
        console.error('Auth Init Error:', err);
        // Better error message for network issues
        const errorMessage = (err.message?.includes('fetch') || !navigator.onLine)
          ? 'Please check your internet connection.'
          : err.message || 'Authentication check failed';
          
        if (mounted) setAuthState(prev => ({ ...prev, loading: false, error: errorMessage }));
      }
    };

    // Initialize immediately
    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth Change:', event);
      latestEvent.current = event;
      
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
         // Only fetch profile if we aren't already authenticated or if user changed
         // This prevents double-fetching on initial load if initAuth beat us to it
         if (session) {
            // Simple check: do we already have this user in state?
            setAuthState(prev => {
                if (prev.user?.id === session.user.id && prev.isAuthenticated) return prev;
                // Otherwise fetch
                fetchProfile(session.user.id, session.user.email);
                return prev; // Return prev temporarily while fetch runs? fetchProfile updates state itself.
            });
         }
      } else if (event === 'SIGNED_OUT') {
         setAuthState({ user: null, isAuthenticated: false, loading: false, error: null });
      }
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimer);
      mounted = false;
    };
  }, []);

  const fetchProfile = async (uid, email) => {
    console.log('Fetching profile for:', uid);
    try {
      const { data, error } = await supabase
        .from('faculty_profiles')
        .select('*')
        .eq('id', uid)
        .single();

      if (error) throw error;
      
      // CRITICAL CHECK: If profile is deleted (null data), do NOT allow login.
      if (!data) {
        throw new Error('Profile not found in database.');
      }

      console.log('Profile fetched successfully:', data);
      
      // RACING CONDITION FIX V2: Check the synchronous ref
      if (latestEvent.current === 'SIGNED_OUT') {
        console.warn('Discarding profile fetch: User signed out during fetch.');
        return;
      }

      setAuthState({
        user: { ...data },
        isAuthenticated: true,
        loading: false,
        error: null
      });
      return true; // Success
    } catch (err) {
      console.error('fetchProfile Catch Block:', err);
      // FORCE LOGOUT if profile is missing. Do NOT allow "ghost" sessions.
      await supabase.auth.signOut(); 
      
      setAuthState({
        user: null,
        isAuthenticated: false,
        loading: false,
        error: err.message || 'Account not authorized. Please check your internet connection.'
      });
      return false; // Failed
    }
  };

  const login = async (email, password) => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }));
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      setAuthState(prev => ({ ...prev, loading: false, error: error.message }));
      return { success: false, error: error.message };
    }

    // EXPLICITLY wait for profile fetch to ensure state is updated before navigation
    if (data.user) {
      try {
        const profileSuccess = await fetchProfile(data.user.id, data.user.email);
        
        if (!profileSuccess) {
           return { success: false, error: 'Account not authorized. Please check your internet connection.' };
        }
      } catch (profileErr) {
        console.error('Login Profile Fetch Fail:', profileErr);
        return { success: false, error: 'Profile verification failed.' };
      }
    }

    return { success: true, user: data.user };
  };

  const logout = async () => {
    try {
      // Attempt to sign out from Supabase (clears local storage/cookies)
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Logout error (non-blocking):', err);
    } finally {
      // ALWAYS clear local state regardless of API success
      setAuthState({
        user: null,
        isAuthenticated: false,
        loading: false,
        error: null
      });
    }
  };

  const resetPasswordForEmail = async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (error) throw error;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const updatePassword = async (newPassword) => {
    try {
      // 1. Update the actual Supabase Auth password
      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      
      // 2. Resolve User ID to ensure we target the correct profile
      let userId = data.user?.id;
      if (!userId) {
         const { data: userData } = await supabase.auth.getUser();
         userId = userData.user?.id;
      }

      // 3. Sync to faculty_profiles for "Visible Password" (Admin View)
      if (userId) {
        console.log("Attempting to sync visible_password for:", userId);
        const { error: profileError } = await supabase
          .from('faculty_profiles')
          .update({ visible_password: newPassword })
          .eq('id', userId);
          
        if (profileError) {
           console.error("CRITICAL: Profile Sync Failed. Admin view will be outdated.", profileError);
           // NOTE: We do not throw here because the main auth password WAS changed successfully.
           // Throwing would confuse the user into thinking the password reset failed.
        } else {
           console.log("Profile Sync Successful");
        }
      } else {
         console.warn("Authentication State Warning: Could not resolve User ID for profile sync.");
      }
      
      return { success: true, data };
    } catch (error) {
      console.error("Password Update Error:", error);
      return { success: false, error: error.message };
    }
  };

  const clearError = () => {
    setAuthState(prev => ({ ...prev, error: null }));
  };

  const value = {
    ...authState,
    login,
    logout,
    resetPasswordForEmail,
    updatePassword,
    clearError
  };

  if (authState.loading) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100dvh',
        background: 'var(--gray-50)',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div className="spinner-large" style={{ marginBottom: '20px' }}></div>
        <h2 style={{ color: 'var(--brand-blue)', marginBottom: '10px' }}>Connecting to Portal...</h2>
        <p className="text-gray" style={{ maxWidth: '300px', margin: '0 auto 20px' }}>
          Establishing secure connection to NVSU compliance server.
        </p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
