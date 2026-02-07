import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function listUsers() {
  console.log('--- DB USER CHECK ---');
  console.log('Project:', process.env.VITE_SUPABASE_URL);
  
  const { data, error } = await supabase
    .from('faculty_profiles')
    .select('email, name, role, visible_password');

  if (error) {
    console.log('❌ Error fetching profiles:', error.message);
    return;
  }

  console.log(`Found ${data.length} registered profiles:`);
  data.forEach(p => {
    console.log(`- [${p.role.toUpperCase()}] ${p.email} | Name: ${p.name} | Pwd: ${p.visible_password || '********'}`);
  });
  console.log('---------------------');
}

listUsers();
