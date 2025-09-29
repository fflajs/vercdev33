// api/admin/[action].js
import { supabase } from '../db.js';

export default async function handler(req, res) {
  const { action } = req.query;

  try {
    switch (action) {
      case 'active-iteration': {
        const { data, error } = await supabase
          .from('iterations')
          .select('*')
          .is('end_date', null)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          return res.status(404).json({ success: false, message: 'No active iteration found' });
        }
        return res.json({ success: true, iteration: data });
      }

      case 'iterations': {
        const { data, error } = await supabase.from('iterations').select('*');
        if (error) throw error;
        return res.json({ success: true, iterations: data });
      }

      case 'org-data': {
        const { iteration_id } = req.query;
        if (!iteration_id) {
          return res.status(400).json({ success: false, message: 'iteration_id is required' });
        }

        const [iteration, units, roles, people] = await Promise.all([
          supabase.from('iterations').select('*').eq('id', iteration_id).maybeSingle(),
          supabase.from('organization_units').select('*').eq('iteration_id', iteration_id),
          supabase.from('roles').select('*').eq('iteration_id', iteration_id),
          supabase.from('people').select('*'),
        ]);

        if (iteration.error) throw iteration.error;
        if (units.error) throw units.error;
        if (roles.error) throw roles.error;
        if (people.error) throw people.error;

        return res.json({
          success: true,
          iteration: iteration.data,
          units: units.data,
          roles: roles.data,
          people: people.data,
        });
      }

      case 'create-org-unit': {
        if (req.method !== 'POST') return res.status(405).end();
        const { name, parent_id, iteration_id } = req.body;
        if (!name || !iteration_id) {
          return res.status(400).json({ success: false, message: 'Missing fields' });
        }
        const { data, error } = await supabase
          .from('organization_units')
          .insert([{ name, parent_id, iteration_id }])
          .select()
          .single();
        if (error) throw error;
        return res.json({ success: true, unit: data });
      }

      case 'assign-role': {
        if (req.method !== 'POST') return res.status(405).end();
        const { person_id, org_unit_id, iteration_id, is_manager } = req.body;
        if (!person_id || !org_unit_id || !iteration_id) {
          return res.status(400).json({ success: false, message: 'Missing fields' });
        }
        const { data, error } = await supabase
          .from('roles')
          .insert([{ person_id, org_unit_id, iteration_id, is_manager }])
          .select()
          .single();
        if (error) {
          if (error.code === '23505') {
            return res.status(409).json({ success: false, message: 'Duplicate role not allowed' });
          }
          throw error;
        }
        return res.json({ success: true, role: data });
      }

      case 'delete-role': {
        if (req.method !== 'POST') return res.status(405).end();
        const { role_id } = req.body;
        if (!role_id) {
          return res.status(400).json({ success: false, message: 'role_id is required' });
        }
        const { error } = await supabase.from('roles').delete().eq('id', role_id);
        if (error) throw error;
        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

