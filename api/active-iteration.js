// api/active-iteration.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase
      .from('iterations')
      .select('*')
      .is('end_date', null)            // only active ones
      .order('start_date', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, message: 'No active iteration found' });
    }

    const iteration = data[0];
    res.status(200).json({ success: true, iteration });
  } catch (err) {
    console.error('Supabase error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

