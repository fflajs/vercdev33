// api/admin/[action].js
import { supabase } from '../db.js';

export default async function handler(req, res) {
  const {
    query: { action },
    method,
    body,
  } = req;

  try {
    console.log(`[INFO] Admin API called: action=${action}, method=${method}`);

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

          console.log("DEBUG → Insert result data:", data);
          console.log("DEBUG → Insert result error:", error);

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
            .maybeSingle(); // handles 0 or 1 rows
          if (error) throw error;
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

          // Check if an active iteration already exists
          const { data: existing, error: errActive } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null);
          if (errActive) throw errActive;
          if (existing && existing.length > 0) {
            return res.status(400).json({
              success: false,
              message: 'An active iteration already exists. Please close it before creating a new one.',
            });
          }

          // Get last iteration (if any) to clone org structure
          const { data: lastIter, error: errLast } = await supabase
            .from('iterations')
            .select('*')
            .order('id', { ascending: false })
            .limit(1);
          if (errLast) throw errLast;

          // Create new iteration
          const { data: newIter, error: errNew } = await supabase
            .from('iterations')
            .insert([{ name, question_set }])
            .select()
            .single();
          if (errNew) throw errNew;

          // Clone org units + roles from last iteration if exists
          if (lastIter && lastIter.length > 0) {
            const prevId = lastIter[0].id;
            const newId = newIter.id;

            console.log(`[INFO] Cloning org structure from iteration ${prevId} → ${newId}`);

            // Clone org units
            const { data: oldUnits, error: errUnits } = await supabase
              .from('organization_units')
              .select('*')
              .eq('iteration_id', prevId);
            if (errUnits) throw errUnits;

            const unitIdMap = {};
            for (const u of oldUnits) {
              const { data: inserted, error: errIns } = await supabase
                .from('organization_units')
                .insert([{ name: u.name, parent_id: null, iteration_id: newId }])
                .select()
                .single();
              if (errIns) throw errIns;
              unitIdMap[u.id] = inserted.id;
            }

            // Update parent_id relationships
            for (const u of oldUnits) {
              if (u.parent_id) {
                const newIdMapped = unitIdMap[u.id];
                const newParent = unitIdMap[u.parent_id];
                const { error: errUpd } = await supabase
                  .from('organization_units')
                  .update({ parent_id: newParent })
                  .eq('id', newIdMapped);
                if (errUpd) throw errUpd;
              }
            }

            // Clone person_roles
            const { data: oldRoles, error: errRoles } = await supabase
              .from('person_roles')
              .select('*')
              .eq('iteration_id', prevId);
            if (errRoles) throw errRoles;

            for (const r of oldRoles) {
              const { error: errRoleIns } = await supabase
                .from('person_roles')
                .insert([{
                  person_id: r.person_id,
                  org_unit_id: unitIdMap[r.org_unit_id],
                  is_manager: r.is_manager,
                  iteration_id: newId,
                }]);
              if (errRoleIns) throw errRoleIns;
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
              message: 'Org Unit ID required',
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
        return res.status(404).json({ success: false, message: `Unknown action: ${action}` });
    }

    // If method not handled
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
}

