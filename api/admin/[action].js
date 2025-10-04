import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function log(msg, obj) {
  const t = new Date().toISOString();
  if (obj !== undefined) {
    console.info(`[${t}] [admin-api] ${msg}`, obj);
  } else {
    console.info(`[${t}] [admin-api] ${msg}`);
  }
}

export default async function handler(req, res) {
  const {
    query: { action },
    method,
    body
  } = req;

  log(`➡️ Admin API called: action=${action}, method=${method}`);

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
       * ITERATION MANAGER
       * ===================================================
       */
      case 'create-iteration': {
        if (method !== 'POST') break;
        const { name, question_set } = body || {};
        if (!name || !question_set) {
          return res.status(400).json({ success: false, message: 'name and question_set required' });
        }

        // Create new iteration
        const { data: newIter, error: errNew } = await supabase
          .from('iterations')
          .insert([{ name, question_set }])
          .select()
          .single();
        if (errNew) throw errNew;

        log('Created iteration', newIter);

        // Find previous iteration (highest id lower than new)
        const { data: prevIter, error: errPrev } = await supabase
          .from('iterations')
          .select('*')
          .lt('id', newIter.id)
          .order('id', { ascending: false })
          .maybeSingle();
        if (errPrev) throw errPrev;

        // If there was a previous iteration, clone org units
        if (prevIter) {
          const { data: prevUnits, error: errUnits } = await supabase
            .from('organization_units')
            .select('*')
            .eq('iteration_id', prevIter.id);
          if (errUnits) throw errUnits;

          // Map old id -> new id
          const idMap = new Map();

          // First pass: insert roots
          for (const u of prevUnits.filter(u => u.parent_id == null)) {
            const { data: inserted, error: e } = await supabase
              .from('organization_units')
              .insert([{ name: u.name, parent_id: null, iteration_id: newIter.id }])
              .select()
              .single();
            if (e) throw e;
            idMap.set(u.id, inserted.id);
          }

          // Subsequent passes until all are inserted
          let remaining = prevUnits.filter(u => u.parent_id != null);
          let guard = 0;
          while (remaining.length && guard < 2000) {
            const still = [];
            for (const u of remaining) {
              const newParent = idMap.get(u.parent_id);
              if (!newParent) {
                still.push(u);
                continue;
              }
              const { data: inserted, error: e } = await supabase
                .from('organization_units')
                .insert([{ name: u.name, parent_id: newParent, iteration_id: newIter.id }])
                .select()
                .single();
              if (e) throw e;
              idMap.set(u.id, inserted.id);
            }
            if (still.length === remaining.length) break;
            remaining = still;
            guard++;
          }
          log('Cloned org units from previous iteration', { prevIterId: prevIter.id, count: idMap.size });
        }

        return res.json({ success: true, iteration: newIter });
      }

      case 'close-iteration': {
        if (method !== 'POST') break;
        const { iteration_id } = body || {};
        if (!iteration_id) {
          return res.status(400).json({ success: false, message: 'Iteration ID required' });
        }
        const { data, error } = await supabase
          .from('iterations')
          .update({ end_date: new Date().toISOString() })
          .eq('id', iteration_id)
          .select()
          .single();
        if (error) throw error;
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

        const { data: exists, error: exErr } = await supabase
          .from('people')
          .select('*')
          .eq('name', name)
          .maybeSingle();
        if (exErr) throw exErr;
        if (exists) return res.status(409).json({ success: false, message: 'Name already exists' });

        const { data, error } = await supabase
          .from('people')
          .insert([{ name }])
          .select()
          .single();
        if (error) throw error;
        return res.json({ success: true, person: data });
      }

      /**
       * ===================================================
       * LOGIN: GET USER ROLES (current active iteration)
       * ===================================================
       */
      case 'get-user-roles': {
        if (method !== 'GET') break;
        const { name } = req.query;
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
          .select('id, is_manager, org_unit_id, iteration_id, organization_units(id,name,parent_id)')
          .eq('person_id', user.id)
          .eq('iteration_id', iteration.id);
        if (roleErr) throw roleErr;

        return res.json({ success: true, user, iteration, roles });
      }

      /**
       * ===================================================
       * CONTEXT FOR A ROLE (portal + pages)
       * ===================================================
       */
      case 'get-role-context': {
        if (method !== 'GET') break;

        const { role_id } = req.query;
        const { data: role, error: roleErr } = await supabase
          .from('person_roles')
          .select('id,is_manager,iteration_id,org_unit_id,organization_units(id,name),people(name)')
          .eq('id', role_id)
          .single();
        if (roleErr) throw roleErr;

        const { data: iter, error: iterErr } = await supabase
          .from('iterations')
          .select('*')
          .eq('id', role.iteration_id)
          .single();
        if (iterErr) throw iterErr;

        return res.json({
          success: true,
          context: {
            user: role.people.name,
            roleType: role.is_manager ? 'Manager' : 'Member',
            unitName: role.organization_units?.name ?? '??',
            iterName: iter.name,
            iterId: iter.id,
            qset: iter.question_set,
            orgUnitId: role.org_unit_id
          }
        });
      }

      /**
       * ===================================================
       * ORG DATA (Org Manager)
       * ===================================================
       */
      case 'org-data': {
        if (method !== 'GET') break;
        const { iteration_id } = req.query;
        if (!iteration_id) return res.status(400).json({ success: false, message: 'iteration_id required' });

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

        const { data: people, error: pErr } = await supabase
          .from('people')
          .select('*')
          .order('name', { ascending: true });
        if (pErr) throw pErr;

        return res.json({ success: true, units, roles, people });
      }

      /**
       * ===================================================
       * ORG MUTATIONS: ADD/DELETE UNIT, ADD/REMOVE ROLE
       * ===================================================
       */
      case 'add-unit': {
        if (method !== 'POST') break;
        const { name, parent_id, iteration_id } = body || {};
        if (!name || !iteration_id) {
          return res.status(400).json({ success: false, message: 'name and iteration_id required' });
        }
        const insertObj = { name, iteration_id, parent_id: parent_id ?? null };
        const { data, error } = await supabase
          .from('organization_units')
          .insert([insertObj])
          .select()
          .single();
        if (error) throw error;
        return res.json({ success: true, unit: data });
      }

      case 'delete-unit': {
        if (method !== 'DELETE') break;
        const { unit_id } = req.query;
        if (!unit_id) return res.status(400).json({ success: false, message: 'unit_id required' });

        // check children
        const { count: childCount, error: cErr } = await supabase
          .from('organization_units')
          .select('*', { count: 'exact', head: true })
          .eq('parent_id', unit_id);
        if (cErr) throw cErr;
        if (childCount > 0) {
          return res.status(400).json({ success: false, message: 'Unit has subunits. Remove them first.' });
        }

        // check roles in this unit
        const { count: roleCount, error: rErr } = await supabase
          .from('person_roles')
          .select('*', { count: 'exact', head: true })
          .eq('org_unit_id', unit_id);
        if (rErr) throw rErr;
        if (roleCount > 0) {
          return res.status(400).json({ success: false, message: 'Unit has assigned people. Remove them first.' });
        }

        const { error: dErr } = await supabase
          .from('organization_units')
          .delete()
          .eq('id', unit_id);
        if (dErr) throw dErr;

        return res.json({ success: true, message: 'Unit deleted' });
      }

      case 'add-role': {
        if (method !== 'POST') break;
        const { person_id, org_unit_id, is_manager, iteration_id } = body || {};
        if (!person_id || !org_unit_id || iteration_id == null || is_manager == null) {
          return res.status(400).json({ success: false, message: 'person_id, org_unit_id, is_manager, iteration_id required' });
        }

        // avoid duplicates (unique composite in DB may also protect)
        const { data: existing, error: exErr } = await supabase
          .from('person_roles')
          .select('id')
          .eq('person_id', person_id)
          .eq('org_unit_id', org_unit_id)
          .eq('iteration_id', iteration_id)
          .eq('is_manager', is_manager)
          .maybeSingle();
        if (exErr) throw exErr;
        if (existing) {
          return res.status(409).json({ success: false, message: 'Role already assigned' });
        }

        const { data, error } = await supabase
          .from('person_roles')
          .insert([{ person_id, org_unit_id, is_manager, iteration_id }])
          .select()
          .single();
        if (error) throw error;

        return res.json({ success: true, role: data });
      }

      case 'remove-role': {
        if (method !== 'DELETE') break;
        const { role_id } = req.query;
        if (!role_id) return res.status(400).json({ success: false, message: 'role_id required' });

        const { error } = await supabase
          .from('person_roles')
          .delete()
          .eq('id', role_id);
        if (error) throw error;
        return res.json({ success: true, message: 'Role removed' });
      }

      /**
       * ===================================================
       * TABLE VIEWER (dual mode)
       * ===================================================
       */
      case 'table-viewer': {
        if (method !== 'GET') break;
        const { table, role_id } = req.query;
        if (!table) return res.status(400).json({ success: false, message: 'table required' });

        let query = supabase.from(table).select('*');

        if (role_id) {
          // user mode → filter by iteration for relevant tables
          const { data: role, error: rErr } = await supabase
            .from('person_roles')
            .select('iteration_id')
            .eq('id', role_id)
            .single();
          if (rErr) throw rErr;
          if (!role) return res.json({ success: false, message: 'Role not found' });

          if (['organization_units', 'person_roles', 'surveys', 'app_data'].includes(table)) {
            query = query.eq('iteration_id', role.iteration_id);
          }
        }

        const { data, error } = await query;
        if (error) throw error;
        return res.json({ success: true, data });
      }

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }

    // If we fall through the switch without returning:
    return res.status(405).json({ success: false, message: `Method ${method} not allowed for action ${action}` });
  } catch (err) {
    console.error('[admin-api] ERROR', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

