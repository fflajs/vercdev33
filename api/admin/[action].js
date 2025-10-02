// api/admin/[action].js
import { supabase } from '../db.js';

/**
 * Helper: JSON response with debug
 */
function ok(res, payload, code = 200) {
  return res.status(code).json({ success: true, ...payload });
}
function fail(res, message, code = 400, extra = null) {
  const body = { success: false, message };
  if (extra) body.error = extra;
  return res.status(code).json(body);
}

/**
 * Clone org units and roles from a previous iteration to a new iteration.
 * - Preserves parent hierarchy by remapping IDs.
 * - Copies roles with mapped org_unit_id.
 */
async function cloneFromPreviousIteration(prevIterationId, newIterationId) {
  // No previous? Nothing to clone.
  if (!prevIterationId) return { unitsCloned: 0, rolesCloned: 0 };

  // 1) Fetch previous units & roles
  const { data: prevUnits, error: unitsErr } = await supabase
    .from('organization_units')
    .select('*')
    .eq('iteration_id', prevIterationId);

  if (unitsErr) throw unitsErr;

  const { data: prevRoles, error: rolesErr } = await supabase
    .from('person_roles')
    .select('*')
    .eq('iteration_id', prevIterationId);

  if (rolesErr) throw rolesErr;

  // 2) Insert units while keeping parent mapping
  const idMap = new Map(); // oldUnitId -> newUnitId

  // simple breadth approach: keep looping until all inserted
  const pending = [...(prevUnits || [])];
  let safety = pending.length + 10;

  while (pending.length && safety-- > 0) {
    let progressed = false;

    for (let i = pending.length - 1; i >= 0; i--) {
      const u = pending[i];
      const parentOk = (u.parent_id == null) || idMap.has(u.parent_id);
      if (!parentOk) continue;

      const newParentId = u.parent_id == null ? null : idMap.get(u.parent_id);
      const { data: inserted, error: insErr } = await supabase
        .from('organization_units')
        .insert([{ name: u.name, parent_id: newParentId, iteration_id: newIterationId }])
        .select()
        .single();

      if (insErr) throw insErr;

      idMap.set(u.id, inserted.id);
      pending.splice(i, 1);
      progressed = true;
    }

    if (!progressed) {
      // if we got stuck (cyclic or missing parent), break to avoid infinite loop
      break;
    }
  }

  // 3) Insert roles for new iteration (mapped org_unit_id)
  let rolesCloned = 0;
  for (const r of (prevRoles || [])) {
    const newOrgId = idMap.get(r.org_unit_id);
    if (!newOrgId) continue; // skip roles whose units didn't map

    const { error: insRoleErr } = await supabase
      .from('person_roles')
      .insert([{
        person_id: r.person_id,
        org_unit_id: newOrgId,
        is_manager: r.is_manager,
        description: r.description,
        iteration_id: newIterationId
      }]);

    if (insRoleErr) throw insRoleErr;
    rolesCloned += 1;
  }

  return { unitsCloned: idMap.size, rolesCloned };
}

