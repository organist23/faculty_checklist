
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function check() {
  const { count, error } = await supabase
    .from('checklists')
    .select('*', { count: 'exact', head: true });
  
  if (error) console.error(error);
  else console.log('Count:', count);
}
check();
