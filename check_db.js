const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
async function run() {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(3);
  console.log(JSON.stringify({data, error}, null, 2));
}
run();
