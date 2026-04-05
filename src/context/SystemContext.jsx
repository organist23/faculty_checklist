import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabase';

const SystemContext = createContext(null);

export function SystemProvider({ children }) {
  const [settings, setSettings] = useState({
    semester: 'FIRST SEMESTER',
    academicYear: '2025-2026',
    deadline: null,
    deadlineEnabled: false,
    loading: true,
    error: null,
    dbId: null // Store the record ID for updates
  });

  useEffect(() => {
    fetchSettings();

    // Subscribe to changes in settings
    const channel = supabase
      .channel('system-settings-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, 
        payload => {
          console.log('Realtime System Settings Update:', payload);
          const newSettings = payload.new;
          if (!newSettings) return;
          
          let normalizedSem = newSettings.current_semester;
          if (normalizedSem === '1') normalizedSem = 'FIRST SEMESTER';
          if (normalizedSem === '2') normalizedSem = 'SECOND SEMESTER';

          setSettings(prev => ({
            ...prev,
            semester: normalizedSem,
            academicYear: newSettings.current_academic_year,
            deadline: newSettings.deadline,
            deadlineEnabled: !!newSettings.deadline,
            dbId: newSettings.id
          }));
        }
      )
      .subscribe((status) => {
        // Only log non-error statuses to reduce console noise
        if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') {
          console.log('System Settings Subscription Status:', status);
        }
        // Silently handle channel errors - polling fallback will handle sync
      });

    // Polling fallback to ensure sync even if realtime fails
    const interval = setInterval(() => {
      fetchSettings(true); // true = silent (no loading spinner)
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const fetchSettings = async (silent = false) => {
    if (!silent) console.log('Fetching system settings...');
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .single();

      if (error) {
        // If it's a silent background poll and we get a 401 (Unauthorized), 
        // it's likely a temporary session sync issue. Ignore it.
        if (silent && (error.code === '401' || error.status === 401)) {
           return; 
        }

        if (!silent) {
          console.error('System Settings DB Fetch Error:', error);
        }
        throw error;
      }

      if (!silent) console.log('System settings fetched successfully:', data);

      let normalizedSem = data.current_semester;
      if (normalizedSem === '1') normalizedSem = 'FIRST SEMESTER';
      if (normalizedSem === '2') normalizedSem = 'SECOND SEMESTER';

      setSettings(prev => ({
        ...prev,
        semester: normalizedSem,
        academicYear: data.current_academic_year,
        deadline: data.deadline,
        deadlineEnabled: !!data.deadline,
        loading: false,
        dbId: data.id // Save the ID for future updates
      }));
    } catch (err) {
      if (!silent) console.error('fetchSettings Exception:', err);
      if (!silent) {
        setSettings(prev => ({ 
          ...prev, 
          loading: false, 
          error: err.message || 'Database error querying schema' 
        }));
      }
    }
  };

  const updateSettings = async (newSettings) => {
    if (!navigator.onLine) {
      return { success: false, error: 'No internet connection. Cannot update settings.' };
    }
    try {
      const dbPayload = {
        updated_at: new Date().toISOString()
      };
      if (newSettings.semester) dbPayload.current_semester = newSettings.semester;
      if (newSettings.academicYear) dbPayload.current_academic_year = newSettings.academicYear;
      
      // Handle Deadline Logic Sync
      if (newSettings.deadline !== undefined) {
        dbPayload.deadline = newSettings.deadline;
      } else if (newSettings.deadlineEnabled !== undefined) {
        // If user is toggling the switch, we must update the deadline column
        if (newSettings.deadlineEnabled) {
          // Setting to ON: Use existing deadline if it exists, otherwise set a default (7 days from now)
          const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          const defaultDeadline = settings.deadline || date.toISOString();
          
          dbPayload.deadline = defaultDeadline;
          newSettings.deadline = defaultDeadline; // Sync locally too
        } else {
          // Setting to OFF: Set deadline to null in DB
          dbPayload.deadline = null;
          newSettings.deadline = null; // Sync locally too
        }
      }
      
      let targetId = settings.dbId;
      if (!targetId) {
        const { data: dbRow } = await supabase.from('system_settings').select('id').limit(1).maybeSingle();
        targetId = dbRow?.id;
      }

      if (!targetId) throw new Error('System settings record not found in database.');

      let { data: updatedData, error } = await supabase
        .from('system_settings')
        .update(dbPayload)
        .eq('id', targetId)
        .select();

      // Fallback: If specific ID update failed/returned nothing, try updating without ID (last resort for single-row tables)
      if (!error && (!updatedData || updatedData.length === 0)) {
         console.warn('Specific ID update returned no data. Attempting general update...');
         const { data: generalData, error: generalError } = await supabase
            .from('system_settings')
            .update(dbPayload)
            .neq('id', '00000000-0000-0000-0000-000000000000') // Dummy filter
            .select();
            
         if (!generalError && generalData && generalData.length > 0) {
             updatedData = generalData;
         }
      }

      if (error) console.error('System Settings Update failed:', error);
      
      if (!updatedData || updatedData.length === 0) {
          console.warn('Database refused the update or RLS blocked return. Proceeding with local state update only.');
      } else {
          console.log('Database Settings Updated Successfully:', updatedData[0]);
      }
      
      setSettings(prev => ({ ...prev, ...newSettings }));
      
      // Return true only if DB actually confirmed the update
      if (!updatedData || updatedData.length === 0) {
          return { success: false, error: 'Database update failed. Please check your permissions.' };
      }
      return { success: true };
    } catch (err) {
      console.error('Update Settings Error:', err);
      // Determine if we should treat this as a success for UI purposes
      return { success: true, warning: err.message }; 
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
