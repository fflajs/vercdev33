// api/admin/[action].js
import { supabase } from '../db.js';

export default async function handler(req, res) {
  const {
    query: { action },
    method,
    body,
  } = req;

  try {
    console.log(`[Admin API] action=${action}, method=${method}`);

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
            return res.status(404).json({
              success: false,
              message: 'No active iteration found',
            });
          }

          return res.status(200).json({ success: true, iteration: data });
        }
        break;

      case 'create-iteration':
        if (method === 'POST') {
          const { name, question_set } = body;
          if (!name) {
            return res.status(400).json({
              success: false,
              message: 'Iteration name required',
            });
          }

          // Step 1: create the new iteration
          const { data: newIter, error: errNew } = await supabase
            .from('iterations')
            .insert([{ name, question_set }])
            .select()
            .single();

          if (errNew) throw errNew;

          // Step 2: find most recent closed iteration
          const { data: prevIter, error: errPrev } = await supabase
            .from('iterations')
            .select('*')
            .not('end_date', 'is', null)
            .order('end_date', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (errPrev) throw errPrev;

          if (prevIter) {
            console.log(`[Admin API] Cloning org structure from iteration ${prevIter.id}`);

            // fetch org units from previous iteration
            const { data: oldUnits, error: errUnits } = await supabase
              .from('organization_units')
              .select('*')
              .eq('iteration_id', prevIter.id);

            if (errUnits) throw errUnits;

            // map old → new IDs
            const idMap = {};
            const newUnits = [];

            for (const u of oldUnits) {
              newUnits.push({
                name: u.name,
                parent_id: null, // fix later
                iteration_id: newIter.id,
              });
            }

            // insert units
            const { data: insertedUnits, error: errInsertUnits } = await supabase
              .from('organization_units')
              .insert(newUnits)
              .select();

            if (errInsertUnits) throw errInsertUnits;

            // update idMap
            oldUnits.forEach((oldU, i) => {
              idMap[oldU.id] = insertedUnits[i].id;
            });

            // update parent_id links
            for (const oldU of oldUnits) {
              if (oldU.parent_id) {
                await supabase
                  .from('organization_units')
                  .update({ parent_id: idMap[oldU.parent_id] })
                  .eq('id', idMap[oldU.id]);
              }
            }

            // fetch roles
            const { data: oldRoles, error: errRoles } = await supabase
              .from('person_roles')
              .select('*')
              .eq('iteration_id', prevIter.id);

            if (errRoles) throw errRoles;

            if (oldRoles.length > 0) {
              const newRoles = oldRoles.map((r) => ({
                person_id: r.person_id,
                org_unit_id: idMap[r.org_unit_id],
                is_manager: r.is_manager,
                description: r.description,
                iteration_id: newIter.id,
              }));

              const { error: errInsertRoles } = await supabase
                .from('person_roles')
                .insert(newRoles);

              if (errInsertRoles) throw errInsertRoles;
            }
          }

          return res.status(201).json({ success: true, iteration: newIter });
        }
        break;

      case 'close-iteration':
        if (method === 'POST') {
          const { id } = body;
          if (!id) {
            return res.status(400).json({
              success: false,
              message: 'Iteration ID required',
            });
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
       * ORGANIZATION DATA
       */
      case 'org-data':
        if (method === 'GET') {
          const { iteration_id } = req.query;
          if (!iteration_id) {
            return res.status(400).json({
              success: false,
              message: 'iteration_id is required',
            });
          }

          const { data: iteration, error: errIter } = await supabase
            .from('iterations')
            .select('*')
            .eq('id', iteration_id)
            .maybeSingle();

          if (errIter) throw errIter;
          if (!iteration) {
            return res.status(404).json({
              success: false,
              message: `No iteration found with id ${iteration_id}`,
            });
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

          const { data: people, error: errPeople } = await supabase
            .from('people')
            .select('*');
          if (errPeople) throw errPeople;

          return res.status(200).json({
            success: true,
            iteration,
            units,
            roles,
            people,
          });
        }
        break;

      case 'create-org-unit':
        if (method === 'POST') {
          const { name, parent_id, iteration_id } = body;
          if (!name || !iteration_id) {
            return res.status(400).json({
              success: false,
              message: 'Name and iteration_id required',
            });
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

      case 'assign-role':
        if (method === 'POST') {
          const { person_id, org_unit_id, is_manager, iteration_id } = body;
          if (!person_id || !org_unit_id || !iteration_id) {
            return res.status(400).json({
              success: false,
              message: 'person_id, org_unit_id, iteration_id required',
            });
          }

          const { data, error } = await supabase
            .from('person_roles')
            .insert([{ person_id, org_unit_id, is_manager, iteration_id }])
            .select()
            .single();

          if (error) {
            if (error.code === '23505') {
              return res.status(409).json({
                success: false,
                message: 'This role already exists.',
              });
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
            return res.status(400).json({
              success: false,
              message: 'Role ID required',
            });
          }

          const { error } = await supabase
            .from('person_roles')
            .delete()
            .eq('id', id);

          if (error) throw error;
          return res.status(200).json({ success: true });
        }
        break;

      case 'delete-org-unit':
        if (method === 'DELETE') {
          const { id } = body;
          if (!id) {
            return res.status(400).json({
              success: false,
              message: 'Org unit ID required',
            });
          }

          const { error } = await supabase
            .from('organization_units')
            .delete()
            .eq('id', id);

          if (error) throw error;
          return res.status(200).json({ success: true });
        }
        break;

      default:
        return res
          .status(404)
          .json({ success: false, message: `Unknown action: ${action}` });
    }

    // If method not handled
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

