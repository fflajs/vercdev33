import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ message: 'Iteration ID is required' });
  }

  try {
    const { data, error } = await supabase
      .from('iterations')
      .update({ end_date: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({ success: true, iteration: data });
  } catch (err) {
    console.error('Supabase error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

