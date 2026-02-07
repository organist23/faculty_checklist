import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vxdxbavhinhcekaclatw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4ZHhiYXZoaW5oY2VrYWNsYXR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjM2NzksImV4cCI6MjA4NTc5OTY3OX0.lThcuKEGm8fWeACMhildE_xrixQhTo_tFxpZHIJfDfQ';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function listUsers() {
  console.log('--- RECOVERY CHECK ---');
  const { data, error } = await supabase
    .from('faculty_profiles')
    .select('email, name, role, visible_password');

  if (error) {
    console.log('Error:', error.message);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

listUsers();
