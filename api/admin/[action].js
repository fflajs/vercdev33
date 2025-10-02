// api/admin/[action].js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { query, method, body } = req;
  const { action } = query;

  console.log(`[${new Date().toISOString()}] ➡️ Admin API called: action=${action}, method=${method}`);

  try {
    switch (action) {

      /**
       * -------------------------
       * ACTIVE ITERATION
       * -------------------------
       */
      case 'active-iteration':
        if (method === 'GET') {
          const { data, error } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .single();

          if (error && error.code !== 'PGRST116') throw error;
          if (!data) return res.status(404).json({ success: false, message: 'No active iteration found' });

          return res.status(200).json({ success: true, iteration: data });
        }
        break;

      /**
       * -------------------------
       * ORG-DATA
       * -------------------------
       */
      case 'org-data':
        if (method === 'GET') {
          const iterationId = query.iteration_id;
          console.log(`[${new Date().toISOString()}] Fetching org-data for iteration_id=${iterationId}`);

          if (!iterationId) {
            return res.status(400).json({ success: false, message: 'iteration_id is required' });
          }

          // Get iteration info
          const { data: iteration, error: iterError } = await supabase
            .from('iterations')
            .select('*')
            .eq('id', iterationId)
            .single();

          if (iterError) {
            console.error('❌ Error loading iteration:', iterError);
            return res.status(500).json({ success: false, message: 'Error loading iteration', error: iterError });
          }
          if (!iteration) {
            return res.status(404).json({ success: false, message: `Iteration ${iterationId} not found` });
          }

          // Get org units
          const { data: units, error: unitError } = await supabase
            .from('organization_units')
            .select('*')
            .eq('iteration_id', iterationId);

          if (unitError) {
            console.error('❌ Error loading org units:', unitError);
            return res.status(500).json({ success: false, message: 'Error loading org units', error: unitError });
          }

          // Get people
          const { data: people, error: peopleError } = await supabase
            .from('people')
            .select('*');

          if (peopleError) {
            console.error('❌ Error loading people:', peopleError);
            return res.status(500).json({ success: false, message: 'Error loading people', error: peopleError });
          }

          // Get person_roles with joins
          const { data: roles, error: roleError } = await supabase
            .from('person_roles')
            .select(`
              id,
              person_id,
              org_unit_id,
              is_manager,
              description,
              iteration_id,
              people (id, name),
              organization_units (id, name)
            `)
            .eq('iteration_id', iterationId);

          if (roleError) {
            console.error('❌ Error loading roles:', roleError);
            return res.status(500).json({ success: false, message: 'Error loading roles', error: roleError });
          }

          // Map roles into clean objects
          const mappedRoles = (roles || []).map(r => ({
            id: r.id,
            person_id: r.person_id,
            person_name: r.people?.name || 'Unknown',
            org_unit_id: r.org_unit_id,
            org_unit_name: r.organization_units?.name || 'Unknown',
            role: r.is_manager ? 'Manager' : 'Coworker',
            description: r.description,
            iteration_id: r.iteration_id
          }));

          console.log(`[${new Date().toISOString()}] ✅ Org-data query successful`, {
            iteration,
            units_count: units?.length,
            roles_count: mappedRoles?.length,
            people_count: people?.length
          });

          return res.status(200).json({
            success: true,
            iteration,
            units,
            people,
            roles: mappedRoles
          });
        }
        break;

      /**
       * -------------------------
       * PEOPLE
       * -------------------------
       */
      case 'people':
        if (method === 'GET') {
          const { data, error } = await supabase.from('people').select('*');
          if (error) throw error;
          return res.status(200).json({ success: true, people: data });
        }

        if (method === 'POST') {
          const { name } = body;
          if (!name) {
            return res.status(400).json({ success: false, message: 'Name is required' });
          }

          const { data, error } = await supabase
            .from('people')
            .insert([{ name }])
            .select()
            .single();

          if (error) {
            if (error.code === '23505') {
              return res.status(409).json({ success: false, message: `Name "${name}" already exists.` });
            }
            throw error;
          }

          return res.status(201).json({ success: true, person: data });
        }
        break;

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Admin API error:`, err);
    return res.status(500).json({ success: false, message: 'Internal server error', error: err });
  }
}

