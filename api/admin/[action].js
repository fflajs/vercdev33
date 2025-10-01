// api/admin/[action].js
import { supabase } from '../db.js';

export default async function handler(req, res) {
  const {
    query: { action },
    method,
    body,
  } = req;

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

          // 1. Find latest iteration (if exists)
          const { data: lastIter, error: errLast } = await supabase
            .from('iterations')
            .select('*')
            .order('id', { ascending: false })
            .limit(1)
            .single();
          if (errLast && errLast.code !== 'PGRST116') throw errLast;

          // 2. Insert new iteration
          const { data: newIter, error: errNew } = await supabase
            .from('iterations')
            .insert([{ name, question_set }])
            .select()
            .single();
          if (errNew) throw errNew;

          // 3. If last iteration exists, copy org units and roles
          if (lastIter) {
            // Map old org units → new org units
            const { data: oldUnits, error: errUnits } = await supabase
              .from('organization_units')
              .select('*')
              .eq('iteration_id', lastIter.id);
            if (errUnits) throw errUnits;

            const idMap = {};
            for (const u of oldUnits) {
              const { data: newUnit, error: errInsert } = await supabase
                .from('organization_units')
                .insert([
                  {
                    name: u.name,
                    parent_id: null, // temporary
                    iteration_id: newIter.id,
                  },
                ])
                .select()
                .single();
              if (errInsert) throw errInsert;
              idMap[u.id] = newUnit.id;
            }

            // Fix parent-child relationships
            for (const u of oldUnits) {
              if (u.parent_id) {
                const { error: errUpdate } = await supabase
                  .from('organization_units')
                  .update({ parent_id: idMap[u.parent_id] })
                  .eq('id', idMap[u.id]);
                if (errUpdate) throw errUpdate;
              }
            }

            // Copy roles
            const { data: oldRoles, error: errRoles } = await supabase
              .from('person_roles')
              .select('*')
              .eq('iteration_id', lastIter.id);
            if (errRoles) throw errRoles;

            for (const r of oldRoles) {
              const { error: errRoleInsert } = await supabase
                .from('person_roles')
                .insert([
                  {
                    person_id: r.person_id,
                    org_unit_id: idMap[r.org_unit_id],
                    is_manager: r.is_manager,
                    iteration_id: newIter.id,
                  },
                ]);
              if (errRoleInsert) throw errRoleInsert;
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
            .single();
          if (errIter) throw errIter;

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
    return res.status(500).json({
      success: false,
      message: err.message || 'Internal server error',
    });
  }
}

