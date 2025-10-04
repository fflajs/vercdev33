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
      // ==========================================================
      // 🧭 ITERATION MANAGEMENT
      // ==========================================================

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

      case "create-iteration": {
        if (req.method !== "POST") {
          return res.status(405).json({ success: false, message: "Method not allowed" });
        }

        const { name, question_set } = req.body;
        if (!name || !question_set) {
          return res.status(400).json({ success: false, message: "Name and question_set are required." });
        }

        // prevent duplicate active iterations
        const { data: active, error: activeErr } = await supabase
          .from("iterations")
          .select("*")
          .is("end_date", null)
          .maybeSingle();
        if (activeErr) throw activeErr;
        if (active) {
          return res.status(400).json({ success: false, message: "An active iteration already exists." });
        }

        // create new iteration
        const { data: newIter, error: createErr } = await supabase
          .from("iterations")
          .insert([{ name, question_set, start_date: new Date().toISOString() }])
          .select()
          .single();
        if (createErr) throw createErr;

        const newIterId = newIter.id;

        // find most recently closed iteration
        const { data: prevIter, error: prevErr } = await supabase
          .from("iterations")
          .select("*")
          .not("end_date", "is", null)
          .order("end_date", { ascending: false })
          .limit(1)
          .single();

        if (prevErr && prevErr.code !== "PGRST116") throw prevErr;

        if (prevIter) {
          console.log(`[create-iteration] Cloning structure from iteration ${prevIter.id}`);

          // clone organization_units
          const { data: oldUnits, error: unitsErr } = await supabase
            .from("organization_units")
            .select("*")
            .eq("iteration_id", prevIter.id);
          if (unitsErr) throw unitsErr;

          const idMap = new Map();
          for (const u of oldUnits) {
            const { data: ins, error: insErr } = await supabase
              .from("organization_units")
              .insert([{ name: u.name, parent_id: null, iteration_id: newIterId }])
              .select()
              .single();
            if (insErr) throw insErr;
            idMap.set(u.id, ins.id);
          }

          // update parent links
          for (const u of oldUnits) {
            if (u.parent_id) {
              const newParent = idMap.get(u.parent_id);
              const newId = idMap.get(u.id);
              if (newParent && newId) {
                const { error: updErr } = await supabase
                  .from("organization_units")
                  .update({ parent_id: newParent })
                  .eq("id", newId);
                if (updErr) throw updErr;
              }
            }
          }

          // clone person_roles with remapping
          const { data: oldRoles, error: rolesErr } = await supabase
            .from("person_roles")
            .select("*")
            .eq("iteration_id", prevIter.id);
          if (rolesErr) throw rolesErr;

          for (const r of oldRoles) {
            const newOrgId = idMap.get(r.org_unit_id);
            if (!newOrgId) continue;
            const { error: insRoleErr } = await supabase
              .from("person_roles")
              .insert([{ person_id: r.person_id, org_unit_id: newOrgId, is_manager: r.is_manager, iteration_id: newIterId }]);
            if (insRoleErr) throw insRoleErr;
          }

          console.log(`[create-iteration] Cloned ${oldUnits.length} units & ${oldRoles.length} roles.`);
        }

        res.status(200).json({ success: true, iteration: newIter });
        break;
      }

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

      // ==========================================================
      // 👤 PEOPLE / USER MANAGEMENT
      // ==========================================================

      case "people": {
        if (req.method !== "POST") {
          return res.status(405).json({ success: false, message: "Method not allowed" });
        }
        const { name } = req.body;
        if (!name || !name.trim()) {
          return res.status(400).json({ success: false, message: "Name required." });
        }
        if (name.trim().toLowerCase() === "admin") {
          return res.status(400).json({ success: false, message: "The name 'Admin' is reserved." });
        }
        const { data, error } = await supabase.from("people").insert([{ name }]).select().single();
        if (error) throw error;
        res.status(200).json({ success: true, person: data });
        break;
      }

      case "get-user-roles": {
        const { name } = req.query;
        if (!name) {
          return res.status(400).json({ success: false, message: "Name is required." });
        }

        const { data: person, error: personErr } = await supabase
          .from("people")
          .select("*")
          .ilike("name", name)
          .maybeSingle();
        if (personErr) throw personErr;
        if (!person) {
          return res.status(404).json({ success: false, message: "User not found." });
        }

        const { data: roles, error: rolesErr } = await supabase
          .from("person_roles")
          .select("*, organization_units(name), iterations(name, id, question_set)")
          .eq("person_id", person.id);
        if (rolesErr) throw rolesErr;

        res.status(200).json({ success: true, user: person, roles });
        break;
      }

      // ==========================================================
      // 🧱 ORGANIZATION MANAGEMENT (for org-chart.html)
      // ==========================================================
      // Note: ready placeholders; recheck org-chart later

      case "org-data": {
        const { iteration_id } = req.query;
        if (!iteration_id) return res.status(400).json({ success: false, message: "iteration_id required." });
        const [units, roles, people] = await Promise.all([
          supabase.from("organization_units").select("*").eq("iteration_id", iteration_id),
          supabase.from("person_roles").select("*").eq("iteration_id", iteration_id),
          supabase.from("people").select("*"),
        ]);
        if (units.error || roles.error || people.error)
          throw units.error || roles.error || people.error;
        res.status(200).json({ success: true, units: units.data, roles: roles.data, people: people.data });
        break;
      }

      // ==========================================================
      // 🧩 TABLE VIEWER ENDPOINTS
      // ==========================================================
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

      // ==========================================================
      // 🛑 DEFAULT
      // ==========================================================
      default:
        res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

