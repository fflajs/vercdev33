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

  console.info(`[${new Date().toISOString()}] ➡️ Admin API called: action=${action}, method=${method}`);

  try {
    switch (action) {
      /**
       * ACTIVE ITERATION
       */
      case 'active-iteration': {
        if (method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });
        const { data, error } = await supabase
          .from('iterations')
          .select('*')
          .is('end_date', null)
          .single();
        if (error && error.code !== 'PGRST116') throw error;
        if (!data) return res.status(200).json({ success: false, message: 'No active iteration found' });
        return res.status(200).json({ success: true, iteration: data });
      }

      /**
       * CREATE ITERATION (with cloning)
       */
      case 'create-iteration': {
        if (method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
        const { name, set } = body;
        if (!name || !set) return res.status(400).json({ success: false, message: 'Name and set are required' });

        // End current iteration if exists
        await supabase.from('iterations').update({ end_date: new Date().toISOString() }).is('end_date', null);

        // Find last iteration
        const { data: lastIter } = await supabase.from('iterations').select('*').order('id', { ascending: false }).limit(1).maybeSingle();

        // Create new iteration
        const { data: newIter, error: errNew } = await supabase
          .from('iterations')
          .insert([{ name, question_set: set }])
          .select()
          .single();
        if (errNew) throw errNew;

        // Clone org units + roles if last iteration exists
        if (lastIter) {
          const { data: prevUnits } = await supabase.from('organization_units').select('*').eq('iteration_id', lastIter.id);
          if (prevUnits?.length) {
            const idMap = {};
            for (const u of prevUnits) {
              const { data: ins, error: insErr } = await supabase
                .from('organization_units')
                .insert([{ name: u.name, parent_id: u.parent_id ? idMap[u.parent_id] : null, iteration_id: newIter.id }])
                .select()
                .single();
              if (insErr) throw insErr;
              idMap[u.id] = ins.id;
            }
            const { data: prevRoles } = await supabase.from('person_roles').select('*').eq('iteration_id', lastIter.id);
            for (const r of prevRoles) {
              const { error: insRoleErr } = await supabase.from('person_roles').insert([{
                person_id: r.person_id,
                org_unit_id: idMap[r.org_unit_id],
                is_manager: r.is_manager,
                description: r.description,
                iteration_id: newIter.id
              }]);
              if (insRoleErr) throw insRoleErr;
            }
          }
        }

        return res.status(200).json({ success: true, iteration: newIter });
      }

      /**
       * CLOSE ITERATION
       */
      case 'close-iteration': {
        if (method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
        const { iteration_id } = body;
        if (!iteration_id) return res.status(400).json({ success: false, message: 'Iteration ID required' });

        const { error } = await supabase.from('iterations').update({ end_date: new Date().toISOString() }).eq('id', iteration_id);
        if (error) throw error;

        return res.status(200).json({ success: true });
      }

      /**
       * PEOPLE (registration)
       */
      case 'people': {
        if (method === 'POST') {
          const { name } = body;
          if (!name) return res.status(400).json({ success: false, message: 'Name required' });

          const { data: existing } = await supabase.from('people').select('id').eq('name', name).maybeSingle();
          if (existing) return res.status(409).json({ success: false, message: `Name "${name}" already exists` });

          const { data, error } = await supabase.from('people').insert([{ name }]).select().single();
          if (error) throw error;
          return res.status(200).json({ success: true, person: data });
        }
        return res.status(405).json({ success: false, message: 'Method not allowed' });
      }

      /**
       * GET USER ROLES
       */
      case 'get-user-roles': {
        if (method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });
        const { name } = req.query;
        if (!name) return res.status(400).json({ success: false, message: 'Name required' });

        const { data: user } = await supabase.from('people').select('*').eq('name', name).single();
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const { data: iteration } = await supabase.from('iterations').select('*').is('end_date', null).single();
        if (!iteration) return res.status(404).json({ success: false, message: 'No active iteration' });

        const { data: roles, error: errRoles } = await supabase
          .from('person_roles')
          .select('id, is_manager, org_unit_id, iteration_id, organization_units(id, name, parent_id)')
          .eq('person_id', user.id)
          .eq('iteration_id', iteration.id);
        if (errRoles) throw errRoles;

        return res.status(200).json({ success: true, user, iteration, roles });
      }

      /**
       * GET ROLE CONTEXT
       */
      case 'get-role-context': {
        if (method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });
        const { role_id } = req.query;
        if (!role_id) return res.status(400).json({ success: false, message: 'role_id required' });

        const { data: role, error } = await supabase
          .from('person_roles')
          .select('id, is_manager, iteration_id, org_unit_id, people(name), organization_units(name), iterations(name, question_set)')
          .eq('id', role_id)
          .single();
        if (error) throw error;

        return res.status(200).json({
          success: true,
          context: {
            user: role.people.name,
            roleType: role.is_manager ? 'Manager' : 'Member',
            unitName: role.organization_units.name,
            iterName: role.iterations.name,
            iterId: role.iteration_id,
            qset: role.iterations.question_set,
          }
        });
      }

      /**
       * TABLE VIEWER (dual mode)
       */
      case 'table-viewer': {
        if (method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });
        const { table, role_id } = req.query;

        let filterIterationId = null;
        if (role_id) {
          // fetch iteration_id via role context
          const { data: role, error } = await supabase
            .from('person_roles')
            .select('iteration_id')
            .eq('id', role_id)
            .single();
          if (error) throw error;
          filterIterationId = role.iteration_id;
        }

        let query = supabase.from(table).select('*');

        // Apply iteration_id filter in user mode (if column exists)
        if (filterIterationId) {
          const tablesWithIter = ['organization_units', 'person_roles', 'surveys'];
          if (tablesWithIter.includes(table)) {
            query = query.eq('iteration_id', filterIterationId);
          }
        }

        const { data, error } = await query;
        if (error) throw error;
        return res.status(200).json({ success: true, data });
      }

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ERROR action=${action}:`, err);
    return res.status(500).json({ success: false, message: `Error in ${action}`, error: err });
  }
}

