import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { query, method } = req;
  const { action } = query;

  console.info(`[${new Date().toISOString()}] ➡️ Admin API called: action=${action}, method=${method}`);

  try {
    switch (action) {
      /**
       * ---------------------------
       * Get role context by role_id
       * ---------------------------
       */
      case 'get-role-context': {
        if (method !== 'GET') {
          return res.status(405).json({ success: false, message: 'Method not allowed' });
        }

        const roleId = query.role_id;
        if (!roleId) {
          return res.status(400).json({ success: false, message: 'role_id required' });
        }

        console.info(`[get-role-context] Fetching context for role_id=${roleId}`);

        const { data: role, error: roleErr } = await supabase
          .from('person_roles')
          .select(`
            id,
            is_manager,
            iteration_id,
            description,
            org_unit_id,
            person:people(id, name),
            unit:organization_units(id, name, parent_id),
            iteration:iterations(id, name, question_set)
          `)
          .eq('id', roleId)
          .single();

        if (roleErr) {
          console.error('[get-role-context] DB error', roleErr);
          return res.status(500).json({ success: false, message: 'Error fetching role context', error: roleErr });
        }

        const payload = {
          success: true,
          user: { id: role.person.id, name: role.person.name },
          roleType: role.is_manager ? 'Manager' : 'Coworker',
          unitName: role.unit?.name || null,
          iterName: role.iteration?.name || null,
          iterId: role.iteration?.id || null,
          qset: role.iteration?.question_set || null,
          description: role.description || null,
        };

        console.info('[get-role-context] Returning payload', payload);
        return res.status(200).json(payload);
      }

      /**
       * --------------------------------
       * Get roles available for a person
       * --------------------------------
       */
      case 'get-user-roles': {
        if (method !== 'GET') {
          return res.status(405).json({ success: false, message: 'Method not allowed' });
        }

        const { name } = query;
        if (!name) {
          return res.status(400).json({ success: false, message: 'Name required' });
        }

        console.info(`[get-user-roles] Fetching roles for person name=${name}`);

        // find person
        const { data: person, error: personErr } = await supabase
          .from('people')
          .select('id, name')
          .eq('name', name)
          .single();

        if (personErr) {
          console.error('[get-user-roles] Person not found', personErr);
          return res.status(404).json({ success: false, message: 'Person not found', error: personErr });
        }

        // active iteration
        const { data: iteration, error: iterErr } = await supabase
          .from('iterations')
          .select('*')
          .is('end_date', null)
          .order('id', { ascending: false })
          .limit(1)
          .single();

        if (iterErr) {
          console.error('[get-user-roles] Iteration fetch failed', iterErr);
          return res.status(500).json({ success: false, message: 'Error fetching active iteration', error: iterErr });
        }

        // roles
        const { data: roles, error: rolesErr } = await supabase
          .from('person_roles')
          .select(`
            id,
            is_manager,
            org_unit_id,
            iteration_id,
            unit:organization_units(id, name, parent_id)
          `)
          .eq('person_id', person.id)
          .eq('iteration_id', iteration.id);

        if (rolesErr) {
          console.error('[get-user-roles] Roles fetch failed', rolesErr);
          return res.status(500).json({ success: false, message: 'Error fetching roles', error: rolesErr });
        }

        const payload = {
          success: true,
          user: person,
          iteration,
          roles
        };

        console.info('[get-user-roles] Returning payload', payload);
        return res.status(200).json(payload);
      }

      /**
       * Default
       */
      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`[${action}] Uncaught error`, err);
    return res.status(500).json({ success: false, message: 'Server error', error: err });
  }
}

