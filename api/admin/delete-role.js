// api/admin/delete-role.js
import { supabase } from '../db.js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res
      .status(405)
      .json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { role_id } = req.body;

    if (!role_id) {
      return res
        .status(400)
        .json({ success: false, message: 'Missing role_id' });
    }

    const { error } = await supabase
      .from('person_roles')
      .delete()
      .eq('id', role_id);

    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Delete role error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

