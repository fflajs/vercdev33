// api/admin/[action].js
import { supabase } from '../db.js';

export default async function handler(req, res) {
  const {
    query: { action },
    method,
    body,
  } = req;

  console.log(`[API CALL] action=${action}, method=${method}`);

  try {
    switch (action) {
      /**
       * PEOPLE MANAGEMENT
       */
      case 'people':
        if (method === 'GET') {
          const { data, error } = await supabase.from('people').select('*');
          if (error) throw error;
          console.log("[API] fetched people:", data.length);
          return res.status(200).json({ success: true, people: data });
        }

        if (method === 'POST') {
          const { name } = body;
          if (!name) {
            return res.status(400).json({
              success: false,
              message: 'Name is required',
            });
          }

          const { data, error } = await supabase
            .from('people')
            .insert([{ name }])
            .select()
            .single();

          console.log("[API] insert person result:", { data, error });

          if (error) {
            if (error.code === '23505') {
              return res.status(409).json({
                success: false,
                message: `Name "${name}" already exists.`,
              });
            }
            throw error;
          }

          return res.status(201).json({ success: true, person: data });
        }
        break;

      /**
       * ITERATIONS
       */
      case 'iterations':
        if (method === 'GET') {
          const { data, error } = await supabase.from('iterations').select('*');
          if (error) throw error;
          console.log("[API] fetched iterations:", data.length);
          return res.status(200).json({ success: true, iterations: data });
        }
        break;

      case 'active-iteration':
        if (method === 'GET') {
          const { data, error } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .maybeSingle();

          if (error) throw error;
          if (!data) {
            return res.status(404).json({
              success: false,
              message: 'No active iteration found',
            });
          }
          console.log("[API] active iteration:", data);
          return res.status(200).json({ success: true, iteration: data });
        }
        break;

      /**
       * TABLE VIEWER – GENERIC FETCH
       */
      case 'table-data':
        if (method === 'GET') {
          const { table } = req.query;
          console.log(`[API] fetching table-data for: ${table}`);

          if (
            !['people', 'iterations', 'organization_units', 'person_roles'].includes(
              table
            )
          ) {
            return res
              .status(400)
              .json({ success: false, message: 'Invalid table requested' });
          }

          const { data, error } = await supabase.from(table).select('*');
          if (error) throw error;

          console.log(`[API] rows fetched from ${table}:`, data.length);
          return res.status(200).json({ success: true, rows: data });
        }
        break;

      default:
        return res
          .status(404)
          .json({ success: false, message: `Unknown action: ${action}` });
    }

    return res
      .status(405)
      .json({ success: false, message: 'Method not allowed' });
  } catch (err) {
    console.error('Admin API error:', err);
    return res
      .status(500)
      .json({ success: false, message: err.message || 'Internal server error' });
  }
}

