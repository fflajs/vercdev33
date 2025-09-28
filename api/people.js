// api/people.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Name is required' });
  }

  try {
    const { data, error } = await supabase
      .from('people')
      .insert([{ name }])
      .select()
      .single();

    if (error) {
      // duplicate constraint
      if (error.code === '23505') {
        return res.status(409).json({ success: false, message: `Name "${name}" already exists.` });
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      message: `Person "${name}" created successfully.`,
      person: data
    });
  } catch (err) {
    console.error('Supabase error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

