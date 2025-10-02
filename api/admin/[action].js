import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function fail(res, message, status = 400, error = null) {
  log("❌ Error:", message, error || "");
  return res.status(status).json({ success: false, message, error });
}

export default async function handler(req, res) {
  const { method } = req;
  const { action } = req.query;
  const body = req.body;

  log(`➡️ Admin API called: action=${action}, method=${method}`);

  try {
    switch (action) {
      /**
       * ITERATIONS
       */
      case 'create-iteration':
        if (method !== 'POST') return fail(res, 'Method not allowed', 405);

        // Accept both { question_set } and { set } from frontend
        const { name, question_set, set } = body || {};
        const qs = question_set || set;

        if (!name || !qs) {
          return fail(res, 'Iteration name and question_set are required', 400);
        }

        log("Creating iteration with", { name, question_set: qs });

        // Close any currently active iteration
        await supabase
          .from('iterations')
          .update({ end_date: new Date().toISOString() })
          .is('end_date', null);

        // Insert new iteration
        const { data: newIter, error: iterError } = await supabase
          .from('iterations')
          .insert([{ name, question_set: qs, start_date: new Date().toISOString() }])
          .select()
          .single();

        if (iterError) return fail(res, 'Error creating iteration', 500, iterError);

        return res.status(201).json({ success: true, iteration: newIter });

      case 'active-iteration':
        if (method !== 'GET') return fail(res, 'Method not allowed', 405);

        const { data: activeIter, error: activeErr } = await supabase
          .from('iterations')
          .select('*')
          .is('end_date', null)
          .single();

        if (activeErr && activeErr.code !== 'PGRST116') {
          return fail(res, 'Error loading active iteration', 500, activeErr);
        }

        if (!activeIter) {
          return res.status(404).json({ success: false, message: 'No active iteration found' });
        }

        return res.status(200).json({ success: true, iteration: activeIter });

      case 'close-iteration':
        if (method !== 'POST') return fail(res, 'Method not allowed', 405);

        log("Closing current iteration...");

        const { error: closeErr } = await supabase
          .from('iterations')
          .update({ end_date: new Date().toISOString() })
          .is('end_date', null);

        if (closeErr) return fail(res, 'Error closing iteration', 500, closeErr);

        return res.status(200).json({ success: true, message: 'Iteration closed successfully' });

      /**
       * ORG-DATA (already fixed earlier)
       */
      case 'org-data':
        if (method !== 'GET') return fail(res, 'Method not allowed', 405);

        const { iteration_id } = req.query;
        log("Fetching org-data for iteration", iteration_id);

        const { data: units, error: unitErr } = await supabase
          .from('organization_units')
          .select(`
            id,
            name,
            parent_id,
            iteration_id,
            person_roles (
              id,
              is_manager,
              description,
              person:people(name)
            )
          `)
          .eq('iteration_id', iteration_id);

        if (unitErr) return fail(res, 'Error loading org data', 500, unitErr);

        return res.status(200).json({ success: true, units });

      default:
        return fail(res, `Unknown action: ${action}`, 400);
    }
  } catch (err) {
    return fail(res, 'Server error', 500, err);
  }
}

