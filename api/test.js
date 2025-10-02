// api/test.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  try {
    // Query first 5 people
    const { data, error } = await supabase
      .from('people')
      .select('*')
      .limit(5);

    if (error) throw error;

    return res.status(200).json({ success: true, people: data });
  } catch (err) {
    console.error("Test API error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

