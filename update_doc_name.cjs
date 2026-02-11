
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function renameDocument() {
  console.log('Fetching checklists...');
  const { data: checklists, error } = await supabase
    .from('checklists')
    .select('id, other_docs');

  if (error) {
    console.error('Error fetching checklists:', error);
    return;
  }

  console.log(`Checking ${checklists.length} checklists...`);

  for (const checklist of checklists) {
    let changed = false;
    const updatedOtherDocs = checklist.other_docs.map(doc => {
      if (doc.name === 'Student Consultation') {
        changed = true;
        return { ...doc, name: 'Student Consultation Form' };
      }
      return doc;
    });

    if (changed) {
      console.log(`Updating checklist ${checklist.id}...`);
      const { error: updateError } = await supabase
        .from('checklists')
        .update({ other_docs: updatedOtherDocs })
        .eq('id', checklist.id);

      if (updateError) {
        console.error(`Error updating checklist ${checklist.id}:`, updateError);
      }
    }
  }

  console.log('Done!');
}

renameDocument();
