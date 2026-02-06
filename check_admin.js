import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bqbxaqthcyyfyiiroixa.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxYnhhcXRoY3l5ZnlpaXJvaXhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMTE0NjIsImV4cCI6MjA4NTc4NzQ2Mn0.ehU4mNKDIW19PN4FP4wTN2t9veZSLIVhaFV2L84zPl8';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkAdmin() {
  const email = 'jonarzabala@nvsu.edu.ph';
  console.log('Checking profile for:', email);
  
  const { data, error } = await supabase
    .from('faculty_profiles')
    .select('*')
    .eq('email', email)
    .single();

  if (error) {
    console.log('❌ Error: Profile not found for this email in faculty_profiles table.');
    console.log('Details:', error.message);
  } else {
    console.log('✅ Profile found:');
    console.log('Role:', data.role);
    console.log('ID:', data.id);
  }
}

checkAdmin();
