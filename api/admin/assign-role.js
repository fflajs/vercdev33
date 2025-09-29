// api/admin/assign-role.js
import { supabase } from '../db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { person_id, org_unit_id, is_manager, description, iteration_id } = req.body;

    if (!person_id || !org_unit_id || !iteration_id) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const { data, error } = await supabase
      .from('person_roles')
      .insert([{ person_id, org_unit_id, is_manager, description, iteration_id }])
      .select();

    if (error) throw error;

    return res.status(200).json({ success: true, role: data[0] });
  } catch (err) {
    console.error('Assign role error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

