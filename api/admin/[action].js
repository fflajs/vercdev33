// api/admin/[action].js
import { supabase } from '../db.js';

export default async function handler(req, res) {
  const { action } = req.query;

  try {
    switch (action) {
      /**
       * ------------------------
       * ITERATION MANAGEMENT
       * ------------------------
       */
      case 'active-iteration': {
        const { data, error } = await supabase
          .from('iterations')
          .select('*')
          .is('end_date', null)
          .single();

        if (error) throw error;
        return res.status(200).json({ success: true, iteration: data });
      }

      case 'iterations': {
        const { data, error } = await supabase
          .from('iterations')
          .select('*')
          .order('id', { ascending: false });

        if (error) throw error;
        return res.status(200).json({ success: true, iterations: data });
      }

      case 'create-iteration': {
        if (req.method !== 'POST') {
          return res.status(405).json({ success: false, message: 'Method not allowed' });
        }

        const { name, question_set } = req.body;

        // close any currently active iteration
        await supabase
          .from('iterations')
          .update({ end_date: new Date().toISOString() })
          .is('end_date', null);

        const { data, error } = await supabase
          .from('iterations')
          .insert([{ name, question_set }])
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ success: true, iteration: data });
      }

      case 'close-iteration': {
        if (req.method !== 'POST') {
          return res.status(405).json({ success: false, message: 'Method not allowed' });
        }

        const { id } = req.body;
        const { data, error } = await supabase
          .from('iterations')
          .update({ end_date: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ success: true, iteration: data });
      }

      /**
       * ------------------------
       * ORG DATA & UNITS
       * ------------------------
       */
      case 'org-data': {
        const { iteration_id } = req.query;

        const [iteration, units, roles, people] = await Promise.all([
          supabase.from('iterations').select('*').eq('id', iteration_id).single(),
          supabase.from('organization_units').select('*').eq('iteration_id', iteration_id),
          supabase.from('person_roles').select('*').eq('iteration_id', iteration_id),
          supabase.from('people').select('*'),
        ]);

        if (iteration.error) throw iteration.error;
        if (units.error) throw units.error;
        if (roles.error) throw roles.error;
        if (people.error) throw people.error;

        return res.status(200).json({
          success: true,
          iteration: iteration.data,
          units: units.data,
          roles: roles.data,
          people: people.data,
        });
      }

      case 'create-org-unit': {
        if (req.method !== 'POST') {
          return res.status(405).json({ success: false, message: 'Method not allowed' });
        }

        const { name, parent_id, iteration_id } = req.body;

        const { data, error } = await supabase
          .from('organization_units')
          .insert([{ name, parent_id, iteration_id }])
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ success: true, unit: data });
      }

      /**
       * ------------------------
       * ROLE MANAGEMENT
       * ------------------------
       */
      case 'assign-role': {
        if (req.method !== 'POST') {
          return res.status(405).json({ success: false, message: 'Method not allowed' });
        }

        const { person_id, org_unit_id, is_manager, iteration_id } = req.body;

        const { data, error } = await supabase
          .from('person_roles')
          .insert([{ person_id, org_unit_id, is_manager, iteration_id }])
          .select()
          .single();

        if (error) {
          // unique violation
          if (error.code === '23505') {
            return res.status(409).json({ success: false, message: 'This person already has that role in this org unit.' });
          }
          throw error;
        }

        return res.status(200).json({ success: true, role: data });
      }

      case 'delete-role': {
        if (req.method !== 'DELETE') {
          return res.status(405).json({ success: false, message: 'Method not allowed' });
        }

        const { role_id } = req.body;

        const { error } = await supabase.from('person_roles').delete().eq('id', role_id);
        if (error) throw error;

        return res.status(200).json({ success: true });
      }

      /**
       * ------------------------
       * DEFAULT
       * ------------------------
       */
      default:
        return res.status(404).json({ success: false, message: 'Unknown action' });
    }
  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

