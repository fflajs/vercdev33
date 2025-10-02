// api/admin/[action].js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { action } = req.query;
  const method = req.method;
  const body = req.body;

  console.log(`[INFO] Admin API called: action=${action}, method=${method}`);

  try {
    switch (action) {
      /**
       * =====================================================
       * ORG-DATA: Fetch iteration + org units + roles
       * =====================================================
       */
      case 'org-data':
        if (method === 'GET') {
          const { iteration_id } = req.query;
          console.log(`[org-data] Requested iteration_id = ${iteration_id}`);

          // --- Load iteration ---
          const { data: iteration, error: iterationError } = await supabase
            .from('iterations')
            .select('*')
            .eq('id', iteration_id)
            .single();

          console.log('[org-data] Iteration query result:', iteration);
          if (iterationError) {
            console.error('[org-data] Iteration error:', iterationError);
            return res.status(404).json({
              success: false,
              message: `No iteration found with id ${iteration_id}`,
              error: iterationError
            });
          }

          // --- Load organization units ---
          const { data: orgUnits, error: orgError } = await supabase
            .from('organization_units')
            .select('*')
            .eq('iteration_id', iteration_id);

          console.log(`[org-data] Org units count = ${orgUnits ? orgUnits.length : 0}`);
          if (orgError) {
            console.error('[org-data] Org units error:', orgError);
            return res.status(500).json({
              success: false,
              message: 'Error loading org units',
              error: orgError
            });
          }

          // --- Load person_roles with join ---
          const { data: roles, error: rolesError } = await supabase
            .from('person_roles')
            .select('id, org_unit_id, role, people ( id, name )')
            .in('org_unit_id', orgUnits.map(u => u.id));

          console.log(`[org-data] Roles count = ${roles ? roles.length : 0}`);
          if (rolesError) {
            console.error('[org-data] Roles error:', rolesError);
            return res.status(500).json({
              success: false,
              message: 'Error loading roles',
              error: rolesError
            });
          }

          return res.status(200).json({
            success: true,
            iteration,
            orgUnits,
            roles
          });
        }
        break;

      /**
       * =====================================================
       * PEOPLE MANAGEMENT
       * =====================================================
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

          console.log('[people] Insert result data:', data);
          console.log('[people] Insert result error:', error);

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
       * =====================================================
       * ACTIVE ITERATION
       * =====================================================
       */
      case 'active-iteration':
        if (method === 'GET') {
          const { data, error } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .order('start_date', { ascending: false })
            .limit(1)
            .single();

          console.log('[active-iteration] Query result:', data);

          if (error || !data) {
            return res.status(404).json({ success: false, message: 'No active iteration found' });
          }
          return res.status(200).json({ success: true, iteration: data });
        }
        break;

      /**
       * =====================================================
       * DEFAULT
       * =====================================================
       */
      default:
        console.warn(`[WARN] Unknown action requested: ${action}`);
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[ERROR] Admin API exception:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