export default async function handler(req, res) {
  const { query: { action }, method, body } = req;

  console.log(`[INFO] Admin API called: action=${action}, method=${method}`);

  try {
    switch (action) {
      /**
       * PEOPLE (used by register.html)
       */
      case 'people': {
        if (method === 'POST') {
          const { name } = body || {};
          if (!name || !String(name).trim()) {
            return fail(res, 'Name is required', 400);
          }

          const { data, error } = await supabase
            .from('people')
            .insert([{ name: String(name).trim() }])
            .select()
            .single();

          if (error) {
            if (error.code === '23505') {
              return fail(res, `Name "${name}" already exists.`, 409);
            }
            console.error('[ERROR] people insert', error);
            return fail(res, 'Insert failed', 500, error);
          }
          return ok(res, { person: data }, 201);
        }
        if (method === 'GET') {
          const { data, error } = await supabase.from('people').select('*');
          if (error) return fail(res, 'Read failed', 500, error);
          return ok(res, { people: data });
        }
        return fail(res, 'Method not allowed', 405);
      }

      /**
       * ITERATIONS
       */
      case 'active-iteration': {
        if (method !== 'GET') return fail(res, 'Method not allowed', 405);

        const { data, error } = await supabase
          .from('iterations')
          .select('*')
          .is('end_date', null)
          .single();

        if (error) {
          // No row found
          if (error.code === 'PGRST116') {
            return fail(res, 'No active iteration found', 404);
          }
          console.error('[ERROR] active-iteration', error);
          return fail(res, 'Failed to load active iteration', 500, error);
        }

        return ok(res, { iteration: data });
      }

      case 'create-iteration': {
        if (method !== 'POST') return fail(res, 'Method not allowed', 405);

        const { name, question_set } = body || {};
        if (!name || !question_set) {
          return fail(res, 'Iteration name and question_set are required', 400);
        }

        // guard: ensure no active iteration exists
        const { data: existing, error: activeErr } = await supabase
          .from('iterations')
          .select('id')
          .is('end_date', null)
          .maybeSingle();

        if (activeErr) {
          // if the code is "no rows", ignore, else fail
          if (activeErr.code !== 'PGRST116') {
            console.error('[ERROR] checking active iteration', activeErr);
            return fail(res, 'Could not verify active iteration', 500, activeErr);
          }
        }
        if (existing) {
          return fail(res, 'An iteration is already active. Close it first.', 409);
        }

        // find previous iteration (latest by id)
        const { data: prevRows, error: prevErr } = await supabase
          .from('iterations')
          .select('id')
          .order('id', { ascending: false })
          .limit(1);

        if (prevErr) {
          console.error('[ERROR] fetch previous iteration', prevErr);
          return fail(res, 'Could not fetch previous iteration', 500, prevErr);
        }

        const prevIterationId = Array.isArray(prevRows) && prevRows.length ? prevRows[0].id : null;

        // create new iteration
        const { data: newIter, error: newErr } = await supabase
          .from('iterations')
          .insert([{ name, question_set }])
          .select()
          .single();

        if (newErr) {
          console.error('[ERROR] insert new iteration', newErr);
          return fail(res, 'Could not create iteration', 500, newErr);
        }

        // clone structure from previous (if any)
        try {
          const { unitsCloned, rolesCloned } =
            await cloneFromPreviousIteration(prevIterationId, newIter.id);
          console.log(`[INFO] Cloned from iteration ${prevIterationId} -> ${newIter.id}: units=${unitsCloned}, roles=${rolesCloned}`);
        } catch (cloneErr) {
          console.error('[ERROR] cloning previous iteration', cloneErr);
          // We still return success for the iteration creation itself, but include warning
          return ok(res, { iteration: newIter, warning: 'Created iteration, but cloning failed.' }, 201);
        }

        return ok(res, { iteration: newIter }, 201);
      }

      case 'close-iteration': {
        if (method !== 'POST') return fail(res, 'Method not allowed', 405);

        // find active iteration
        const { data: active, error: actErr } = await supabase
          .from('iterations')
          .select('*')
          .is('end_date', null)
          .single();

        if (actErr) {
          if (actErr.code === 'PGRST116') {
            return fail(res, 'No active iteration to close', 404);
          }
          console.error('[ERROR] load active iteration for close', actErr);
          return fail(res, 'Failed to load active iteration', 500, actErr);
        }

        const { data: updated, error: updErr } = await supabase
          .from('iterations')
          .update({ end_date: new Date().toISOString() })
          .eq('id', active.id)
          .select()
          .single();

        if (updErr) {
          console.error('[ERROR] close iteration update', updErr);
          return fail(res, 'Failed to close iteration', 500, updErr);
        }

        return ok(res, { iteration: updated });
      }

      /**
       * ORG DATA
       */
      case 'org-data': {
        if (method !== 'GET') return fail(res, 'Method not allowed', 405);

        const { iteration_id } = req.query || {};
        if (!iteration_id) return fail(res, 'iteration_id is required', 400);

        // iteration
        const { data: iteration, error: iterErr } = await supabase
          .from('iterations')
          .select('*')
          .eq('id', iteration_id)
          .single();

        if (iterErr) {
          console.error('[ERROR] org-data iteration', iterErr);
          return fail(res, 'Error loading iteration', 500, iterErr);
        }

        // units
        const { data: units, error: unitsErr } = await supabase
          .from('organization_units')
          .select('*')
          .eq('iteration_id', iteration_id);

        if (unitsErr) {
          console.error('[ERROR] org-data units', unitsErr);
          return fail(res, 'Error loading units', 500, unitsErr);
        }

        // roles
        const { data: rolesRaw, error: rolesErr } = await supabase
          .from('person_roles')
          .select('*')
          .eq('iteration_id', iteration_id);

        if (rolesErr) {
          console.error('[ERROR] org-data roles', rolesErr);
          return fail(res, 'Error loading roles', 500, rolesErr);
        }

        // people
        const { data: people, error: peopleErr } = await supabase
          .from('people')
          .select('*');

        if (peopleErr) {
          console.error('[ERROR] org-data people', peopleErr);
          return fail(res, 'Error loading people', 500, peopleErr);
        }

        const peopleById = {};
        (people || []).forEach(p => { peopleById[p.id] = p; });

        const roles = (rolesRaw || []).map(r => ({
          id: r.id,
          person_id: r.person_id,
          org_unit_id: r.org_unit_id,
          is_manager: r.is_manager,
          iteration_id: r.iteration_id,
          description: r.description || null,
          role: r.is_manager ? 'Manager' : 'Coworker',
          person_name: peopleById[r.person_id]?.name || `#${r.person_id}`
        }));

        return ok(res, { iteration, units: units || [], roles, people: people || [] });
      }

      case 'create-org-unit': {
        if (method !== 'POST') return fail(res, 'Method not allowed', 405);
        const { name, parent_id, iteration_id } = body || {};
        if (!name || !iteration_id) return fail(res, 'name and iteration_id required', 400);

        const { data, error } = await supabase
          .from('organization_units')
          .insert([{ name, parent_id: parent_id ?? null, iteration_id }])
          .select()
          .single();

        if (error) {
          console.error('[ERROR] create-org-unit', error);
          return fail(res, 'Insert failed', 500, error);
        }
        return ok(res, { unit: data }, 201);
      }

      case 'assign-role': {
        if (method !== 'POST') return fail(res, 'Method not allowed', 405);
        const { person_id, org_unit_id, is_manager, iteration_id } = body || {};
        if (!person_id || !org_unit_id || !iteration_id) {
          return fail(res, 'person_id, org_unit_id, iteration_id required', 400);
        }

        const { data, error } = await supabase
          .from('person_roles')
          .insert([{ person_id, org_unit_id, is_manager: !!is_manager, iteration_id }])
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            return fail(res, 'This role already exists.', 409);
          }
          console.error('[ERROR] assign-role', error);
          return fail(res, 'Insert failed', 500, error);
        }
        return ok(res, { role: data }, 201);
      }

      case 'delete-role': {
        if (method !== 'DELETE') return fail(res, 'Method not allowed', 405);
        const { id } = body || {};
        if (!id) return fail(res, 'Role ID required', 400);

        const { error } = await supabase
          .from('person_roles')
          .delete()
          .eq('id', id);

        if (error) {
          console.error('[ERROR] delete-role', error);
          return fail(res, 'Delete failed', 500, error);
        }
        return ok(res, {});
      }

      case 'delete-org-unit': {
        if (method !== 'DELETE') return fail(res, 'Method not allowed', 405);
        const { id } = body || {};
        if (!id) return fail(res, 'Org unit ID required', 400);

        const { error } = await supabase
          .from('organization_units')
          .delete()
          .eq('id', id);

        if (error) {
          console.error('[ERROR] delete-org-unit', error);
          return fail(res, 'Delete failed', 500, error);
        }
        return ok(res, {});
      }

      /**
       * TABLE VIEWER SUPPORT (kept so your viewer stays working)
       */
      case 'tables': {
        if (method !== 'GET') return fail(res, 'Method not allowed', 405);

        const load = async (table) => {
          const { data, error } = await supabase.from(table).select('*').limit(500);
          if (error) return { table, error };
          return { table, rows: data || [] };
        };

        const [iterations, people, org_units, person_roles] = await Promise.all([
          load('iterations'),
          load('people'),
          load('organization_units'),
          load('person_roles'),
        ]);

        return ok(res, { iterations, people, organization_units: org_units, person_roles });
      }

      case 'reset-test-data': {
        if (method !== 'POST') return fail(res, 'Method not allowed', 405);
        // keep this minimal; your SQL reset + seed scripts are recommended for bulk resets.
        return fail(res, 'Reset is disabled in API. Use SQL reset/seed scripts.', 403);
      }

      default:
        return fail(res, `Unknown action: ${action}`, 400);
    }
  } catch (err) {
    console.error('[FATAL] Admin API error:', err);
    return fail(res, err.message || 'Internal server error', 500, err);
  }
}

