// api/admin/org-data.js
import { supabase } from '../db.js';

export default async function handler(req, res) {
  try {
    const { iteration_id } = req.query;

    if (!iteration_id) {
      return res.status(400).json({ success: false, message: "iteration_id is required" });
    }

    // Get iteration
    const { data: iteration, error: iterError } = await supabase
      .from('iterations')
      .select('*')
      .eq('id', iteration_id)
      .single();

    if (iterError) throw iterError;

    // Get org units
    const { data: units, error: unitError } = await supabase
      .from('organization_units')
      .select('*')
      .eq('iteration_id', iteration_id);

    if (unitError) throw unitError;

    // Get roles
    const { data: roles, error: roleError } = await supabase
      .from('person_roles')
      .select('*')
      .eq('iteration_id', iteration_id);

    if (roleError) throw roleError;

    // Get people (all, so names can be matched)
    const { data: people, error: peopleError } = await supabase
      .from('people')
      .select('*');

    if (peopleError) throw peopleError;

    return res.status(200).json({
      success: true,
      iteration,
      units,
      roles,
      people
    });
  } catch (error) {
    console.error("Admin API error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

