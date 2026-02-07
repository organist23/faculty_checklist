import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabase';

const SystemContext = createContext(null);

export function SystemProvider({ children }) {
  const [settings, setSettings] = useState({
    semester: 'FIRST SEMESTER',
    academicYear: '2025-2026',
    deadline: null,
    deadlineEnabled: true,
    loading: true
  });

  useEffect(() => {
    fetchSettings();

    // Subscribe to changes in settings
    const subscription = supabase
      .channel('public:system_settings')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'system_settings' }, 
        payload => {
          console.log('System Settings Update:', payload);
          const newSettings = payload.new;
          setSettings(prev => ({
            ...prev,
            semester: newSettings.current_semester,
            academicYear: newSettings.current_academic_year,
            deadline: newSettings.deadline,
            deadlineEnabled: !!newSettings.deadline
          }));
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchSettings = async () => {
    console.log('Fetching system settings...');
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .single();

      if (error) {
        console.error('System Settings DB Fetch Error Details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }

      console.log('System settings fetched successfully:', data);
      setSettings({
        semester: data.current_semester,
        academicYear: data.current_academic_year,
        deadline: data.deadline,
        deadlineEnabled: !!data.deadline,
        loading: false
      });
    } catch (err) {
      console.error('fetchSettings Catch Block:', err);
      setSettings(prev => ({ ...prev, loading: false }));
    }
  };

  const updateSettings = async (newSettings) => {
    if (!navigator.onLine) {
      return { success: false, error: 'No internet connection. Cannot update settings.' };
    }
    try {
      const dbPayload = {};
      if (newSettings.semester) dbPayload.current_semester = newSettings.semester;
      if (newSettings.academicYear) dbPayload.current_academic_year = newSettings.academicYear;
      if (newSettings.deadline !== undefined) dbPayload.deadline = newSettings.deadline;
      
      const { error } = await supabase
        .from('system_settings')
        .update(dbPayload)
        .eq('id', (await supabase.from('system_settings').select('id').single()).data.id);

      if (error) throw error;
      
      // Local state will be updated by subscription, but we can update it immediately for responsiveness
      setSettings(prev => ({ ...prev, ...newSettings }));
      return { success: true };
    } catch (err) {
      console.error('Update Settings Error:', err);
      return { success: false, error: err.message };
    }
  };

  return (
    <SystemContext.Provider value={{ settings, updateSettings, fetchSettings }}>
      {children}
    </SystemContext.Provider>
  );
}

export function useSystem() {
  const context = useContext(SystemContext);
  if (!context) {
    throw new Error('useSystem must be used within a SystemProvider');
  }
  return context;
}
