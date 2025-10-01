// api/admin/[action].js
import { supabase } from '../db.js';

function log(msg, ...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`, ...args);
}

export default async function handler(req, res) {
  const {
    query: { action },
    method,
    body,
  } = req;

  log(`➡️ Admin API called: action=${action}, method=${method}`);

  try {
    switch (action) {
      /**
       * PEOPLE MANAGEMENT
       */
      case 'people':
        if (method === 'GET') {
          log('Fetching all people…');
          const { data, error } = await supabase.from('people').select('*');
          if (error) throw error;
          log(`✅ Found ${data.length} people`);
          return res.status(200).json({ success: true, people: data });
        }

        if (method === 'POST') {
          const { name } = body;
          log('Creating person:', name);
          if (!name) {
            return res.status(400).json({
              success: false,
              message: 'Name is required',
            });
          }

          const { data, error } = await supabase
            .from('people')
            .insert([{ name }])
            .select()
            .single();

          if (error) {
            log('❌ Error inserting person:', error);
            if (error.code === '23505') {
              return res.status(409).json({
                success: false,
                message: `Name "${name}" already exists.`,
              });
            }
            throw error;
          }

          log('✅ Person created:', data);
          return res.status(201).json({ success: true, person: data });
        }
        break;

      /**
       * ITERATIONS
       */
      case 'iterations':
        if (method === 'GET') {
          log('Fetching all iterations…');
          const { data, error } = await supabase.from('iterations').select('*');
          if (error) throw error;
          log(`✅ Found ${data.length} iterations`);
          return res.status(200).json({ success: true, iterations: data });
        }
        break;

      case 'active-iteration':
        if (method === 'GET') {
          log('Fetching active iteration…');
          const { data, error } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .maybeSingle();

          if (error) throw error;
          log('Active iteration result:', data);

          if (!data) {
            return res.status(404).json({
              success: false,
              message: 'No active iteration found',
            });
          }

          return res.status(200).json({ success: true, iteration: data });
        }
        break;

      case 'create-iteration':
        if (method === 'POST') {
          const { name, question_set } = body;
          log('Creating iteration:', name, question_set);

          if (!name) {
            return res.status(400).json({
              success: false,
              message: 'Iteration name required',
            });
          }

          const { data: newIteration, error: errNew } = await supabase
            .from('iterations')
            .insert([{ name, question_set }])
            .select()
            .single();

          if (errNew) throw errNew;
          log('✅ New iteration created:', newIteration);

          // Find previous iteration
          const { data: prevIteration } = await supabase
            .from('iterations')
            .select('id')
            .lt('id', newIteration.id)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();

          log('Previous iteration found:', prevIteration);

          if (prevIteration) {
            // Copy org units
            const { data: oldUnits } = await supabase
              .from('organization_units')
              .select('*')
              .eq('iteration_id', prevIteration.id);

            log(`Copying ${oldUnits?.length || 0} org units`);

            if (oldUnits && oldUnits.length > 0) {
              const unitMap = {};
              const inserts = oldUnits.map((u) => ({
                name: u.name,
                parent_id: null,
                iteration_id: newIteration.id,
              }));

              const { data: newUnits, error: errUnits } = await supabase
                .from('organization_units')
                .insert(inserts)
                .select();

              if (errUnits) throw errUnits;
              log('✅ Org units copied:', newUnits.length);

              oldUnits.forEach((u, idx) => {
                unitMap[u.id] = newUnits[idx].id;
              });

              for (let i = 0; i < oldUnits.length; i++) {
                if (oldUnits[i].parent_id) {
                  await supabase
                    .from('organization_units')
                    .update({ parent_id: unitMap[oldUnits[i].parent_id] })
                    .eq('id', unitMap[oldUnits[i].id]);
                }
              }

              // Copy roles
              const { data: oldRoles } = await supabase
                .from('person_roles')
                .select('*')
                .eq('iteration_id', prevIteration.id);

              log(`Copying ${oldRoles?.length || 0} roles`);

              if (oldRoles && oldRoles.length > 0) {
                const roleInserts = oldRoles.map((r) => ({
                  person_id: r.person_id,
                  org_unit_id: unitMap[r.org_unit_id],
                  is_manager: r.is_manager,
                  iteration_id: newIteration.id,
                }));

                const { error: errRoles } = await supabase
                  .from('person_roles')
                  .insert(roleInserts);

                if (errRoles) throw errRoles;
                log('✅ Roles copied');
              }
            }
          }

          return res
            .status(201)
            .json({ success: true, iteration: newIteration });
        }
        break;

      case 'close-iteration':
        if (method === 'POST') {
          const { id } = body;
          log('Closing iteration:', id);

          if (!id) {
            return res.status(400).json({
              success: false,
              message: 'Iteration ID required',
            });
          }

          const { data, error } = await supabase
            .from('iterations')
            .update({ end_date: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

          if (error) throw error;
          log('✅ Iteration closed:', data);
          return res.status(200).json({ success: true, iteration: data });
        }
        break;

      /**
       * ORGANIZATION DATA
       */
      case 'org-data':
        if (method === 'GET') {
          const { iteration_id } = req.query;
          log('Fetching org-data for iteration:', iteration_id);

          if (!iteration_id) {
            return res.status(400).json({
              success: false,
              message: 'iteration_id is required',
            });
          }

          const { data: iteration, error: errIter } = await supabase
            .from('iterations')
            .select('*')
            .eq('id', iteration_id)
            .maybeSingle();

          if (errIter) throw errIter;
          log('Iteration query result:', iteration);

          if (!iteration) {
            return res.status(404).json({
              success: false,
              message: `No iteration found with id ${iteration_id}`,
            });
          }

          const { data: units, error: errUnits } = await supabase
            .from('organization_units')
            .select('*')
            .eq('iteration_id', iteration_id);
          if (errUnits) throw errUnits;
          log(`Units found: ${units.length}`);

          const { data: roles, error: errRoles } = await supabase
            .from('person_roles')
            .select('*')
            .eq('iteration_id', iteration_id);
          if (errRoles) throw errRoles;
          log(`Roles found: ${roles.length}`);

          const { data: people, error: errPeople } = await supabase
            .from('people')
            .select('*');
          if (errPeople) throw errPeople;
          log(`People found: ${people.length}`);

          return res.status(200).json({
            success: true,
            iteration,
            units,
            roles,
            people,
          });
        }
        break;

      case 'create-org-unit':
        if (method === 'POST') {
          log('Creating org unit:', body);
          const { name, parent_id, iteration_id } = body;

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
          log('✅ Org unit created:', data);
          return res.status(201).json({ success: true, unit: data });
        }
        break;

      case 'assign-role':
        if (method === 'POST') {
          log('Assigning role:', body);
          const { person_id, org_unit_id, is_manager, iteration_id } = body;

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
            log('❌ Error assigning role:', error);
            if (error.code === '23505') {
              return res.status(409).json({
                success: false,
                message: 'This role already exists.',
              });
            }
            throw error;
          }

          log('✅ Role assigned:', data);
          return res.status(201).json({ success: true, role: data });
        }
        break;

      case 'delete-role':
        if (method === 'DELETE') {
          log('Deleting role:', body);
          const { id } = body;

          if (!id) {
            return res.status(400).json({
              success: false,
              message: 'Role ID required',
            });
          }

          const { error } = await supabase
            .from('person_roles')
            .delete()
            .eq('id', id);

          if (error) throw error;
          log('✅ Role deleted:', id);
          return res.status(200).json({ success: true });
        }
        break;

      default:
        log('⚠️ Unknown action requested:', action);
        return res
          .status(404)
          .json({ success: false, message: `Unknown action: ${action}` });
    }

    // If method not handled
    log('⚠️ Method not allowed:', method, 'for action:', action);
    return res
      .status(405)
      .json({ success: false, message: 'Method not allowed' });
  } catch (err) {
    log('❌ Admin API error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Internal server error',
    });
  }
}

