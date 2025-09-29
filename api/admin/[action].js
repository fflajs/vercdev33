// api/admin/[action].js
import { supabase } from '../db.js';

export default async function handler(req, res) {
  const { action } = req.query;

  try {
    switch (action) {
      case 'active-iteration': {
        if (req.method !== 'GET') {
          return res.status(405).json({ success: false, message: 'Method not allowed' });
        }
        const { data, error } = await supabase
          .from('iterations')
          .select('*')
          .is('end_date', null)
          .single();

        if (error) throw error;
        return res.status(200).json({ success: true, iteration: data });
      }

      case 'delete-role': {
        if (req.method !== 'POST') {
          return res.status(405).json({ success: false, message: 'Method not allowed' });
        }

        const { id } = req.body;
        if (!id) {
          return res.status(400).json({ success: false, message: 'Missing role id' });
        }

        const { error } = await supabase
          .from('person_roles')
          .delete()
          .eq('id', id);

        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      default:
        return res.status(404).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`❌ Admin API error [${action}]:`, err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

