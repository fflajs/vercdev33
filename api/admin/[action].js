// api/admin/[action].js
import { supabase } from '../db.js';

function log(...args) {
  try {
    console.log(`[${new Date().toISOString()}]`, ...args);
  } catch {}
}

export default async function handler(req, res) {
  const { query: { action }, method } = req;
  log('➡️ Admin API called:', `action=${action}, method=${method}`);

  try {
    switch (action) {

      /**
       * PEOPLE (used by register.html)
       *  GET  /api/admin/people                -> list
       *  POST /api/admin/people {name}        -> create
       */
      case 'people': {
        if (method === 'GET') {
          const { data, error } = await supabase.from('people').select('*').order('id', { ascending: true });
          if (error) throw error;
          return res.status(200).json({ success: true, people: data });
        }
        if (method === 'POST') {
          const { name } = req.body || {};
          if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Name is required' });
          }
          const { data, error } = await supabase
            .from('people')
            .insert([{ name: name.trim() }])
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
      }

      /**
       * ACTIVE ITERATION
       *  GET /api/admin/active-iteration
       */
      case 'active-iteration': {
        if (method === 'GET') {
          const { data, error } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .maybeSingle(); // return null instead of error when 0 rows

          if (error) throw error;
          if (!data) {
            return res.status(404).json({ success: false, message: 'No active iteration found' });
          }
          return res.status(200).json({ success: true, iteration: data });
        }
        break;
      }

      /**
       * CREATE ITERATION (with optional cloning from most recent previous iteration)
       *  POST /api/admin/create-iteration { name, question_set }
       *  Guard: fails if an active iteration already exists
       */
      case 'create-iteration': {
        if (method === 'POST') {
          const { name, question_set } = req.body || {};
          if (!name || !question_set) {
            return res.status(400).json({ success: false, message: 'name and question_set are required' });
          }

          // 1) Guard: there must be no active iteration
          const { data: currentActive, error: activeErr } = await supabase
            .from('iterations')
            .select('id')
            .is('end_date', null)
            .maybeSingle();
          if (activeErr) throw activeErr;
          if (currentActive) {
            return res.status(409).json({ success: false, message: 'An iteration is already active. Close it first.' });
          }

          // 2) Insert new iteration
          const { data: newIter, error: insErr } = await supabase
            .from('iterations')
            .insert([{ name, question_set }])
            .select()
            .single();
          if (insErr) throw insErr;

          log('🟢 Created iteration:', newIter);

          // 3) Clone org structure from most recent *completed* iteration (if any)
          const { data: prevIter, error: prevErr } = await supabase
            .from('iterations')
            .select('id')
            .not('end_date', 'is', null)
            .order('end_date', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (prevErr) throw prevErr;

          if (prevIter && prevIter.id) {
            log('🟡 Cloning structure from iteration', prevIter.id, 'to', newIter.id);

            // clone units
            const { data: prevUnits, error: unitsErr } = await supabase
              .from('organization_units')
              .select('*')
              .eq('iteration_id', prevIter.id);
            if (unitsErr) throw unitsErr;

            // Insert root units first
            const roots = prevUnits.filter(u => u.parent_id === null);
            for (const r of roots) {
              const { data: inserted, error: insRootErr } = await supabase
                .from('organization_units')
                .insert([{ name: r.name, parent_id: null, iteration_id: newIter.id }])
                .select()
                .single();
              if (insRootErr) throw insRootErr;
            }

            // Build map oldName -> newId for roots
            const { data: newRoots, error: newRootsErr } = await supabase
              .from('organization_units')
              .select('*')
              .eq('iteration_id', newIter.id);
            if (newRootsErr) throw newRootsErr;

            const nameToId = new Map();
            for (const nr of newRoots) nameToId.set(nr.name, nr.id);

            // Recreate tree breadth-first by parent name matching
            const nonRoots = prevUnits.filter(u => u.parent_id !== null);
            // Build old id -> old name map
            const oldIdToName = new Map(prevUnits.map(u => [u.id, u.name]));
            const oldIdToParentId = new Map(prevUnits.map(u => [u.id, u.parent_id]));

            let safety = 0;
            while (nonRoots.length && safety < 10000) {
              safety++;
              for (let i = nonRoots.length - 1; i >= 0; i--) {
                const u = nonRoots[i];
                const parentOldId = oldIdToParentId.get(u.id);
                const parentOldName = oldIdToName.get(parentOldId);
                const newParentId = nameToId.get(parentOldName);
                if (newParentId) {
                  const { data: inserted, error: insChildErr } = await supabase
                    .from('organization_units')
                    .insert([{ name: u.name, parent_id: newParentId, iteration_id: newIter.id }])
                    .select()
                    .single();
                  if (insChildErr) throw insChildErr;
                  nameToId.set(u.name, inserted.id);
                  nonRoots.splice(i, 1);
                }
              }
            }

            // clone person_roles (by name and unit name)
            const { data: prevRoles, error: rolesErr } = await supabase
              .from('person_roles')
              .select('person_id, org_unit_id, is_manager, description, iteration_id');
            if (rolesErr) throw rolesErr;

            // We need person name and unit name for mapping
            const { data: prevPeople, error: pplErr } = await supabase.from('people').select('*');
            if (pplErr) throw pplErr;
            const personIdToName = new Map(prevPeople.map(p => [p.id, p.name]));

            const prevUnitsById = new Map(prevUnits.map(u => [u.id, u]));
            for (const pr of prevRoles.filter(r => r.iteration_id === prevIter.id)) {
              const oldUnit = prevUnitsById.get(pr.org_unit_id);
              if (!oldUnit) continue;
              const newUnitId = nameToId.get(oldUnit.name);
              const personName = personIdToName.get(pr.person_id);

              // Map person by name (we assume same people list persists)
              const { data: personRow, error: perFindErr } = await supabase
                .from('people')
                .select('*')
                .eq('name', personName)
                .maybeSingle();
              if (perFindErr) throw perFindErr;
              if (!personRow || !newUnitId) continue;

              const { error: insRoleErr } = await supabase
                .from('person_roles')
                .insert([{
                  person_id: personRow.id,
                  org_unit_id: newUnitId,
                  is_manager: pr.is_manager,
                  description: pr.description || null,
                  iteration_id: newIter.id
                }]);
              if (insRoleErr && insRoleErr.code !== '23505') throw insRoleErr; // ignore duplicates
            }

            log('✅ Clone complete into iteration', newIter.id);
          } else {
            log('ℹ️ No previous iteration to clone from. New iteration starts empty.');
          }

          return res.status(201).json({ success: true, iteration: newIter });
        }
        break;
      }

      /**
       * CLOSE ITERATION
       *  POST /api/admin/close-iteration { id? }
       *  If body.id is missing, we auto-close the current active iteration (if exactly one exists).
       */
      case 'close-iteration': {
        if (method === 'POST') {
          let { id } = req.body || {};

          if (!id) {
            // Try to resolve active iteration automatically
            const { data: active, error: actErr } = await supabase
              .from('iterations')
              .select('*')
              .is('end_date', null)
              .maybeSingle();
            if (actErr) throw actErr;
            if (!active) {
              return res.status(404).json({ success: false, message: 'No active iteration found to close' });
            }
            id = active.id;
          }

          const { data, error } = await supabase
            .from('iterations')
            .update({ end_date: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
          if (error) throw error;
          return res.status(200).json({ success: true, iteration: data });
        }
        break;
      }

      /**
       * ORG-DATA (used by org-chart.html)
       *  GET /api/admin/org-data?iteration_id=ID
       */
      case 'org-data': {
        if (method === 'GET') {
          const iteration_id = req.query.iteration_id;
          if (!iteration_id) {
            return res.status(400).json({ success: false, message: 'iteration_id is required' });
          }

          const [{ data: iteration, error: iterErr },
                 { data: units, error: unitsErr },
                 { data: roles, error: rolesErr },
                 { data: people, error: peopleErr }] = await Promise.all([
            supabase.from('iterations').select('*').eq('id', iteration_id).maybeSingle(),
            supabase.from('organization_units').select('*').eq('iteration_id', iteration_id),
            supabase.from('person_roles').select('*').eq('iteration_id', iteration_id),
            supabase.from('people').select('*')
          ]);
          if (iterErr) throw iterErr;
          if (!iteration) return res.status(404).json({ success: false, message: `Iteration ${iteration_id} not found` });
          if (unitsErr)  throw unitsErr;
          if (rolesErr)  throw rolesErr;
          if (peopleErr) throw peopleErr;

          return res.status(200).json({
            success: true,
            iteration,
            units: units || [],
            roles:  roles  || [],
            people: people || []
          });
        }
        break;
      }

      /**
       * CREATE ORG UNIT
       *  POST /api/admin/create-org-unit { name, parent_id, iteration_id }
       */
      case 'create-org-unit': {
        if (method === 'POST') {
          const { name, parent_id = null, iteration_id } = req.body || {};
          if (!name || !iteration_id) {
            return res.status(400).json({ success: false, message: 'name and iteration_id are required' });
          }
          const { data, error } = await supabase
            .from('organization_units')
            .insert([{ name: name.trim(), parent_id, iteration_id }])
            .select()
            .single();
          if (error) throw error;
          return res.status(201).json({ success: true, unit: data });
        }
        break;
      }

      /**
       * ASSIGN ROLE
       *  POST /api/admin/assign-role { person_id, org_unit_id, is_manager, iteration_id }
       */
      case 'assign-role': {
        if (method === 'POST') {
          const { person_id, org_unit_id, is_manager = false, iteration_id } = req.body || {};
          if (!person_id || !org_unit_id || !iteration_id) {
            return res.status(400).json({ success: false, message: 'person_id, org_unit_id and iteration_id are required' });
          }
          const { data, error } = await supabase
            .from('person_roles')
            .insert([{ person_id, org_unit_id, is_manager: !!is_manager, iteration_id }])
            .select()
            .single();

          if (error) {
            if (error.code === '23505') {
              return res.status(409).json({ success: false, message: 'This role already exists.' });
            }
            throw error;
          }
          return res.status(201).json({ success: true, role: data });
        }
        break;
      }

      /**
       * DELETE ROLE
       *  DELETE /api/admin/delete-role { id }
       */
      case 'delete-role': {
        if (method === 'DELETE') {
          const { id } = req.body || {};
          if (!id) return res.status(400).json({ success: false, message: 'Role ID required' });
          const { error } = await supabase.from('person_roles').delete().eq('id', id);
          if (error) throw error;
          return res.status(200).json({ success: true });
        }
        break;
      }

      /**
       * DELETE ORG UNIT (and cascade via FK)
       *  DELETE /api/admin/delete-org-unit { id }
       */
      case 'delete-org-unit': {
        if (method === 'DELETE') {
          const { id } = req.body || {};
          if (!id) return res.status(400).json({ success: false, message: 'Org unit ID required' });
          const { error } = await supabase.from('organization_units').delete().eq('id', id);
          if (error) throw error;
          return res.status(200).json({ success: true });
        }
        break;
      }

      /**
       * TABLE VIEWER (read-only)
       *  GET /api/admin/table-viewer?table=people|iterations|organization_units|person_roles|surveys
       */
      case 'table-viewer': {
        if (method === 'GET') {
          const { table } = req.query || {};
          const allowed = new Set(['people','iterations','organization_units','person_roles','surveys']);
          if (!table || !allowed.has(table)) {
            return res.status(400).json({ success: false, message: 'Invalid table name' });
          }
          const { data, error } = await supabase.from(table).select('*').order('id', { ascending: true });
          if (error) throw error;
          return res.status(200).json({ success: true, rows: data || [] });
        }
        break;
      }

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }

    // method not allowed for the matched action
    return res.status(405).json({ success: false, message: 'Method not allowed' });

  } catch (err) {
    log('❌ Admin API error:', err);
    return res.status(500).json({
      success: false,
      message: err?.message || 'Internal server error',
      error: {
        code: err?.code || null,
        details: err?.details || null,
        hint: err?.hint || null,
      },
    });
  }
}

