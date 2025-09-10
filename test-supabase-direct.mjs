import { createClient } from '@supabase/supabase-js';

const url = 'http://localhost:54321';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

async function testConnection() {
  console.log('Creating Supabase client with:');
  console.log('URL:', url);
  console.log('Key length:', serviceKey.length);
  
  const supabase = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: 'public',
    },
  });
  
  console.log('Client created:', !!supabase);
  console.log('Client has from method:', typeof supabase.from);
  
  console.log('\nTrying to query devices table...');
  const result = await supabase
    .from('devices')
    .select('device_id')
    .limit(1);
  
  console.log('Query result type:', typeof result);
  console.log('Query result:', JSON.stringify(result, null, 2));
  
  if (result && result.error) {
    console.log('Error:', result.error);
  } else if (result && result.data) {
    console.log('Success! Found', result.data.length, 'devices');
  } else {
    console.log('Unexpected result - neither error nor data');
  }
}

testConnection().catch(console.error);