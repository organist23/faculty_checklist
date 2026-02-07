
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function tryLogin(email, password) {
  console.log(`Trying login for ${email} with password '${password}'...`);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.log(`❌ Failed: ${error.message}`);
    return false;
  } else {
    console.log(`✅ Success! User ID: ${data.user.id}`);
    return true;
  }
}

async function checkCommon() {
  const email = 'admin@nvsu.edu.ph';
  const passwords = ['admin', 'admin123', 'password', 'password123', 'admin@nvsu', '123456', '12345678', 'nvsu123', 'nvsu2025'];
  
  for (const pwd of passwords) {
    if (await tryLogin(email, pwd)) break;
  }
}

checkCommon();
