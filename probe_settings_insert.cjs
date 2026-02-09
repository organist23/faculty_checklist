const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function probe() {
    console.log('--- Probing System Settings INSERT ---');
    
    // Attempt to insert a new settings row
    const newSetting = {
        current_semester: 'PROBE SEMESTER',
        current_academic_year: '2099-2100',
        deadline: null
    };
    
    const { data, error } = await supabase.from('system_settings').insert(newSetting).select();
    
    if (error) {
        console.error('INSERT FAILED:', error);
    } else {
        console.log('INSERT SUCCESS:', data);
        // Clean up
        await supabase.from('system_settings').delete().eq('id', data[0].id);
    }
    process.exit(0);
}

probe();
