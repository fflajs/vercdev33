// api/index.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  try {
    // test query: fetch server time via Postgres function
    const { data, error } = await supabase.rpc('now');
    if (error) throw error;

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Supabase query failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

