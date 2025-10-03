// api/admin/[action].js
import { supabase } from '../db.js';

function log(level, msg, obj) {
  const stamp = new Date().toISOString();
  if (obj !== undefined) {
    console[level](`[${stamp}] ${msg}`, obj);
  } else {
    console[level](`[${stamp}] ${msg}`);
  }
}

export default async function handler(req, res) {
  const {
    query: { action },
    method,
    body,
    query,
  } = req;

  log('info', `➡️ Admin API called: action=${action}, method=${method}`);

  try {
    switch (action) {
      /**
       * PEOPLE MANAGEMENT
       *  - GET  /api/admin/people
       *  - POST /api/admin/people  { name }
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
            return res
              .status(400)
              .json({ success: false, message: 'Name is required' });
          }

          // check if already exists
          const { data: exists, error: errExists } = await supabase
            .from('people')
            .select('id,name')
            .eq('name', name)
            .maybeSingle();
          if (errExists) throw errExists;
          if (exists) {
            return res.status(409).json({
              success: false,
              message: `Name "${name}" already exists.`,
            });
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
       *  - GET  /api/admin/active-iteration
       *  - POST /api/admin/create-iteration { name, question_set }
       *  - POST /api/admin/close-iteration  { id }
       */
      case 'active-iteration': {
        if (method === 'GET') {
          const { data, error } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .single();

          if (error) {
            if (error.code === 'PGRST116') {
              return res
                .status(404)
                .json({ success: false, message: 'No active iteration found' });
            }
            throw error;
          }

          return res.status(200).json({ success: true, iteration: data });
        }
        break;
      }

      case 'create-iteration': {
        if (method === 'POST') {
          const { name, question_set } = body || {};
          log('info', `[create-iteration] body`, body);

          if (!name || !question_set) {
            return res.status(400).json({
              success: false,
              message: 'Iteration name and question_set are required',
            });
          }

          // Ensure no active iteration exists
          const { data: active, error: errActive } = await supabase
            .from('iterations')
            .select('id')
            .is('end_date', null)
            .maybeSingle();
          if (errActive) throw errActive;
          if (active) {
            return res.status(409).json({
              success: false,
              message:
                'An iteration is currently active. Close it before creating a new one.',
            });
          }

          // Find the latest iteration (if any) to optionally clone org structure
          const { data: lastIter, error: errLast } = await supabase
            .from('iterations')
            .select('*')
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (errLast && errLast.code !== 'PGRST116') throw errLast;

          // Create the new iteration
          const { data: newIter, error: errNew } = await supabase
            .from('iterations')
            .insert([{ name, question_set }])
            .select()
            .single();

          if (errNew) throw errNew;

          // Clone org structure if there was a previous iteration
          if (lastIter) {
            // Clone units
            const { data: prevUnits, error: errUnits } = await supabase
              .from('organization_units')
              .select('*')
              .eq('iteration_id', lastIter.id);
            if (errUnits) throw errUnits;

            const oldToNew = new Map();

            // Insert all units with parent_id null first or in simple order, then fix parents
            const insertUnitsPayload = prevUnits.map((u) => ({
              name: u.name,
              parent_id: null, // fix later
              iteration_id: newIter.id,
            }));

            const { data: insertedUnits, error: errInsUnits } = await supabase
              .from('organization_units')
              .insert(insertUnitsPayload)
              .select();

            if (errInsUnits) throw errInsUnits;

            // Map old -> new (by index)
            prevUnits.forEach((oldUnit, idx) => {
              oldToNew.set(oldUnit.id, insertedUnits[idx].id);
            });

            // Fix parent relations
            for (let i = 0; i < prevUnits.length; i++) {
              const oldUnit = prevUnits[i];
              if (oldUnit.parent_id) {
                const newId = insertedUnits[i].id;
                const newParentId = oldToNew.get(oldUnit.parent_id) || null;
                const { error: errUpd } = await supabase
                  .from('organization_units')
                  .update({ parent_id: newParentId })
                  .eq('id', newId);
                if (errUpd) throw errUpd;
              }
            }

            // Clone roles
            const { data: prevRoles, error: errRoles } = await supabase
              .from('person_roles')
              .select('*')
              .eq('iteration_id', lastIter.id);
            if (errRoles) throw errRoles;

            if (prevRoles && prevRoles.length > 0) {
              const rolePayload = prevRoles.map((r) => ({
                person_id: r.person_id,
                org_unit_id: oldToNew.get(r.org_unit_id),
                is_manager: r.is_manager,
                iteration_id: newIter.id,
                description: r.description || null,
              }));

              if (rolePayload.length > 0) {
                const { error: errInsRoles } = await supabase
                  .from('person_roles')
                  .insert(rolePayload);
                if (errInsRoles) throw errInsRoles;
              }
            }
          }

          return res.status(201).json({ success: true, iteration: newIter });
        }
        break;
      }

      case 'close-iteration': {
        if (method === 'POST') {
          const { id } = body || {};
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
        break;
      }

      /**
       * ORG DATA
       *  - GET /api/admin/org-data?iteration_id=#
       */
      case 'org-data': {
        if (method === 'GET') {
          const { iteration_id } = query || {};
          log('info', `[org-data] iteration_id=${iteration_id}`);

          if (!iteration_id) {
            return res
              .status(400)
              .json({ success: false, message: 'iteration_id is required' });
          }

          // Iteration
          const { data: iteration, error: errIter } = await supabase
            .from('iterations')
            .select('*')
            .eq('id', iteration_id)
            .single();
          if (errIter) {
            log('error', `[org-data] Error loading iteration`, errIter);
            throw errIter;
          }

          // Units
          const { data: units, error: errUnits } = await supabase
            .from('organization_units')
            .select('*')
            .eq('iteration_id', iteration_id);
          if (errUnits) {
            log('error', `[org-data] Error loading units`, errUnits);
            throw errUnits;
          }

          // Roles
          const { data: roles, error: errRoles } = await supabase
            .from('person_roles')
            .select('*')
            .eq('iteration_id', iteration_id);
          if (errRoles) {
            log('error', `[org-data] Error loading roles`, errRoles);
            return res.status(500).json({
              success: false,
              message: 'Error loading roles',
              error: errRoles,
            });
          }

          // People
          const { data: people, error: errPeople } = await supabase
            .from('people')
            .select('*');
          if (errPeople) {
            log('error', `[org-data] Error loading people`, errPeople);
            throw errPeople;
          }

          log('info', `[org-data] OK`, {
            units: units?.length || 0,
            roles: roles?.length || 0,
            people: people?.length || 0,
          });

          return res.status(200).json({
            success: true,
            iteration,
            units,
            roles,
            people,
          });
        }
        break;
      }

      /**
       * ORG UNIT CREATE
       *  - POST /api/admin/create-org-unit  { name, parent_id?, iteration_id }
       */
      case 'create-org-unit': {
        if (method === 'POST') {
          log('info', `[create-org-unit]`, body);
          const { name, parent_id = null, iteration_id } = body || {};
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
      }

      /**
       * ROLE ASSIGN / DELETE
       *  - POST   /api/admin/assign-role   { person_id, org_unit_id, is_manager, iteration_id }
       *  - DELETE /api/admin/delete-role   { id }
       */
      case 'assign-role': {
        if (method === 'POST') {
          const { person_id, org_unit_id, is_manager, iteration_id } =
            body || {};
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
      }

      case 'delete-role': {
        if (method === 'DELETE') {
          const { id } = body || {};
          if (!id) {
            return res
              .status(400)
              .json({ success: false, message: 'Role ID required' });
          }

          const { error } = await supabase
            .from('person_roles')
            .delete()
            .eq('id', id);

          if (error) throw error;

          return res.status(200).json({ success: true });
        }
        break;
      }

      /**
       * TABLE VIEWER (read-only)
       *  - GET /api/admin/table-viewer?table=people|organization_units|iterations|person_roles|surveys
       */
      case 'table-viewer': {
        if (method === 'GET') {
          const { table } = query || {};
          if (
            !['people', 'organization_units', 'iterations', 'person_roles', 'surveys'].includes(
              table
            )
          ) {
            return res.status(400).json({
              success: false,
              message: 'Invalid or missing table parameter',
            });
          }
          const { data, error } = await supabase.from(table).select('*');
          if (error) throw error;
          return res.status(200).json({ success: true, rows: data || [] });
        }
        break;
      }

      /**
       * LOGIN HELPERS
       *  - GET /api/admin/get-user-roles?name=XYZ
       *  - GET /api/admin/get-role-context?role_id=#
       */
      case 'get-user-roles': {
        if (method === 'GET') {
          const { name } = query || {};
          if (!name) {
            return res
              .status(400)
              .json({ success: false, message: 'name query param required' });
          }

          // find person
          const { data: person, error: errP } = await supabase
            .from('people')
            .select('id,name')
            .eq('name', name)
            .maybeSingle();
          if (errP) throw errP;
          if (!person) {
            return res.status(404).json({
              success: false,
              message: `User "${name}" not found`,
              roles: [],
            });
          }

          // active iteration
          const { data: iter, error: errI } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .maybeSingle();
          if (errI) throw errI;

          if (!iter) {
            return res.status(404).json({
              success: false,
              message: 'No active iteration',
              user: person,
              roles: [],
            });
          }

          // roles for that person in active iteration
          const { data: roles, error: errR } = await supabase
            .from('person_roles')
            .select(
              `
              id,
              is_manager,
              org_unit_id,
              iteration_id,
              unit:organization_units!person_roles_org_unit_id_fkey(id,name,parent_id)
            `
            )
            .eq('person_id', person.id)
            .eq('iteration_id', iter.id);
          if (errR) throw errR;

          return res.status(200).json({
            success: true,
            user: person,
            iteration: iter,
            roles: roles || [],
          });
        }
        break;
      }

      case 'get-role-context': {
        if (method === 'GET') {
          const { role_id } = query || {};
          if (!role_id) {
            return res
              .status(400)
              .json({ success: false, message: 'role_id is required' });
          }

          const { data, error } = await supabase
            .from('person_roles')
            .select(
              `
              id,
              is_manager,
              iteration_id,
              person:people!person_roles_person_id_fkey(id,name),
              unit:organization_units!person_roles_org_unit_id_fkey(id,name,parent_id),
              iteration:iterations!person_roles_iteration_id_fkey(id,name,question_set)
            `
            )
            .eq('id', role_id)
            .single();

          if (error) {
            if (error.code === 'PGRST116') {
              return res.status(404).json({
                success: false,
                message: `Role with id ${role_id} not found`,
              });
            }
            throw error;
          }

          const payload = {
            person_name: data?.person?.name || '',
            person_id: data?.person?.id || null,
            role_id: data?.id || null,
            is_manager: !!data?.is_manager,
            unit_name: data?.unit?.name || '',
            unit_id: data?.unit?.id || null,
            iteration_id: data?.iteration?.id || null,
            iteration_name: data?.iteration?.name || '',
            question_set: data?.iteration?.question_set || '',
          };

          return res.status(200).json({ success: true, context: payload });
        }
        break;
      }

      default:
        return res
          .status(400)
          .json({ success: false, message: `Unknown action: ${action}` });
    }

    // If we fell through: method not allowed for this action
    return res
      .status(405)
      .json({ success: false, message: 'Method not allowed' });
  } catch (err) {
    log('error', `Admin API error:`, err);
    return res
      .status(500)
      .json({ success: false, message: err.message || 'Internal server error' });
  }
}

