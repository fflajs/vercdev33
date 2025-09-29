// api/admin/[action].js
import { supabase } from '../db.js';

export default async function handler(req, res) {
  const { action } = req.query;

  try {
    if (req.method === 'GET') {
      // --- Get active iteration ---
      if (action === 'active-iteration') {
        const { data, error } = await supabase
          .from('iterations')
          .select('*')
          .is('end_date', null)
          .single();

        if (error) throw error;
        return res.status(200).json({ success: true, iteration: data });
      }

      // --- List all iterations ---
      if (action === 'iterations') {
        const { data, error } = await supabase
          .from('iterations')
          .select('*')
          .order('id', { ascending: false });

        if (error) throw error;
        return res.status(200).json({ success: true, iterations: data });
      }

      // --- Load org-data (units, roles, people) ---
      if (action === 'org-data') {
        const { iteration_id } = req.query;

        const { data: iteration, error: iterErr } = await supabase
          .from('iterations')
          .select('*')
          .eq('id', iteration_id)
          .single();
        if (iterErr) throw iterErr;

        const { data: units, error: unitErr } = await supabase
          .from('organization_units')
          .select('*')
          .eq('iteration_id', iteration_id);
        if (unitErr) throw unitErr;

        const { data: roles, error: roleErr } = await supabase
          .from('person_roles') // ✅ FIXED
          .select('*')
          .eq('iteration_id', iteration_id);
        if (roleErr) throw roleErr;

        const { data: people, error: peopleErr } = await supabase
          .from('people')
          .select('*');
        if (peopleErr) throw peopleErr;

        return res.status(200).json({
          success: true,
          iteration,
          units,
          roles,
          people,
        });
      }

      // --- List all people ---
      if (action === 'people') {
        const { data, error } = await supabase
          .from('people')
          .select('*')
          .order('id');
        if (error) throw error;
        return res.status(200).json({ success: true, people: data });
      }
    }

    if (req.method === 'POST') {
      // --- Create iteration ---
      if (action === 'create-iteration') {
        const { name, question_set } = req.body;

        const { data, error } = await supabase
          .from('iterations')
          .insert([{ name, question_set }])
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ success: true, iteration: data });
      }

      // --- Close iteration ---
      if (action === 'close-iteration') {
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

      // --- Create org unit ---
      if (action === 'create-org-unit') {
        const { name, parent_id, iteration_id } = req.body;

        const { data, error } = await supabase
          .from('organization_units')
          .insert([{ name, parent_id, iteration_id }])
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ success: true, unit: data });
      }

      // --- Assign role ---
      if (action === 'assign-role') {
        const { person_id, org_unit_id, is_manager, iteration_id } = req.body;

        const { data, error } = await supabase
          .from('person_roles') // ✅ FIXED
          .insert([{ person_id, org_unit_id, is_manager, iteration_id }])
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ success: true, role: data });
      }

      // --- Delete role ---
      if (action === 'delete-role') {
        const { id } = req.body;

        const { error } = await supabase
          .from('person_roles') // ✅ FIXED
          .delete()
          .eq('id', id);

        if (error) throw error;
        return res.status(200).json({ success: true });
      }
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

