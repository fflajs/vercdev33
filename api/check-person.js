// api/check-person.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // must be service role key
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
    // look for existing person
    const { data: person, error } = await supabase
      .from('people')
      .select('*')
      .eq('name', name)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!person) {
      // not found → insert new
      const { data: newPerson, error: insertError } = await supabase
        .from('people')
        .insert([{ name }])
        .select()
        .single();

      if (insertError) throw insertError;

      return res.status(201).json({ success: true, message: 'Person created', person: newPerson });
    }

    return res.status(200).json({ success: true, message: 'Login successful', person });
  } catch (err) {
    console.error('Supabase error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

