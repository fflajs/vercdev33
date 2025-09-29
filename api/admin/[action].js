// api/admin/[action].js
import { supabase } from '../db.js';

export default async function handler(req, res) {
  const { action } = req.query;

  try {
    switch (action) {
      // ---------------------------
      // GET active iteration
      // ---------------------------
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

        return res.status(200).json({ success: true, iteration: data });
      }

      // ---------------------------
      // GET all iterations
      // ---------------------------
      case 'iterations': {
        const { data, error } = await supabase
          .from('iterations')
          .select('*')
          .order('id', { ascending: true });

        if (error) throw error;
        return res.status(200).json({ success: true, iterations: data });
      }

      // ---------------------------
      // GET org-data (units, roles, people for iteration)
      // ---------------------------
      case 'org-data': {
        const { iteration_id } = req.query;

        if (!iteration_id) {
          return res.status(400).json({ success: false, message: 'iteration_id is required' });
        }

        const [iterationRes, unitsRes, rolesRes, peopleRes] = await Promise.all([
          supabase.from('iterations').select('*').eq('id', iteration_id).maybeSingle(),
          supabase.from('organization_units').select('*').eq('iteration_id', iteration_id),
          supabase.from('person_roles').select('*').eq('iteration_id', iteration_id),
          supabase.from('people').select('*')
        ]);

        if (iterationRes.error) throw iterationRes.error;
        if (unitsRes.error) throw unitsRes.error;
        if (rolesRes.error) throw rolesRes.error;
        if (peopleRes.error) throw peopleRes.error;

        return res.status(200).json({
          success: true,
          iteration: iterationRes.data,
          units: unitsRes.data,
          roles: rolesRes.data,
          people: peopleRes.data
        });
      }

      // ---------------------------
      // POST create-org-unit
      // ---------------------------
      case 'create-org-unit': {
        if (req.method !== 'POST') {
          return res.status(405).json({ success: false, message: 'Method not allowed' });
        }

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
      }

      // ---------------------------
      // POST assign-role
      // ---------------------------
      case 'assign-role': {
        if (req.method !== 'POST') {
          return res.status(405).json({ success: false, message: 'Method not allowed' });
        }

        const { person_id, org_unit_id, iteration_id, is_manager } = req.body;
        if (!person_id || !org_unit_id || !iteration_id) {
          return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const { data, error } = await supabase
          .from('person_roles')
          .insert([{ person_id, org_unit_id, iteration_id, is_manager: !!is_manager }])
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            return res.status(409).json({ success: false, message: 'This person is already assigned to that org unit/role' });
          }
          throw error;
        }

        return res.status(200).json({ success: true, role: data });
      }

      // ---------------------------
      // DELETE role
      // ---------------------------
      case 'delete-role': {
        if (req.method !== 'DELETE') {
          return res.status(405).json({ success: false, message: 'Method not allowed' });
        }

        const { role_id } = req.body;
        if (!role_id) {
          return res.status(400).json({ success: false, message: 'role_id is required' });
        }

        const { error } = await supabase.from('person_roles').delete().eq('id', role_id);
        if (error) throw error;

        return res.status(200).json({ success: true, message: 'Role deleted successfully' });
      }

      // ---------------------------
      // POST close-iteration
      // ---------------------------
      case 'close-iteration': {
        if (req.method !== 'POST') {
          return res.status(405).json({ success: false, message: 'Method not allowed' });
        }

        const { id } = req.body;
        if (!id) {
          return res.status(400).json({ success: false, message: 'id is required' });
        }

        const { data, error } = await supabase
          .from('iterations')
          .update({ end_date: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ success: true, iteration: data });
      }

      // ---------------------------
      // default: invalid action
      // ---------------------------
      default:
        return res.status(404).json({ success: false, message: `Unknown admin action: ${action}` });
    }
  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

