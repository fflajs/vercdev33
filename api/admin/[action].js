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
       * ACTIVE ITERATION
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
       * ORG DATA
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
       * ADD UNIT
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

      /**
       * DELETE UNIT (cascade)
       */
      case 'delete-unit': {
        if (method !== 'DELETE') break;
        const { unit_id } = req.query;
        if (!unit_id) return res.status(400).json({ success: false, message: 'unit_id required' });

        async function cascadeDelete(unitId) {
          // delete roles in this unit
          const { error: rErr } = await supabase
            .from('person_roles')
            .delete()
            .eq('org_unit_id', unitId);
          if (rErr) throw rErr;

          // find children
          const { data: children, error: cErr } = await supabase
            .from('organization_units')
            .select('id')
            .eq('parent_id', unitId);
          if (cErr) throw cErr;

          for (const child of children) {
            await cascadeDelete(child.id);
          }

          // delete the unit itself
          const { error: dErr } = await supabase
            .from('organization_units')
            .delete()
            .eq('id', unitId);
          if (dErr) throw dErr;
        }

        await cascadeDelete(unit_id);

        return res.json({ success: true, message: 'Unit and all subunits/roles deleted' });
      }

      /**
       * ADD ROLE
       */
      case 'add-role': {
        if (method !== 'POST') break;
        const { person_id, org_unit_id, is_manager, iteration_id } = body || {};
        if (!person_id || !org_unit_id || iteration_id == null || is_manager == null) {
          return res.status(400).json({ success: false, message: 'person_id, org_unit_id, is_manager, iteration_id required' });
        }

        const { data, error } = await supabase
          .from('person_roles')
          .insert([{ person_id, org_unit_id, is_manager, iteration_id }])
          .select()
          .single();
        if (error) throw error;

        return res.json({ success: true, role: data });
      }

      /**
       * REMOVE ROLE
       */
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

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }

    return res.status(405).json({ success: false, message: `Method ${method} not allowed for action ${action}` });
  } catch (err) {
    console.error('[admin-api] ERROR', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

