// api/admin/[action].js
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  const { action } = req.query;

  try {
    switch (action) {
      // ✅ ACTIVE ITERATION (end_date IS NULL)
      case "active-iteration": {
        const { data, error } = await supabase
          .from("iterations")
          .select("*")
          .is("end_date", null)
          .order("start_date", { ascending: false })
          .limit(1)
          .single();
        if (error && error.code !== "PGRST116") throw error;
        res.status(200).json({ success: true, iteration: data || null });
        break;
      }

      // ✅ CREATE NEW ITERATION (with org structure cloning)
      case "create-iteration": {
        if (req.method !== "POST") {
          return res.status(405).json({ success: false, message: "Method not allowed" });
        }

        const { name, question_set } = req.body;
        if (!name || !question_set) {
          return res.status(400).json({
            success: false,
            message: "Name and question_set are required.",
          });
        }

        // check if another active iteration exists
        const { data: active, error: activeError } = await supabase
          .from("iterations")
          .select("*")
          .is("end_date", null)
          .maybeSingle();
        if (activeError) throw activeError;
        if (active) {
          return res.status(400).json({
            success: false,
            message: "An active iteration already exists.",
          });
        }

        // ✅ create new iteration
        const { data: newIter, error: createError } = await supabase
          .from("iterations")
          .insert([{ name, question_set, start_date: new Date().toISOString() }])
          .select()
          .single();
        if (createError) throw createError;

        const newIterId = newIter.id;

        // ✅ find the most recently closed iteration (previous iteration)
        const { data: prevIter, error: prevError } = await supabase
          .from("iterations")
          .select("*")
          .not("end_date", "is", null)
          .order("end_date", { ascending: false })
          .limit(1)
          .single();

        if (prevError && prevError.code !== "PGRST116") throw prevError;

        if (prevIter) {
          console.log(`[create-iteration] Cloning org structure from iteration ${prevIter.id}`);

          // ✅ 1. Clone organization_units and map old IDs to new ones
          const { data: oldUnits, error: unitsError } = await supabase
            .from("organization_units")
            .select("*")
            .eq("iteration_id", prevIter.id);
          if (unitsError) throw unitsError;

          const idMap = new Map();
          for (const unit of oldUnits) {
            const insertData = {
              name: unit.name,
              parent_id: null, // temporary, update later
              iteration_id: newIterId,
            };
            const { data: inserted, error: insertErr } = await supabase
              .from("organization_units")
              .insert([insertData])
              .select()
              .single();
            if (insertErr) throw insertErr;
            idMap.set(unit.id, inserted.id);
          }

          // ✅ 2. Update parent-child relations
          for (const unit of oldUnits) {
            if (unit.parent_id) {
              const newParent = idMap.get(unit.parent_id);
              const newId = idMap.get(unit.id);
              if (newParent && newId) {
                const { error: updateErr } = await supabase
                  .from("organization_units")
                  .update({ parent_id: newParent })
                  .eq("id", newId);
                if (updateErr) throw updateErr;
              }
            }
          }

          // ✅ 3. Clone person_roles with remapped org_unit_ids
          const { data: oldRoles, error: rolesError } = await supabase
            .from("person_roles")
            .select("*")
            .eq("iteration_id", prevIter.id);
          if (rolesError) throw rolesError;

          for (const role of oldRoles) {
            const newOrgId = idMap.get(role.org_unit_id);
            if (!newOrgId) continue;
            const insertRole = {
              person_id: role.person_id,
              org_unit_id: newOrgId,
              is_manager: role.is_manager,
              iteration_id: newIterId,
            };
            const { error: insertRoleErr } = await supabase
              .from("person_roles")
              .insert([insertRole]);
            if (insertRoleErr) throw insertRoleErr;
          }

          console.log(
            `[create-iteration] Cloned ${oldUnits.length} units and ${oldRoles.length} roles to iteration ${newIterId}`
          );
        } else {
          console.log("[create-iteration] No previous iteration to clone");
        }

        res.status(200).json({ success: true, iteration: newIter });
        break;
      }

      // ✅ CLOSE ACTIVE ITERATION
      case "close-iteration": {
        if (req.method !== "POST") {
          return res.status(405).json({ success: false, message: "Method not allowed" });
        }

        const { error } = await supabase
          .from("iterations")
          .update({ end_date: new Date().toISOString() })
          .is("end_date", null);
        if (error) throw error;
        res.status(200).json({ success: true });
        break;
      }

      // ✅ TABLE FETCHERS
      case "people-all": {
        const { data, error } = await supabase.from("people").select("*");
        if (error) throw error;
        res.status(200).json({ success: true, rows: data });
        break;
      }
      case "org-units-all": {
        const { data, error } = await supabase.from("organization_units").select("*");
        if (error) throw error;
        res.status(200).json({ success: true, rows: data });
        break;
      }
      case "roles-all": {
        const { data, error } = await supabase.from("person_roles").select("*");
        if (error) throw error;
        res.status(200).json({ success: true, rows: data });
        break;
      }
      case "iterations-all": {
        const { data, error } = await supabase.from("iterations").select("*");
        if (error) throw error;
        res.status(200).json({ success: true, rows: data });
        break;
      }
      case "app-data-all": {
        const { data, error } = await supabase.from("app_data").select("*");
        if (error) throw error;
        res.status(200).json({ success: true, rows: data });
        break;
      }
      case "surveys-all": {
        const { data, error } = await supabase.from("surveys").select("*");
        if (error) throw error;
        res.status(200).json({ success: true, rows: data });
        break;
      }

      default:
        res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

