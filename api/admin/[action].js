import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const {
    query: { action },
    method,
    body
  } = req;

  console.info(
    `[${new Date().toISOString()}] ➡️ Admin API called: action=${action}, method=${method}`
  );

  try {
    switch (action) {
      /**
       * ===================================================
       * ACTIVE ITERATION
       * ===================================================
       */
      case 'active-iteration':
        if (method === 'GET') {
          const { data, error } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .order('id', { ascending: false })
            .maybeSingle();
          if (error) throw error;
          if (!data)
            return res.json({
              success: false,
              message: 'No active iteration'
            });
          return res.json({ success: true, iteration: data });
        }
        break;

      /**
       * ===================================================
       * PEOPLE (REGISTER)
       * ===================================================
       */
      case 'people':
        if (method === 'POST') {
          const { name } = body;
          if (!name)
            return res
              .status(400)
              .json({ success: false, message: 'Name required' });

          const { data: exists, error: exErr } = await supabase
            .from('people')
            .select('*')
            .eq('name', name)
            .maybeSingle();
          if (exErr) throw exErr;
          if (exists)
            return res
              .status(409)
              .json({ success: false, message: 'Name already exists' });

          const { data, error } = await supabase
            .from('people')
            .insert([{ name }])
            .select()
            .single();
          if (error) throw error;
          return res.json({ success: true, person: data });
        }
        break;

      /**
       * ===================================================
       * GET USER ROLES
       * ===================================================
       */
      case 'get-user-roles':
        if (method === 'GET') {
          const { name } = req.query;
          const { data: user, error: userErr } = await supabase
            .from('people')
            .select('*')
            .eq('name', name)
            .maybeSingle();
          if (userErr) throw userErr;
          if (!user)
            return res.json({ success: false, message: 'User not found' });

          const { data: iteration, error: iterErr } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .order('id', { ascending: false })
            .maybeSingle();
          if (iterErr) throw iterErr;
          if (!iteration)
            return res.json({
              success: false,
              message: 'No active iteration'
            });

          const { data: roles, error: roleErr } = await supabase
            .from('person_roles')
            .select(
              'id, is_manager, org_unit_id, iteration_id, organization_units(id,name,parent_id)'
            )
            .eq('person_id', user.id)
            .eq('iteration_id', iteration.id);
          if (roleErr) throw roleErr;

          return res.json({ success: true, user, iteration, roles });
        }
        break;

      /**
       * ===================================================
       * GET ROLE CONTEXT
       * ===================================================
       */
      case 'get-role-context':
        if (method === 'GET') {
          const { role_id } = req.query;
          const { data: role, error: roleErr } = await supabase
            .from('person_roles')
            .select(
              'id,is_manager,iteration_id,organization_units(id,name),people(name)'
            )
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
              qset: iter.question_set
            }
          });
        }
        break;

      /**
       * ===================================================
       * ORG DATA (Org Manager)
       * ===================================================
       */
      case 'org-data':
        if (method === 'GET') {
          const { iteration_id } = req.query;
          if (!iteration_id)
            return res
              .status(400)
              .json({ success: false, message: 'iteration_id required' });

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
            .select('*');
          if (pErr) throw pErr;

          return res.json({ success: true, units, roles, people });
        }
        break;

      /**
       * ===================================================
       * ORG MANAGEMENT (CRUD)
       * ===================================================
       */
      case 'add-unit':
        if (method === 'POST') {
          const { name, parent_id, iteration_id } = body;
          if (!name || !iteration_id)
            return res
              .status(400)
              .json({ success: false, message: 'name + iteration_id required' });

          const { data, error } = await supabase
            .from('organization_units')
            .insert([{ name, parent_id, iteration_id }])
            .select()
            .single();
          if (error) throw error;

          return res.json({ success: true, unit: data });
        }
        break;

      case 'delete-unit':
        if (method === 'DELETE') {
          const { unit_id } = req.query;
          if (!unit_id)
            return res
              .status(400)
              .json({ success: false, message: 'unit_id required' });

          // delete roles first
          await supabase.from('person_roles').delete().eq('org_unit_id', unit_id);

          // delete unit
          const { error } = await supabase
            .from('organization_units')
            .delete()
            .eq('id', unit_id);
          if (error) throw error;

          return res.json({ success: true });
        }
        break;

      case 'add-role':
        if (method === 'POST') {
          const { person_id, org_unit_id, is_manager, iteration_id } = body;
          if (!person_id || !org_unit_id || !iteration_id)
            return res.status(400).json({
              success: false,
              message: 'person_id, org_unit_id, iteration_id required'
            });

          const { data, error } = await supabase
            .from('person_roles')
            .insert([{ person_id, org_unit_id, is_manager, iteration_id }])
            .select()
            .single();
          if (error) throw error;

          return res.json({ success: true, role: data });
        }
        break;

      case 'remove-role':
        if (method === 'DELETE') {
          const { role_id } = req.query;
          if (!role_id)
            return res
              .status(400)
              .json({ success: false, message: 'role_id required' });

          const { error } = await supabase
            .from('person_roles')
            .delete()
            .eq('id', role_id);
          if (error) throw error;

          return res.json({ success: true });
        }
        break;

      /**
       * ===================================================
       * TABLE VIEWER (dual mode)
       * ===================================================
       */
      case 'table-viewer':
        if (method === 'GET') {
          const { table, role_id } = req.query;
          if (!table)
            return res
              .status(400)
              .json({ success: false, message: 'table required' });

          let query = supabase.from(table).select('*');

          if (role_id) {
            // user mode → filter by iteration
            const { data: role, error: rErr } = await supabase
              .from('person_roles')
              .select('iteration_id')
              .eq('id', role_id)
              .single();
            if (rErr) throw rErr;
            if (!role)
              return res.json({ success: false, message: 'Role not found' });

            if (['organization_units', 'person_roles', 'surveys'].includes(table)) {
              query = query.eq('iteration_id', role.iteration_id);
            }
          }

          const { data, error } = await query;
          if (error) throw error;

          return res.json({ success: true, data });
        }
        break;

      default:
        return res
          .status(400)
          .json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('API error', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

