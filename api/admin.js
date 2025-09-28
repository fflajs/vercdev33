// api/admin.js
import { supabase } from './dbClient.js';

export default async function handler(req, res) {
  const { url, method } = req;

  try {
    // -----------------------------
    // ACTIVE ITERATION (GET)
    // -----------------------------
    if (url.startsWith('/api/admin/active-iteration') && method === 'GET') {
      const { data, error } = await supabase
        .from('iterations')
        .select('*')
        .is('end_date', null)
        .order('start_date', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, message: 'No active iteration found' });

      return res.status(200).json({ success: true, iteration: data });
    }

    // -----------------------------
    // CREATE ITERATION (POST)
    // -----------------------------
    if (url.startsWith('/api/admin/create-iteration') && method === 'POST') {
      const { name, question_set } = req.body;
      if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

      const { data, error } = await supabase
        .from('iterations')
        .insert([{ name, question_set: question_set || 'Pulse_Check_12.json' }])
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, iteration: data });
    }

    // -----------------------------
    // CLOSE ITERATION (POST)
    // -----------------------------
    if (url.startsWith('/api/admin/close-iteration') && method === 'POST') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ success: false, message: 'Iteration id required' });

      const { data, error } = await supabase
        .from('iterations')
        .update({ end_date: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, iteration: data });
    }

    // -----------------------------
    // LIST ITERATIONS (GET)
    // -----------------------------
    if (url.startsWith('/api/admin/iterations') && method === 'GET') {
      const { data, error } = await supabase.from('iterations').select('*').order('start_date');
      if (error) throw error;
      return res.status(200).json({ success: true, iterations: data });
    }

    // -----------------------------
    // ORG UNITS (POST new sub-org)
    // -----------------------------
    if (url.startsWith('/api/admin/org-units') && method === 'POST') {
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

    // -----------------------------
    // ORG DATA (GET)
    // -----------------------------
    if (url.startsWith('/api/admin/org-data') && method === 'GET') {
      const iteration_id = req.query?.iteration_id || new URL(req.url, `http://${req.headers.host}`).searchParams.get('iteration_id');

      if (!iteration_id) {
        return res.status(400).json({ success: false, message: 'iteration_id is required' });
      }

      const { data: units, error: unitError } = await supabase
        .from('organization_units')
        .select('*')
        .eq('iteration_id', iteration_id);

      if (unitError) throw unitError;

      const { data: roles, error: roleError } = await supabase
        .from('person_roles')
        .select('*')
        .eq('iteration_id', iteration_id);

      if (roleError) throw roleError;

      const { data: people, error: peopleError } = await supabase
        .from('people')
        .select('*');

      if (peopleError) throw peopleError;

      return res.status(200).json({ success: true, units, roles, people });
    }

    // -----------------------------
    // FALLBACK
    // -----------------------------
    res.status(404).json({ success: false, message: 'Not found' });
  } catch (err) {
    console.error('Admin API error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

