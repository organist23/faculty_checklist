
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function check() {
  const { data, count, error } = await supabase
    .from('faculty_profiles')
    .select('*', { count: 'exact' });
  
  if (error) console.error(error);
  else {
    console.log('Profile Count:', count);
    console.log('Profiles:', data);
  }
}
check();
