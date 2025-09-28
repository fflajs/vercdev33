// api/admin/create-org-unit.js
import { supabase } from '../db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { name, parent_id, iteration_id } = req.body;

    if (!name || !iteration_id) {
      return res.status(400).json({ success: false, message: 'Missing name or iteration_id' });
    }

    const { data, error } = await supabase
      .from('organization_units')
      .insert([{ name, parent_id: parent_id || null, iteration_id }])
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({ success: true, unit: data });
  } catch (err) {
    console.error('Create org unit failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

