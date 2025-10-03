// api/admin/[action].js
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
       * PEOPLE: Register new user
       */
      case 'people':
        if (method === 'POST') {
          const { name } = body;
          if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

          // Check duplicate
          const { data: exists, error: errExists } = await supabase
            .from('people')
            .select('*')
            .eq('name', name)
            .maybeSingle();
          if (errExists) throw errExists;
          if (exists) return res.status(409).json({ success: false, message: `Name "${name}" already exists.` });

          const { data, error } = await supabase.from('people').insert([{ name }]).select().single();
          if (error) throw error;
          console.info(`[people] Inserted`, data);
          return res.status(201).json({ success: true, person: data });
        }
        break;

      /**
       * ITERATIONS
       */
      case 'create-iteration':
        if (method === 'POST') {
          const { name, question_set } = body;
          if (!name || !question_set)
            return res.status(400).json({ success: false, message: 'Name and question_set required' });

          // Insert new iteration
          const { data: newIter, error: errNew } = await supabase
            .from('iterations')
            .insert([{ name, question_set }])
            .select()
            .single();
          if (errNew) throw errNew;

          // Clone org structure from last iteration if exists
          const { data: lastIter } = await supabase
            .from('iterations')
            .select('id')
            .lt('id', newIter.id)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastIter) {
            console.info(`[create-iteration] Cloning org from iteration ${lastIter.id}`);
            const { data: units } = await supabase.from('organization_units').select('*').eq('iteration_id', lastIter.id);
            const unitMap = {};
            for (let u of units || []) {
              const { data: inserted } = await supabase
                .from('organization_units')
                .insert([{ name: u.name, parent_id: u.parent_id ? unitMap[u.parent_id] : null, iteration_id: newIter.id }])
                .select()
                .single();
              unitMap[u.id] = inserted.id;
            }
            const { data: roles } = await supabase.from('person_roles').select('*').eq('iteration_id', lastIter.id);
            for (let r of roles || []) {
              await supabase.from('person_roles').insert([{
                person_id: r.person_id,
                org_unit_id: unitMap[r.org_unit_id],
                is_manager: r.is_manager,
                iteration_id: newIter.id,
                description: r.description,
              }]);
            }
          }

          return res.status(201).json({ success: true, iteration: newIter });
        }
        break;

      case 'close-iteration':
        if (method === 'POST') {
          const { id } = body;
          if (!id) return res.status(400).json({ success: false, message: 'Iteration ID required' });

          const { data, error } = await supabase
            .from('iterations')
            .update({ end_date: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
          if (error) throw error;
          return res.json({ success: true, iteration: data });
        }
        break;

      case 'active-iteration':
        if (method === 'GET') {
          const { data, error } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          if (!data) return res.status(404).json({ success: false, message: 'No active iteration found' });
          return res.json({ success: true, iteration: data });
        }
        break;

      /**
       * ORGANIZATION
       */
      case 'create-org-unit':
        if (method === 'POST') {
          const { name, parent_id, iteration_id } = body;
          if (!name || !iteration_id)
            return res.status(400).json({ success: false, message: 'Name and iteration_id required' });

          const { data, error } = await supabase
            .from('organization_units')
            .insert([{ name, parent_id, iteration_id }])
            .select()
            .single();
          if (error) throw error;
          return res.status(201).json({ success: true, unit: data });
        }
        break;

      case 'org-data':
        if (method === 'GET') {
          const { iteration_id } = req.query;
          if (!iteration_id) return res.status(400).json({ success: false, message: 'iteration_id required' });

          const { data: units, error: errUnits } = await supabase
            .from('organization_units')
            .select('*')
            .eq('iteration_id', iteration_id);
          if (errUnits) throw errUnits;

          const { data: roles, error: errRoles } = await supabase
            .from('person_roles')
            .select(`id, person_id, org_unit_id, is_manager, description, iteration_id, people(name)`)
            .eq('iteration_id', iteration_id);
          if (errRoles) throw errRoles;

          const { data: people, error: errPeople } = await supabase.from('people').select('*');
          if (errPeople) throw errPeople;

          return res.json({ success: true, units, roles, people });
        }
        break;

      /**
       * TABLE VIEWER
       */
      case 'table-viewer':
        if (method === 'GET') {
          const { table } = req.query;
          if (!table) return res.status(400).json({ success: false, message: 'Table name required' });

          const { data, error } = await supabase.from(table).select('*');
          if (error) throw error;
          return res.json({ success: true, rows: data });
        }
        break;

      /**
       * LOGIN SUPPORT
       */
      case 'get-user-roles':
        if (method === 'GET') {
          const { name } = req.query;
          if (!name) return res.status(400).json({ success: false, message: 'Name required' });

          const { data: user } = await supabase.from('people').select('*').eq('name', name).maybeSingle();
          if (!user) return res.status(404).json({ success: false, message: 'User not found' });

          const { data: iteration } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!iteration) return res.status(404).json({ success: false, message: 'No active iteration' });

          const { data: roles } = await supabase
            .from('person_roles')
            .select('id, is_manager, org_unit_id, iteration_id, unit:organization_units(id,name,parent_id)')
            .eq('person_id', user.id)
            .eq('iteration_id', iteration.id);

          return res.json({ success: true, user, iteration, roles });
        }
        break;

      case 'get-role-context':
        if (method === 'GET') {
          const { role_id } = req.query;
          if (!role_id) return res.status(400).json({ success: false, message: 'role_id required' });

          const { data: role } = await supabase
            .from('person_roles')
            .select('id, is_manager, description, iteration_id, org_unit_id, people(name), unit:organization_units(name)')
            .eq('id', role_id)
            .single();
          if (!role) return res.status(404).json({ success: false, message: 'Role not found' });

          const { data: iteration } = await supabase.from('iterations').select('*').eq('id', role.iteration_id).single();

          return res.json({
            success: true,
            context: {
              user: role.people.name,
              roleType: role.is_manager ? 'Manager' : 'Member',
              unitName: role.unit.name,
              iterName: iteration.name,
              iterId: iteration.id,
              qset: iteration.question_set,
            },
          });
        }
        break;

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`[${action}] ERROR`, err);
    return res.status(500).json({ success: false, message: err.message, error: err });
  }
}

