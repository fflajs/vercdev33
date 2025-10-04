import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const {
    query: { action },
    method,
    body,
  } = req;

  const log = (msg, obj) =>
    console.info(`[${new Date().toISOString()}] [admin-api] ${msg}`, obj ?? '');

  log(`➡️ action=${action}, method=${method}`);

  try {
    switch (action) {
      /**
       * ===================================================
       * ACTIVE ITERATION
       * ===================================================
       */
      case 'active-iteration': {
        if (method !== 'GET') break;

        const { data, error } = await supabase
          .from('iterations')
          .select('*')
          .is('end_date', null)
          .order('id', { ascending: false })
          .maybeSingle();
        if (error) throw error;

        if (!data) return res.json({ success: false, message: 'No active iteration' });
        return res.json({ success: true, iteration: data });
      }

      /**
       * ===================================================
       * PEOPLE (REGISTER)
       * ===================================================
       */
      case 'people': {
        if (method !== 'POST') break;

        const { name } = body || {};
        if (!name) return res.status(400).json({ success: false, message: 'Name required' });

        // Exists?
        const { data: exists, error: exErr } = await supabase
          .from('people')
          .select('*')
          .eq('name', name)
          .maybeSingle();
        if (exErr) throw exErr;
        if (exists) {
          return res.status(409).json({ success: false, message: `Name "${name}" already exists.` });
        }

        const { data, error } = await supabase
          .from('people')
          .insert([{ name }])
          .select()
          .single();
        if (error) throw error;

        log('✅ people → insert result', data);
        return res.json({ success: true, person: data });
      }

      /**
       * ===================================================
       * GET USER ROLES (login-user.html)
       * ===================================================
       */
      case 'get-user-roles': {
        if (method !== 'GET') break;

        const { name } = req.query;
        if (!name) return res.status(400).json({ success: false, message: 'name required' });

        const { data: user, error: userErr } = await supabase
          .from('people')
          .select('*')
          .eq('name', name)
          .maybeSingle();
        if (userErr) throw userErr;
        if (!user) return res.json({ success: false, message: 'User not found' });

        const { data: iteration, error: iterErr } = await supabase
          .from('iterations')
          .select('*')
          .is('end_date', null)
          .order('id', { ascending: false })
          .maybeSingle();
        if (iterErr) throw iterErr;
        if (!iteration) return res.json({ success: false, message: 'No active iteration' });

        const { data: roles, error: roleErr } = await supabase
          .from('person_roles')
          .select(
            'id, is_manager, org_unit_id, iteration_id, organization_units(id,name,parent_id)'
          )
          .eq('person_id', user.id)
          .eq('iteration_id', iteration.id);
        if (roleErr) throw roleErr;

        log('ℹ️ get-user-roles result', { user, iteration, rolesCount: roles?.length ?? 0 });
        return res.json({ success: true, user, iteration, roles });
      }

      /**
       * ===================================================
       * GET ROLE CONTEXT (portal & others)
       * ===================================================
       */
      case 'get-role-context': {
        if (method !== 'GET') break;

        const { role_id } = req.query;
        if (!role_id) return res.status(400).json({ success: false, message: 'role_id required' });

        const { data: role, error: roleErr } = await supabase
          .from('person_roles')
          .select('id,is_manager,iteration_id,organization_units(id,name),people(name)')
          .eq('id', role_id)
          .single();
        if (roleErr) throw roleErr;

        const { data: iter, error: iterErr } = await supabase
          .from('iterations')
          .select('*')
          .eq('id', role.iteration_id)
          .single();
        if (iterErr) throw iterErr;

        const context = {
          user: role.people?.name ?? '??',
          roleType: role.is_manager ? 'Manager' : 'Member',
          unitName: role.organization_units?.name ?? '??',
          iterName: iter.name,
          iterId: iter.id,
          qset: iter.question_set,
        };
        log('ℹ️ get-role-context result', context);
        return res.json({ success: true, context });
      }

      /**
       * ===================================================
       * ORG DATA (Org Manager tree)
       * ===================================================
       */
      case 'org-data': {
        if (method !== 'GET') break;

        const { iteration_id } = req.query;
        if (!iteration_id)
          return res.status(400).json({ success: false, message: 'iteration_id required' });

        const { data: units, error: uErr } = await supabase
          .from('organization_units')
          .select('*')
          .eq('iteration_id', iteration_id);
        if (uErr) throw uErr;

        const { data: roles, error: rErr } = await supabase
          .from('person_roles')
          .select('*, people(name)')
          .eq('iteration_id', iteration_id);
        if (rErr) throw rErr;

        const { data: people, error: pErr } = await supabase.from('people').select('*');
        if (pErr) throw pErr;

        log('ℹ️ org-data result', {
          units: units?.length ?? 0,
          roles: roles?.length ?? 0,
          people: people?.length ?? 0,
        });
        return res.json({ success: true, units, roles, people });
      }

      /**
       * ===================================================
       * ORG MANAGER MUTATIONS
       *  - add-unit
       *  - delete-unit
       *  - assign-role
       *  - remove-role
       * ===================================================
       */

      // Create org unit (optionally with parent)
      case 'add-unit': {
        if (method !== 'POST') break;

        const { name, parent_id = null, iteration_id } = body || {};
        if (!name || !iteration_id) {
          return res
            .status(400)
            .json({ success: false, message: 'name and iteration_id are required' });
        }

        const { data, error } = await supabase
          .from('organization_units')
          .insert([{ name, parent_id, iteration_id }])
          .select()
          .single();
        if (error) throw error;

        log('✅ add-unit → inserted', data);
        return res.json({ success: true, unit: data });
      }

      // Delete org unit (safe: only if leaf)
      case 'delete-unit': {
        if (method !== 'POST') break;

        const { unit_id } = body || {};
        if (!unit_id) {
          return res.status(400).json({ success: false, message: 'unit_id required' });
        }

        // Check children
        const { data: children, error: cErr } = await supabase
          .from('organization_units')
          .select('id')
          .eq('parent_id', unit_id);
        if (cErr) throw cErr;

        if ((children?.length ?? 0) > 0) {
          return res.status(409).json({
            success: false,
            message: 'Cannot delete: unit has sub-units. Delete children first.',
          });
        }

        // Delete
        const { error: dErr } = await supabase
          .from('organization_units')
          .delete()
          .eq('id', unit_id);
        if (dErr) throw dErr;

        log('✅ delete-unit → deleted', { unit_id });
        return res.json({ success: true, message: 'Unit deleted' });
      }

      // Assign a person to a unit (manager or member)
      case 'assign-role': {
        if (method !== 'POST') break;

        const { person_id, org_unit_id, is_manager, iteration_id } = body || {};
        if (!person_id || !org_unit_id || iteration_id == null || is_manager == null) {
          return res.status(400).json({
            success: false,
            message: 'person_id, org_unit_id, iteration_id and is_manager are required',
          });
        }

        // Check duplicates (unique constraint: person_id, org_unit_id, is_manager, iteration_id)
        const { data: exists, error: exErr } = await supabase
          .from('person_roles')
          .select('id')
          .eq('person_id', person_id)
          .eq('org_unit_id', org_unit_id)
          .eq('is_manager', !!is_manager)
          .eq('iteration_id', iteration_id)
          .maybeSingle();
        if (exErr) throw exErr;
        if (exists) {
          return res
            .status(409)
            .json({ success: false, message: 'This role assignment already exists' });
        }

        const { data, error } = await supabase
          .from('person_roles')
          .insert([{ person_id, org_unit_id, is_manager: !!is_manager, iteration_id }])
          .select()
          .single();
        if (error) throw error;

        log('✅ assign-role → inserted', data);
        return res.json({ success: true, role: data });
      }

      // Remove role by id
      case 'remove-role': {
        if (method !== 'POST') break;

        const { role_id } = body || {};
        if (!role_id) return res.status(400).json({ success: false, message: 'role_id required' });

        const { error } = await supabase.from('person_roles').delete().eq('id', role_id);
        if (error) throw error;

        log('✅ remove-role → deleted', { role_id });
        return res.json({ success: true, message: 'Role removed' });
      }

      /**
       * ===================================================
       * TABLE VIEWER (dual mode)
       *  - Admin (no role_id): full tables
       *  - User (role_id): filtered by current iteration for selected tables
       * ===================================================
       */
      case 'table-viewer': {
        if (method !== 'GET') break;

        const { table, role_id } = req.query;
        if (!table) return res.status(400).json({ success: false, message: 'table required' });

        let query = supabase.from(table).select('*');

        if (role_id) {
          // Derive iteration for this role
          const { data: role, error: rErr } = await supabase
            .from('person_roles')
            .select('iteration_id')
            .eq('id', role_id)
            .single();
          if (rErr) throw rErr;
          if (!role) return res.json({ success: false, message: 'Role not found' });

          if (['organization_units', 'person_roles', 'surveys'].includes(table)) {
            query = query.eq('iteration_id', role.iteration_id);
          }
        }

        const { data, error } = await query;
        if (error) throw error;

        log('ℹ️ table-viewer result', { table, count: data?.length ?? 0, role_id: role_id ?? null });
        return res.json({ success: true, data });
      }

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }

    // Fallback: method not allowed for matched action
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (err) {
    console.error('[admin-api] ERROR', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

