// api/admin/[action].js
import { supabase } from '../db.js';

export default async function handler(req, res) {
  const {
    query: { action },
    method,
    body,
  } = req;

  console.info(`[${new Date().toISOString()}] ➡️ Admin API called: action=${action}, method=${method}`);

  try {
    switch (action) {
      /**
       * PEOPLE
       *  - GET: list all people
       *  - POST: create person (unique by name)
       */
      case 'people': {
        if (method === 'GET') {
          const { data, error } = await supabase.from('people').select('*');
          if (error) throw error;
          return res.status(200).json({ success: true, people: data });
        }
        if (method === 'POST') {
          const { name } = body || {};
          if (!name) {
            return res.status(400).json({ success: false, message: 'Name is required' });
          }
          // unique by name check
          const { data: exists, error: errExists } = await supabase
            .from('people')
            .select('id')
            .eq('name', name)
            .maybeSingle();
          if (errExists) throw errExists;
          if (exists) {
            return res.status(409).json({ success: false, message: `Name "${name}" already exists.` });
          }
          const { data, error } = await supabase
            .from('people')
            .insert([{ name }])
            .select()
            .single();

          if (error) throw error;
          return res.status(201).json({ success: true, person: data });
        }
        break;
      }

      /**
       * ITERATIONS
       */
      case 'active-iteration': {
        if (method === 'GET') {
          const { data, error } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .single();
          if (error && error.code !== 'PGRST116') throw error;
          if (!data) {
            return res.status(404).json({ success: false, message: 'No active iteration found' });
          }
          return res.status(200).json({ success: true, iteration: data });
        }
        break;
      }

      case 'create-iteration': {
        if (method === 'POST') {
          const { name, question_set } = body || {};
          if (!name || !question_set) {
            return res.status(400).json({ success: false, message: 'name and question_set are required' });
          }

          // ensure no active iteration
          const { data: active, error: errActive } = await supabase
            .from('iterations')
            .select('id')
            .is('end_date', null)
            .maybeSingle();
          if (errActive) throw errActive;
          if (active) {
            return res.status(409).json({ success: false, message: 'Close the active iteration first.' });
          }

          const { data, error } = await supabase
            .from('iterations')
            .insert([{ name, question_set }])
            .select()
            .single();
          if (error) throw error;

          return res.status(201).json({ success: true, iteration: data });
        }
        break;
      }

      case 'close-iteration': {
        if (method === 'POST') {
          const { id } = body || {};
          if (!id) {
            return res.status(400).json({ success: false, message: 'Iteration ID required' });
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
        break;
      }

      /**
       * ORG DATA (units, roles, people snapshot for an iteration)
       * GET /api/admin/org-data?iteration_id=...
       */
      case 'org-data': {
        if (method === 'GET') {
          const { iteration_id } = req.query;
          if (!iteration_id) {
            return res.status(400).json({ success: false, message: 'iteration_id is required' });
          }

          const { data: iteration, error: errIter } = await supabase
            .from('iterations')
            .select('*')
            .eq('id', iteration_id)
            .maybeSingle();
          if (errIter) throw errIter;
          if (!iteration) return res.status(404).json({ success: false, message: `No iteration id=${iteration_id}` });

          const { data: units, error: errUnits } = await supabase
            .from('organization_units')
            .select('*')
            .eq('iteration_id', iteration_id);
          if (errUnits) throw errUnits;

          const { data: roles, error: errRoles } = await supabase
            .from('person_roles')
            .select('*')
            .eq('iteration_id', iteration_id);
          if (errRoles) throw errRoles;

          const { data: people, error: errPeople } = await supabase
            .from('people')
            .select('*');
          if (errPeople) throw errPeople;

          return res.status(200).json({ success: true, iteration, units, roles, people });
        }
        break;
      }

      case 'create-org-unit': {
        if (method === 'POST') {
          const { name, parent_id, iteration_id } = body || {};
          if (!name || !iteration_id) {
            return res.status(400).json({ success: false, message: 'Name and iteration_id required' });
          }
          const { data, error } = await supabase
            .from('organization_units')
            .insert([{ name, parent_id, iteration_id }])
            .select()
            .single();
          if (error) throw error;
          return res.status(201).json({ success: true, unit: data });
        }
        break;
      }

      case 'delete-org-unit': {
        if (method === 'DELETE') {
          const { id } = body || {};
          if (!id) return res.status(400).json({ success: false, message: 'Org Unit ID required' });
          const { error } = await supabase.from('organization_units').delete().eq('id', id);
          if (error) throw error;
          return res.status(200).json({ success: true });
        }
        break;
      }

      case 'assign-role': {
        if (method === 'POST') {
          const { person_id, org_unit_id, is_manager, iteration_id } = body || {};
          if (!person_id || !org_unit_id || !iteration_id) {
            return res.status(400).json({ success: false, message: 'person_id, org_unit_id, iteration_id required' });
          }
          const { data, error } = await supabase
            .from('person_roles')
            .insert([{ person_id, org_unit_id, is_manager: !!is_manager, iteration_id }])
            .select()
            .single();
          if (error) {
            if (error.code === '23505') {
              return res.status(409).json({ success: false, message: 'This role already exists.' });
            }
            throw error;
          }
          return res.status(201).json({ success: true, role: data });
        }
        break;
      }

      case 'delete-role': {
        if (method === 'DELETE') {
          const { id } = body || {};
          if (!id) return res.status(400).json({ success: false, message: 'Role ID required' });
          const { error } = await supabase.from('person_roles').delete().eq('id', id);
          if (error) throw error;
          return res.status(200).json({ success: true });
        }
        break;
      }

      /**
       * TABLE VIEWER (read-only)
       * GET /api/admin/table-viewer?table=people|iterations|organization_units|person_roles|surveys
       */
      case 'table-viewer': {
        if (method === 'GET') {
          const { table } = req.query;
          const allowed = ['people', 'iterations', 'organization_units', 'person_roles', 'surveys'];
          if (!allowed.includes(table)) {
            return res.status(400).json({ success: false, message: 'Invalid table' });
          }
          const { data, error } = await supabase.from(table).select('*').order('id', { ascending: true });
          if (error) throw error;
          return res.status(200).json({ success: true, rows: data });
        }
        break;
      }

      /**
       * NEW: person-context
       * GET /api/admin/person-context?person_role_id=...
       * Returns name, org unit name, is_manager, etc.
       */
      case 'person-context': {
        if (method === 'GET') {
          const { person_role_id } = req.query;
          if (!person_role_id) {
            return res.status(400).json({ success: false, message: 'person_role_id is required' });
          }
          // fetch role
          const { data: role, error: errRole } = await supabase
            .from('person_roles')
            .select('*')
            .eq('id', person_role_id)
            .single();
          if (errRole) throw errRole;

          // fetch person
          const { data: person, error: errPerson } = await supabase
            .from('people')
            .select('id,name')
            .eq('id', role.person_id)
            .single();
          if (errPerson) throw errPerson;

          // fetch org unit (for name)
          const { data: unit, error: errUnit } = await supabase
            .from('organization_units')
            .select('id,name')
            .eq('id', role.org_unit_id)
            .single();
          if (errUnit) throw errUnit;

          const context = {
            person_id: person.id,
            name: person.name,
            org_unit_id: unit.id,
            org_unit_name: unit.name,
            is_manager: !!role.is_manager,
          };

          return res.status(200).json({ success: true, context });
        }
        break;
      }

      /**
       * NEW: survey (save/load)
       * GET /api/admin/survey?person_role_id=..&iteration_id=..
       * POST /api/admin/survey { person_role_id, iteration_id, survey_results: number[] }
       */
      case 'survey': {
        if (method === 'GET') {
          const { person_role_id, iteration_id } = req.query;
          if (!person_role_id || !iteration_id) {
            return res.status(400).json({ success: false, message: 'person_role_id and iteration_id required' });
          }

          const { data, error } = await supabase
            .from('surveys')
            .select('*')
            .eq('person_role_id', person_role_id)
            .eq('iteration_id', iteration_id)
            .maybeSingle();

          if (error && error.code !== 'PGRST116') throw error;
          if (!data) {
            // no content but OK
            return res.status(200).json({ success: true, survey: null });
          }
          return res.status(200).json({ success: true, survey: data });
        }

        if (method === 'POST') {
          const { person_role_id, iteration_id, survey_results } = body || {};
          if (!person_role_id || !iteration_id || !Array.isArray(survey_results)) {
            return res.status(400).json({ success: false, message: 'person_role_id, iteration_id, survey_results[] required' });
          }

          // upsert by (person_role_id, iteration_id)
          const { data, error } = await supabase
            .from('surveys')
            .upsert(
              [{ person_role_id, iteration_id, survey_results }],
              { onConflict: 'person_role_id,iteration_id' }
            )
            .select()
            .single();

          if (error) throw error;
          return res.status(200).json({ success: true, survey: data });
        }
        break;
      }

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }

    // Fallback when method not matched inside a known action
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Internal server error', error: err });
  }
}

