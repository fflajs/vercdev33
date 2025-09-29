// api/check-person.js
import { supabase } from './db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const { data, error } = await supabase
      .from('people')
      .select('*')
      .eq('name', name)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, message: 'Person not found' });
    }

    res.status(200).json({ success: true, person: data });
  } catch (err) {
    console.error('check-person error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

