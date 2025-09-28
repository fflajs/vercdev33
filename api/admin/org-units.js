// api/admin/org-units.js
import { supabase } from '../dbClient.js';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { name, parent_id, iteration_id } = req.body;

      if (!name || !iteration_id) {
        return res.status(400).json({ success: false, message: 'Name and iteration_id are required' });
      }

      const { data, error } = await supabase
        .from('organization_units')
        .insert([{ name, parent_id: parent_id || null, iteration_id }])
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({ success: true, unit: data });
    } catch (err) {
      console.error('Error creating org unit:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // fallback for unsupported methods
  res.setHeader('Allow', ['POST']);
  return res.status(405).json({ success: false, message: `Method ${req.method} Not Allowed` });
}

