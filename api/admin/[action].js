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
      // ... (other cases remain unchanged)

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

      /**
       * RESET TEST DATA
       */
      case 'reset-test-data':
        if (method === 'POST') {
          console.log("[API] Resetting test data…");

          // ⚠️ This truncates all key tables
          const queries = [
            'TRUNCATE TABLE person_roles RESTART IDENTITY CASCADE',
            'TRUNCATE TABLE organization_units RESTART IDENTITY CASCADE',
            'TRUNCATE TABLE people RESTART IDENTITY CASCADE',
            'TRUNCATE TABLE iterations RESTART IDENTITY CASCADE',
          ];

          for (let q of queries) {
            const { error } = await supabase.rpc('exec_sql', { sql: q });
            if (error) {
              console.error("[API] reset error:", error);
              return res.status(500).json({
                success: false,
                message: `Failed executing: ${q}`,
              });
            }
          }

          // Insert a seed iteration
          const { data: seed, error: seedErr } = await supabase
            .from('iterations')
            .insert([{ name: 'Iteration Seed', question_set: 'Pulse_Check_12.json' }])
            .select()
            .single();

          if (seedErr) throw seedErr;

          console.log("[API] Reset complete. New seed iteration:", seed);
          return res.status(200).json({
            success: true,
            message: 'Database reset complete',
            iteration: seed,
          });
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

