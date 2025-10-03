// api/admin/[action].js
import { supabase } from '../db.js';

export default async function handler(req, res) {
  const {
    query: { action },
    method,
    body,
    query,
  } = req;

  const log = (...args) =>
    console.info(`[${new Date().toISOString()}] [admin:${action}]`, ...args);

  try {
    log('➡️ called', { method });

    switch (action) {
      /**
       * PEOPLE (list/create)
       */
      case 'people': {
        if (method === 'GET') {
          const { name } = query || {};
          if (name) {
            const { data, error } = await supabase
              .from('people')
              .select('*')
              .eq('name', name);
            if (error) throw error;
            return res.status(200).json({ success: true, people: data || [] });
          }
          const { data, error } = await supabase.from('people').select('*');
          if (error) throw error;
          return res.status(200).json({ success: true, people: data || [] });
        }

        if (method === 'POST') {
          const { name } = body || {};
          if (!name) {
            return res
              .status(400)
              .json({ success: false, message: 'Name is required' });
          }

          // check uniqueness by name
          const { data: exists, error: errExists } = await supabase
            .from('people')
            .select('id,name')
            .eq('name', name);
          if (errExists) throw errExists;
          if (exists && exists.length > 0) {
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
       */
      case 'iterations': {
        if (method === 'GET') {
          const { data, error } = await supabase.from('iterations').select('*');
          if (error) throw error;
          return res.status(200).json({ success: true, iterations: data });
        }
        break;
      }

      case 'active-iteration': {
        if (method === 'GET') {
          const { data, error } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .single();
          if (error && error.code !== 'PGRST116') throw error;
          if (!data) {
            return res
              .status(404)
              .json({ success: false, message: 'No active iteration found' });
          }
          return res.status(200).json({ success: true, iteration: data });
        }
        break;
      }

      case 'create-iteration': {
        if (method === 'POST') {
          const { name, question_set } = body || {};
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
          if (errActive && errActive.code !== 'PGRST116') throw errActive;
          if (active) {
            return res.status(409).json({
              success: false,
              message:
                'An iteration is already active. Close it before creating a new one.',
            });
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
       */
      case 'org-data': {
        if (method === 'GET') {
          const { iteration_id } = query || {};
          if (!iteration_id) {
            return res
              .status(400)
              .json({ success: false, message: 'iteration_id is required' });
          }

          const { data: iter, error: errIter } = await supabase
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
            iteration: iter,
            units,
            roles,
            people,
          });
        }
        break;
      }

      case 'create-org-unit': {
        if (method === 'POST') {
          const { name, parent_id, iteration_id } = body || {};
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

      case 'delete-org-unit': {
        if (method === 'DELETE') {
          const { id } = body || {};
          if (!id) {
            return res
              .status(400)
              .json({ success: false, message: 'Org Unit id required' });
          }
          const { error } = await supabase
            .from('organization_units')
            .delete()
            .eq('id', id);
          if (error) throw error;
          return res.status(200).json({ success: true });
        }
        break;
      }

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
       * NEW: get-user-roles
       * GET /api/admin/get-user-roles?name=Alice[&iteration_id=3]
       * Resolves a person by name and returns their roles for the target iteration.
       * If iteration_id missing, uses active iteration.
       */
      case 'get-user-roles': {
        if (method !== 'GET') break;

        const inputName = (query?.name || '').trim();
        const providedIterId = query?.iteration_id
          ? parseInt(query.iteration_id, 10)
          : null;

        if (!inputName) {
          return res
            .status(400)
            .json({ success: false, message: 'name is required' });
        }

        // find person by name (exact, case-sensitive by default)
        const { data: person, error: errPerson } = await supabase
          .from('people')
          .select('id,name')
          .eq('name', inputName)
          .maybeSingle();
        if (errPerson) throw errPerson;
        if (!person) {
          return res.status(404).json({
            success: false,
            message: `Person "${inputName}" not found`,
          });
        }

        // pick iteration (provided or active)
        let iterationId = providedIterId;
        let iteration = null;

        if (iterationId) {
          const { data: iter, error: errIter } = await supabase
            .from('iterations')
            .select('*')
            .eq('id', iterationId)
            .single();
          if (errIter) throw errIter;
          iteration = iter;
        } else {
          const { data: activeIter, error: errActive } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .single();
          if (errActive) {
            if (errActive.code === 'PGRST116') {
              return res.status(404).json({
                success: false,
                message: 'No active iteration found',
              });
            }
            throw errActive;
          }
          iteration = activeIter;
          iterationId = activeIter.id;
        }

        // fetch roles for this person in this iteration
        const { data: roles, error: errRoles } = await supabase
          .from('person_roles')
          .select('id, org_unit_id, is_manager, iteration_id, description')
          .eq('person_id', person.id)
          .eq('iteration_id', iterationId);
        if (errRoles) throw errRoles;

        if (!roles || roles.length === 0) {
          return res.status(200).json({
            success: true,
            person,
            iteration,
            roles: [],
          });
        }

        // fetch org units for name mapping
        const orgUnitIds = [...new Set(roles.map((r) => r.org_unit_id))];
        const { data: units, error: errUnits } = await supabase
          .from('organization_units')
          .select('id,name')
          .in('id', orgUnitIds);
        if (errUnits) throw errUnits;
        const unitMap = new Map((units || []).map((u) => [u.id, u.name]));

        const shaped = roles.map((r) => ({
          role_id: r.id,
          org_unit_id: r.org_unit_id,
          org_unit_name: unitMap.get(r.org_unit_id) || `Unit ${r.org_unit_id}`,
          is_manager: !!r.is_manager,
          role_label: r.is_manager ? 'Manager' : 'Member',
          iteration_id: r.iteration_id,
          description: r.description || null,
        }));

        return res.status(200).json({
          success: true,
          person,
          iteration,
          roles: shaped,
        });
      }

      default:
        return res
          .status(400)
          .json({ success: false, message: `Unknown action: ${action}` });
    }

    // Method not matched for this action
    return res
      .status(405)
      .json({ success: false, message: 'Method not allowed' });
  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({
      success: false,
      message: err?.message || 'Internal server error',
      error: {
        code: err?.code || null,
      },
    });
  }
}

