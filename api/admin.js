// api/admin.js
import { supabase } from '../db.js';

export default async function handler(req, res) {
  const { action } = req.query;

  try {
    switch (action) {
      // --- Active Iteration ---
      case 'active-iteration': {
        const { data, error } = await supabase
          .from('iterations')
          .select('*')
          .is('end_date', null)
          .single();

        if (error) throw error;

        return res.status(200).json({ success: true, iteration: data });
      }

      // --- List Iterations ---
      case 'iterations': {
        const { data, error } = await supabase
          .from('iterations')
          .select('*')
          .order('id', { ascending: true });

        if (error) throw error;

        return res.status(200).json({ success: true, iterations: data });
      }

      // --- Org Data (units + roles + people) ---
      case 'org-data': {
        const { iteration_id } = req.query;

        if (!iteration_id) {
          return res.status(400).json({ success: false, message: "iteration_id is required" });
        }

        const iterationId = parseInt(iteration_id);

        // fetch iteration
        const { data: iteration, error: iterError } = await supabase
          .from('iterations')
          .select('*')
          .eq('id', iterationId)
          .single();

        if (iterError) throw iterError;

        // fetch only org units from this iteration
        const { data: units, error: unitsError } = await supabase
          .from('organization_units')
          .select('*')
          .eq('iteration_id', iterationId);

        if (unitsError) throw unitsError;

        // fetch roles only from this iteration
        const { data: roles, error: rolesError } = await supabase
          .from('person_roles')
          .select('*')
          .eq('iteration_id', iterationId);

        if (rolesError) throw rolesError;

        // fetch all people (global)
        const { data: people, error: peopleError } = await supabase
          .from('people')
          .select('*');

        if (peopleError) throw peopleError;

        return res.status(200).json({
          success: true,
          iteration,
          units,
          roles,
          people,
        });
      }

      // --- Create Iteration ---
      case 'create-iteration': {
        const { name, question_set } = req.body;

        const { data, error } = await supabase
          .from('iterations')
          .insert([{ name, question_set }])
          .select()
          .single();

        if (error) throw error;

        return res.status(201).json({ success: true, iteration: data });
      }

      // --- Close Iteration ---
      case 'close-iteration': {
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

      // --- Create Org Unit ---
      case 'create-org-unit': {
        const { name, parent_id, iteration_id } = req.body;

        const { data, error } = await supabase
          .from('organization_units')
          .insert([{ name, parent_id, iteration_id }])
          .select()
          .single();

        if (error) throw error;

        return res.status(201).json({ success: true, unit: data });
      }

      // --- Assign Role ---
      case 'assign-role': {
        const { person_id, org_unit_id, is_manager, iteration_id } = req.body;

        const { data, error } = await supabase
          .from('person_roles')
          .insert([{ person_id, org_unit_id, is_manager, iteration_id }])
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            return res.status(409).json({
              success: false,
              message: 'This person already has this role in this org unit for this iteration.',
            });
          }
          throw error;
        }

        return res.status(201).json({ success: true, role: data });
      }

      // --- Delete Role ---
      case 'delete-role': {
        const { role_id } = req.body;

        const { error } = await supabase
          .from('person_roles')
          .delete()
          .eq('id', role_id);

        if (error) throw error;

        return res.status(200).json({ success: true });
      }

      // --- List People ---
      case 'people': {
        const { data, error } = await supabase
          .from('people')
          .select('*')
          .order('id', { ascending: true });

        if (error) throw error;

        return res.status(200).json({ success: true, people: data });
      }

      default:
        return res.status(404).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

