// api/admin/[action].js
import { supabase } from '../db.js';

/**
 * Small helper for consistent debug logging with timestamps.
 */
const log = (...args) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}]`, ...args);
};

export default async function handler(req, res) {
  const {
    query: { action },
    method,
  } = req;

  log('➡️ Admin API called:', { action, method });

  try {
    switch (action) {
      /**
       * TABLE VIEWER (read-only, whitelisted tables)
       * GET /api/admin/table-viewer?table=people
       */
      case 'table-viewer': {
        if (method !== 'GET') break;
        const table = String(req.query.table || '').trim();

        const whitelist = new Set([
          'people',
          'iterations',
          'organization_units',
          'person_roles',
          'surveys',
          'app_data',
        ]);
        if (!whitelist.has(table)) {
          return res
            .status(400)
            .json({ success: false, message: `Unknown table: ${table}` });
        }

        const { data, error } = await supabase.from(table).select('*');
        if (error) {
          log('❌ table-viewer error:', error);
          return res
            .status(500)
            .json({ success: false, message: 'DB error', error });
        }
        return res.status(200).json({ success: true, rows: data || [] });
      }

      /**
       * PEOPLE
       * GET  /api/admin/people
       * POST /api/admin/people  { name }
       */
      case 'people': {
        if (method === 'GET') {
          const { data, error } = await supabase.from('people').select('*');
          if (error) throw error;
          return res.status(200).json({ success: true, people: data || [] });
        }

        if (method === 'POST') {
          const { name } = req.body || {};
          if (!name || !String(name).trim()) {
            return res
              .status(400)
              .json({ success: false, message: 'Name is required' });
          }
          const { data, error } = await supabase
            .from('people')
            .insert([{ name: String(name).trim() }])
            .select()
            .single();

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
      }

      /**
       * ITERATIONS
       * GET  /api/admin/iterations
       * GET  /api/admin/active-iteration
       * POST /api/admin/create-iteration  { name, question_set }
       * POST /api/admin/close-iteration   { id }
       */
      case 'iterations': {
        if (method === 'GET') {
          const { data, error } = await supabase
            .from('iterations')
            .select('*')
            .order('id', { ascending: true });
          if (error) throw error;
          return res.status(200).json({ success: true, iterations: data || [] });
        }
        break;
      }

      case 'active-iteration': {
        if (method !== 'GET') break;
        const { data, error } = await supabase
          .from('iterations')
          .select('*')
          .is('end_date', null)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            // 0 rows
            return res
              .status(404)
              .json({ success: false, message: 'No active iteration found' });
          }
          log('❌ active-iteration error:', error);
          return res
            .status(500)
            .json({ success: false, message: 'DB error', error });
        }
        return res.status(200).json({ success: true, iteration: data });
      }

      case 'create-iteration': {
        if (method !== 'POST') break;
        const { name, question_set } = req.body || {};
        if (!name || !question_set) {
          return res.status(400).json({
            success: false,
            message: 'name and question_set are required',
          });
        }

        // Ensure there is no active iteration
        const { data: active, error: errAct } = await supabase
          .from('iterations')
          .select('id')
          .is('end_date', null)
          .maybeSingle();
        if (errAct) throw errAct;
        if (active) {
          return res.status(409).json({
            success: false,
            message: 'Close the active iteration before creating a new one.',
          });
        }

        // Create new iteration
        const { data: newIter, error: errNew } = await supabase
          .from('iterations')
          .insert([{ name, question_set }])
          .select()
          .single();
        if (errNew) throw errNew;

        return res.status(201).json({ success: true, iteration: newIter });
      }

      case 'close-iteration': {
        if (method !== 'POST') break;
        const { id } = req.body || {};
        if (!id) {
          return res
            .status(400)
            .json({ success: false, message: 'Iteration ID required' });
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

      /**
       * ORG DATA
       * GET  /api/admin/org-data?iteration_id=ID
       * POST /api/admin/create-org-unit           { name, parent_id, iteration_id }
       * POST /api/admin/assign-role               { person_id, org_unit_id, is_manager, iteration_id }
       * DELETE /api/admin/delete-role             { id }
       * DELETE /api/admin/delete-org-unit         { id }
       */
      case 'org-data': {
        if (method !== 'GET') break;
        const iteration_id = req.query.iteration_id;
        if (!iteration_id) {
          return res
            .status(400)
            .json({ success: false, message: 'iteration_id is required' });
        }

        log('ℹ️ org-data for iteration', iteration_id);

        const { data: iteration, error: errIter } = await supabase
          .from('iterations')
          .select('*')
          .eq('id', iteration_id)
          .single();
        if (errIter) {
          log('❌ org-data iteration error', errIter);
          return res
            .status(500)
            .json({ success: false, message: 'Error loading iteration', error: errIter });
        }

        const { data: units, error: errUnits } = await supabase
          .from('organization_units')
          .select('*')
          .eq('iteration_id', iteration_id)
          .order('id', { ascending: true });
        if (errUnits) {
          log('❌ org-data units error', errUnits);
          return res
            .status(500)
            .json({ success: false, message: 'Error loading units', error: errUnits });
        }

        const { data: roles, error: errRoles } = await supabase
          .from('person_roles')
          .select('*')
          .eq('iteration_id', iteration_id)
          .order('id', { ascending: true });
        if (errRoles) {
          log('❌ org-data roles error', errRoles);
          return res
            .status(500)
            .json({ success: false, message: 'Error loading roles', error: errRoles });
        }

        const { data: people, error: errPeople } = await supabase
          .from('people')
          .select('*')
          .order('id', { ascending: true });
        if (errPeople) {
          log('❌ org-data people error', errPeople);
          return res
            .status(500)
            .json({ success: false, message: 'Error loading people', error: errPeople });
        }

        return res.status(200).json({
          success: true,
          iteration,
          units: units || [],
          roles: roles || [],
          people: people || [],
        });
      }

      case 'create-org-unit': {
        if (method !== 'POST') break;
        const { name, parent_id, iteration_id } = req.body || {};
        if (!name || !iteration_id) {
          return res.status(400).json({
            success: false,
            message: 'name and iteration_id are required',
          });
        }
        const { data, error } = await supabase
          .from('organization_units')
          .insert([{ name, parent_id: parent_id ?? null, iteration_id }])
          .select()
          .single();
        if (error) throw error;
        return res.status(201).json({ success: true, unit: data });
      }

      case 'assign-role': {
        if (method !== 'POST') break;
        const { person_id, org_unit_id, is_manager, iteration_id } = req.body || {};
        if (!person_id || !org_unit_id || !iteration_id) {
          return res.status(400).json({
            success: false,
            message: 'person_id, org_unit_id, iteration_id are required',
          });
        }
        const { data, error } = await supabase
          .from('person_roles')
          .insert([{ person_id, org_unit_id, is_manager: !!is_manager, iteration_id }])
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            return res
              .status(409)
              .json({ success: false, message: 'This role already exists.' });
          }
          throw error;
        }
        return res.status(201).json({ success: true, role: data });
      }

      case 'delete-role': {
        if (method !== 'DELETE') break;
        const { id } = req.body || {};
        if (!id) {
          return res
            .status(400)
            .json({ success: false, message: 'Role ID required' });
        }
        const { error } = await supabase.from('person_roles').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      case 'delete-org-unit': {
        if (method !== 'DELETE') break;
        const { id } = req.body || {};
        if (!id) {
          return res
            .status(400)
            .json({ success: false, message: 'Org unit ID required' });
        }
        // Will cascade via FKs if set; otherwise Postgres will reject if children exist.
        const { error } = await supabase
          .from('organization_units')
          .delete()
          .eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      default:
        return res
          .status(400)
          .json({ success: false, message: `Unknown action: ${action}` });
    }

    // If we reached here, method was not allowed for that action
    return res
      .status(405)
      .json({ success: false, message: 'Method not allowed' });
  } catch (err) {
    log('❌ Admin API error:', err);
    return res
      .status(500)
      .json({ success: false, message: err.message || 'Internal server error' });
  }
}

