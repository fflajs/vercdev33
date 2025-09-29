// api/db.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate environment variables at startup
if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing required Supabase environment variables.");
  if (!supabaseUrl) console.error("Missing SUPABASE_URL");
  if (!supabaseServiceKey) console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  throw new Error("Supabase environment variables are not set correctly.");
}

// Create Supabase client (service role = full read/write access)
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false, // No local storage in serverless functions
  },
});

// Small helper to test connection
export async function testConnection() {
  try {
    const { data, error } = await supabase.from('people').select('id').limit(1);
    if (error) {
      console.error("❌ Supabase connection test failed:", error.message);
      return false;
    }
    console.log("✅ Supabase connection test OK");
    return true;
  } catch (err) {
    console.error("❌ Unexpected Supabase connection error:", err);
    return false;
  }
}

