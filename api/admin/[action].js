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
       * PEOPLE MANAGEMENT
       */
      case 'people':
        if (method === 'GET') {
          const { data, error } = await supabase.from('people').select('*');
          if (error) throw error;
          return res.status(200).json({ success: true, people: data });
        }
        if (method === 'POST') {
          const { name } = body;
          if (!name) {
            return res.status(400).json({ success: false, message: 'Name is required' });
          }
          // Check if exists
          const { data: exists, error: errExists } = await supabase
            .from('people')
            .select('*')
            .eq('name', name)
            .maybeSingle();
          if (errExists) throw errExists;
          if (exists) {
            return res.status(409).json({ success: false, message: `Name "${name}" already exists.` });
          }
          const { data, error } = await supabase.from('people').insert([{ name }]).select().single();
          if (error) throw error;
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
          return res.status(200).json({ success: true, iterations: data });
        }
        break;

      case 'active-iteration':
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

      case 'create-iteration':
        if (method === 'POST') {
          const { name, question_set } = body;
          if (!name) {
            return res.status(400).json({ success: false, message: 'Iteration name required' });
          }

          // ensure only one active iteration
          const { data: existing, error: errActive } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .maybeSingle();
          if (errActive) throw errActive;
          if (existing) {
            return res.status(400).json({ success: false, message: 'Close the active iteration before creating a new one.' });
          }

          // create new iteration
          const { data: iteration, error } = await supabase
            .from('iterations')
            .insert([{ name, question_set }])
            .select()
            .single();
          if (error) throw error;

          // clone org units + roles from previous iteration
          const { data: prevIter } = await supabase
            .from('iterations')
            .select('*')
            .lt('id', iteration.id)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (prevIter) {
            console.info(`Cloning org structure from iteration ${prevIter.id} -> ${iteration.id}`);

            // clone org units
            const { data: prevUnits } = await supabase
              .from('organization_units')
              .select('*')
              .eq('iteration_id', prevIter.id);

            const unitMap = {};
            if (prevUnits && prevUnits.length > 0) {
              for (const u of prevUnits) {
                const { data: newUnit } = await supabase
                  .from('organization_units')
                  .insert([{ name: u.name, parent_id: null, iteration_id: iteration.id }])
                  .select()
                  .single();
                unitMap[u.id] = newUnit.id;
              }
              // fix parent_ids
              for (const u of prevUnits) {
                if (u.parent_id) {
                  await supabase
                    .from('organization_units')
                    .update({ parent_id: unitMap[u.parent_id] })
                    .eq('id', unitMap[u.id]);
                }
              }
            }

            // clone roles
            const { data: prevRoles } = await supabase
              .from('person_roles')
              .select('*')
              .eq('iteration_id', prevIter.id);

            if (prevRoles && prevRoles.length > 0) {
              for (const r of prevRoles) {
                await supabase.from('person_roles').insert([
                  {
                    person_id: r.person_id,
                    org_unit_id: unitMap[r.org_unit_id],
                    is_manager: r.is_manager,
                    iteration_id: iteration.id,
                  },
                ]);
              }
            }
          }

          return res.status(201).json({ success: true, iteration });
        }
        break;

      case 'close-iteration':
        if (method === 'POST') {
          const { id } = body;
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

      /**
       * ORG DATA
       */
      case 'org-data':
        if (method === 'GET') {
          const { iteration_id } = req.query;
          if (!iteration_id) {
            return res.status(400).json({ success: false, message: 'iteration_id is required' });
          }
          console.info(`[${new Date().toISOString()}] Fetching org-data for iteration: ${iteration_id}`);

          const { data: iteration, error: errIter } = await supabase
            .from('iterations')
            .select('*')
            .eq('id', iteration_id)
            .maybeSingle();
          if (errIter) throw errIter;
          if (!iteration) {
            return res.status(404).json({ success: false, message: `No iteration found with id ${iteration_id}` });
          }

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

          const { data: people, error: errPeople } = await supabase.from('people').select('*');
          if (errPeople) throw errPeople;

          return res.status(200).json({ success: true, iteration, units, roles, people });
        }
        break;

      case 'create-org-unit':
        if (method === 'POST') {
          const { name, parent_id, iteration_id } = body;
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

      case 'delete-org-unit':
        if (method === 'DELETE') {
          const { id } = body;
          if (!id) {
            return res.status(400).json({ success: false, message: 'Org unit ID required' });
          }
          const { error } = await supabase.from('organization_units').delete().eq('id', id);
          if (error) throw error;
          return res.status(200).json({ success: true });
        }
        break;

      /**
       * ROLES
       */
      case 'assign-role':
        if (method === 'POST') {
          const { person_id, org_unit_id, is_manager, iteration_id } = body;
          if (!person_id || !org_unit_id || !iteration_id) {
            return res
              .status(400)
              .json({ success: false, message: 'person_id, org_unit_id, iteration_id required' });
          }
          const { data, error } = await supabase
            .from('person_roles')
            .insert([{ person_id, org_unit_id, is_manager, iteration_id }])
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

      case 'delete-role':
        if (method === 'DELETE') {
          const { id } = body;
          if (!id) {
            return res.status(400).json({ success: false, message: 'Role ID required' });
          }
          const { error } = await supabase.from('person_roles').delete().eq('id', id);
          if (error) throw error;
          return res.status(200).json({ success: true });
        }
        break;

      default:
        return res.status(404).json({ success: false, message: `Unknown action: ${action}` });
    }

    // Fallback for methods not handled
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (err) {
    console.error('Admin API error:', err);
    return res
      .status(500)
      .json({ success: false, message: err.message || 'Internal server error' });
  }
}

