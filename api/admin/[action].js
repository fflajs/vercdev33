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
          if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

          const { data, error } = await supabase.from('people').insert([{ name }]).select().single();

          if (error) {
            if (error.code === '23505') {
              return res.status(409).json({ success: false, message: `Name "${name}" already exists.` });
            }
            throw error;
          }

          return res.status(201).json({ success: true, person: data });
        }
        break;

      /**
       * ACTIVE ITERATION
       */
      case 'active-iteration':
        if (method === 'GET') {
          const { data, error } = await supabase.from('iterations').select('*').is('end_date', null).single();
          if (error) return res.status(404).json({ success: false, message: 'No active iteration found' });
          return res.status(200).json({ success: true, iteration: data });
        }
        break;

      /**
       * CREATE ITERATION
       */
      case 'create-iteration':
        if (method === 'POST') {
          const { name, set } = body;
          if (!name || !set) return res.status(400).json({ success: false, message: 'Name and set required' });

          const { data: newIter, error: errIter } = await supabase
            .from('iterations')
            .insert([{ name, question_set: set }])
            .select()
            .single();
          if (errIter) throw errIter;

          return res.status(201).json({ success: true, iteration: newIter });
        }
        break;

      /**
       * CLOSE ITERATION
       */
      case 'close-iteration':
        if (method === 'POST') {
          const { iteration_id } = body;
          if (!iteration_id) return res.status(400).json({ success: false, message: 'Iteration ID required' });

          const { error } = await supabase
            .from('iterations')
            .update({ end_date: new Date().toISOString() })
            .eq('id', iteration_id);
          if (error) throw error;

          return res.status(200).json({ success: true });
        }
        break;

      /**
       * ORG DATA
       */
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
            .select('*')
            .eq('iteration_id', iteration_id);
          if (errRoles) throw errRoles;

          const { data: people, error: errPeople } = await supabase.from('people').select('*');
          if (errPeople) throw errPeople;

          return res.status(200).json({ success: true, units, roles, people });
        }
        break;

      /**
       * CREATE ORG UNIT
       */
      case 'create-org-unit':
        if (method === 'POST') {
          const { name, parent_id, iteration_id } = body;
          if (!name || !iteration_id) return res.status(400).json({ success: false, message: 'Missing fields' });

          const { data, error } = await supabase
            .from('organization_units')
            .insert([{ name, parent_id, iteration_id }])
            .select()
            .single();
          if (error) throw error;

          return res.status(201).json({ success: true, unit: data });
        }
        break;

      /**
       * ASSIGN ROLE
       */
      case 'assign-role':
        if (method === 'POST') {
          const { person_id, org_unit_id, is_manager, iteration_id, description } = body;
          if (!person_id || !org_unit_id || !iteration_id)
            return res.status(400).json({ success: false, message: 'Missing fields' });

          const { data, error } = await supabase
            .from('person_roles')
            .insert([{ person_id, org_unit_id, is_manager, iteration_id, description }])
            .select()
            .single();
          if (error) throw error;

          return res.status(201).json({ success: true, role: data });
        }
        break;

      /**
       * GET USER ROLES
       */
      case 'get-user-roles':
        if (method === 'GET') {
          const { name } = req.query;
          if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

          // 1. Person
          const { data: person, error: errPerson } = await supabase.from('people').select('*').eq('name', name).single();
          if (errPerson) return res.status(404).json({ success: false, message: `No person found with name ${name}` });

          // 2. Active iteration
          const { data: iteration, error: errIter } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .single();
          if (errIter) return res.status(404).json({ success: false, message: 'No active iteration found' });

          // 3. Person roles
          const { data: roles, error: errRoles } = await supabase
            .from('person_roles')
            .select('*')
            .eq('person_id', person.id)
            .eq('iteration_id', iteration.id);
          if (errRoles) throw errRoles;

          const roleResults = [];
          for (const r of roles) {
            const { data: unit } = await supabase
              .from('organization_units')
              .select('id,name')
              .eq('id', r.org_unit_id)
              .single();

            roleResults.push({
              person_role_id: r.id,
              org_unit_id: r.org_unit_id,
              org_unit_name: unit ? unit.name : '?',
              is_manager: r.is_manager,
              iteration_id: iteration.id,
              iteration_name: iteration.name,
              question_set: iteration.question_set,
              person_name: person.name,
            });
          }

          return res.status(200).json({ success: true, roles: roleResults });
        }
        break;

      /**
       * TABLE VIEWER
       */
      case 'table-viewer':
        if (method === 'GET') {
          const { table } = req.query;
          if (!table) return res.status(400).json({ success: false, message: 'Table required' });

          const { data, error } = await supabase.from(table).select('*');
          if (error) return res.status(400).json({ success: false, message: error.message });
          return res.status(200).json({ success: true, rows: data });
        }
        break;

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Error in action=${action}`, err);
    return res.status(500).json({ success: false, message: 'Internal server error', error: err });
  }
}

