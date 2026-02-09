const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function testInsert() {
    // Get a faculty ID
    const { data: profiles } = await supabase.from('faculty_profiles').select('id').limit(1);
    if (!profiles || profiles.length === 0) {
        console.log('No profiles found');
        return;
    }
    const fid = profiles[0].id;
    const term = '2027-2028-FIRST SEMESTER';

    console.log('Testing insert for profile:', fid);

    const { data, error } = await supabase.from('checklists').insert({
        faculty_id: fid,
        term_id: term,
        status: 'pending',
        subjects: [],
        other_docs: []
    });

    if (error) {
        console.error('Insert Error:', error.message);
        console.error('Code:', error.code);
    } else {
        console.log('Insert Success');
    }
}

testInsert();
