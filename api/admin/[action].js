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
       * Active iteration
       */
      case 'active-iteration': {
        if (method === 'GET') {
          const { data, error } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .order('id', { ascending: false })
            .limit(1)
            .single();

          if (error && error.code !== 'PGRST116') {
            console.error("Error fetching active iteration", error);
            return res.status(500).json({ success: false, message: error.message, error });
          }

          if (!data) {
            return res.status(200).json({ success: false, message: 'No active iteration found' });
          }

          return res.status(200).json({ success: true, iteration: data });
        }
        break;
      }

      /**
       * Create iteration (with optional clone)
       */
      case 'create-iteration': {
        if (method === 'POST') {
          const { name, set } = body;
          if (!name || !set) return res.status(400).json({ success: false, message: "Name and question set required" });

          // close existing active iteration
          await supabase.from('iterations').update({ end_date: new Date().toISOString() }).is('end_date', null);

          // find last iteration
          const { data: lastIter } = await supabase
            .from('iterations')
            .select('*')
            .order('id', { ascending: false })
            .limit(1)
            .single();

          const { data: newIter, error: errNew } = await supabase
            .from('iterations')
            .insert([{ name, question_set: set }])
            .select()
            .single();
          if (errNew) throw errNew;

          if (lastIter) {
            // clone org structure
            const { data: prevUnits } = await supabase
              .from('organization_units')
              .select('*')
              .eq('iteration_id', lastIter.id);

            for (const unit of prevUnits || []) {
              const { data: newUnit, error: errUnit } = await supabase
                .from('organization_units')
                .insert([{ name: unit.name, parent_id: unit.parent_id, iteration_id: newIter.id }])
                .select()
                .single();
              if (errUnit) console.error("Unit clone error", errUnit);

              const { data: prevRoles } = await supabase
                .from('person_roles')
                .select('*')
                .eq('org_unit_id', unit.id)
                .eq('iteration_id', lastIter.id);

              for (const role of prevRoles || []) {
                await supabase
                  .from('person_roles')
                  .insert([{
                    person_id: role.person_id,
                    org_unit_id: newUnit.id,
                    is_manager: role.is_manager,
                    iteration_id: newIter.id,
                    description: role.description
                  }]);
              }
            }
          }

          return res.status(200).json({ success: true, iteration: newIter });
        }
        break;
      }

      /**
       * Close iteration
       */
      case 'close-iteration': {
        if (method === 'POST') {
          const { iteration_id } = body;
          if (!iteration_id) return res.status(400).json({ success: false, message: "Iteration ID required" });

          const { error } = await supabase
            .from('iterations')
            .update({ end_date: new Date().toISOString() })
            .eq('id', iteration_id);

          if (error) throw error;

          return res.status(200).json({ success: true, message: "Iteration closed" });
        }
        break;
      }

      /**
       * Organization manager
       */
      case 'org-data': {
        if (method === 'GET') {
          const { iteration_id } = req.query;
          if (!iteration_id) return res.status(400).json({ success: false, message: "iteration_id required" });

          const { data: units, error: errUnits } = await supabase
            .from('organization_units')
            .select('*')
            .eq('iteration_id', iteration_id);
          if (errUnits) throw errUnits;

          const { data: roles, error: errRoles } = await supabase
            .from('person_roles')
            .select('*, person:people(*), unit:organization_units(name)')
            .eq('iteration_id', iteration_id);
          if (errRoles) throw errRoles;

          const { data: people } = await supabase.from('people').select('*');

          return res.status(200).json({ success: true, units, roles, people });
        }
        break;
      }

      case 'create-org-unit': {
        if (method === 'POST') {
          const { name, parent_id, iteration_id } = body;
          if (!name || !iteration_id) return res.status(400).json({ success: false, message: "name + iteration_id required" });

          const { data, error } = await supabase
            .from('organization_units')
            .insert([{ name, parent_id, iteration_id }])
            .select()
            .single();
          if (error) throw error;

          return res.status(200).json({ success: true, unit: data });
        }
        break;
      }

      case 'assign-role': {
        if (method === 'POST') {
          const { person_id, org_unit_id, is_manager, iteration_id } = body;
          const { data, error } = await supabase
            .from('person_roles')
            .insert([{ person_id, org_unit_id, is_manager, iteration_id }])
            .select()
            .single();
          if (error) throw error;

          return res.status(200).json({ success: true, role: data });
        }
        break;
      }

      /**
       * Table Viewer
       */
      case 'table-viewer': {
        if (method === 'GET') {
          const { table } = req.query;
          const { data, error } = await supabase.from(table).select('*');
          if (error) throw error;

          return res.status(200).json({ success: true, rows: data });
        }
        break;
      }

      /**
       * Login helpers
       */
      case 'get-user-roles': {
        if (method === 'GET') {
          const { name } = req.query;
          const { data: user, error: errUser } = await supabase
            .from('people')
            .select('*')
            .eq('name', name)
            .single();
          if (errUser) throw errUser;

          const { data: iter } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .order('id', { ascending: false })
            .limit(1)
            .single();

          const { data: roles } = await supabase
            .from('person_roles')
            .select('id, is_manager, org_unit_id, iteration_id, unit:organization_units(id,name,parent_id)')
            .eq('person_id', user.id)
            .eq('iteration_id', iter.id);

          return res.status(200).json({ success: true, user, iteration: iter, roles });
        }
        break;
      }

      case 'get-role-context': {
        if (method === 'GET') {
          const { role_id } = req.query;
          const { data: role, error: errRole } = await supabase
            .from('person_roles')
            .select('id, is_manager, iteration_id, description, person:people(name), unit:organization_units(name)')
            .eq('id', role_id)
            .single();
          if (errRole) throw errRole;

          const { data: iter } = await supabase
            .from('iterations')
            .select('*')
            .eq('id', role.iteration_id)
            .single();

          return res.status(200).json({
            success: true,
            context: {
              user: role.person.name,
              roleType: role.is_manager ? "Manager" : "Coworker",
              unitName: role.unit.name,
              iterName: iter.name,
              iterId: iter.id,
              qset: iter.question_set,
            }
          });
        }
        break;
      }

      /**
       * Surveys save/load
       */
      case 'surveys': {
        if (method === 'POST') {
          const { person_role_id, iteration_id, survey_results } = body;
          if (!person_role_id || !iteration_id) return res.status(400).json({ success: false, message: "role_id + iteration_id required" });

          const { data, error } = await supabase
            .from('surveys')
            .upsert([{ person_role_id, iteration_id, survey_results }], { onConflict: 'person_role_id,iteration_id' })
            .select()
            .single();
          if (error) throw error;

          return res.status(200).json({ success: true, survey: data, message: "Survey saved" });
        }

        if (method === 'GET') {
          const { person_role_id, iteration_id } = req.query;
          const { data, error } = await supabase
            .from('surveys')
            .select('*')
            .eq('person_role_id', person_role_id)
            .eq('iteration_id', iteration_id)
            .maybeSingle();
          if (error) throw error;

          if (!data) return res.status(200).json({ success: false, message: "No survey found" });

          return res.status(200).json({ success: true, survey: data });
        }
        break;
      }

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error("Handler exception", err);
    return res.status(500).json({ success: false, message: err.message, error: err });
  }
}

