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

        const { data: active, error: activeErr } = await supabase
          .from("iterations")
          .select("*")
          .is("end_date", null)
          .maybeSingle();
        if (activeErr) throw activeErr;
        if (active) {
          return res.status(400).json({ success: false, message: "An active iteration already exists." });
        }

        const { data: newIter, error: createErr } = await supabase
          .from("iterations")
          .insert([{ name, question_set, start_date: new Date().toISOString() }])
          .select()
          .single();
        if (createErr) throw createErr;

        const newIterId = newIter.id;

        const { data: prevIter, error: prevErr } = await supabase
          .from("iterations")
          .select("*")
          .not("end_date", "is", null)
          .order("end_date", { ascending: false })
          .limit(1)
          .single();
        if (prevErr && prevErr.code !== "PGRST116") throw prevErr;

        if (prevIter) {
          const { data: oldUnits } = await supabase
            .from("organization_units")
            .select("*")
            .eq("iteration_id", prevIter.id);

          const idMap = new Map();
          for (const u of oldUnits) {
            const { data: ins } = await supabase
              .from("organization_units")
              .insert([{ name: u.name, parent_id: null, iteration_id: newIterId }])
              .select()
              .single();
            idMap.set(u.id, ins.id);
          }

          for (const u of oldUnits) {
            if (u.parent_id) {
              const newParent = idMap.get(u.parent_id);
              const newId = idMap.get(u.id);
              if (newParent && newId) {
                await supabase.from("organization_units").update({ parent_id: newParent }).eq("id", newId);
              }
            }
          }

          const { data: oldRoles } = await supabase
            .from("person_roles")
            .select("*")
            .eq("iteration_id", prevIter.id);
          for (const r of oldRoles) {
            const newOrgId = idMap.get(r.org_unit_id);
            if (!newOrgId) continue;
            await supabase
              .from("person_roles")
              .insert([{ person_id: r.person_id, org_unit_id: newOrgId, is_manager: r.is_manager, iteration_id: newIterId }]);
          }
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
        if (!name) return res.status(400).json({ success: false, message: "Name is required." });

        const { data: person } = await supabase.from("people").select("*").ilike("name", name).maybeSingle();
        if (!person) return res.status(404).json({ success: false, message: "User not found." });

        const { data: roles } = await supabase
          .from("person_roles")
          .select("*, organization_units(name), iterations(name, id, question_set)")
          .eq("person_id", person.id);

        res.status(200).json({ success: true, user: person, roles });
        break;
      }

      // ==========================================================
      // 🧱 ORGANIZATION MANAGEMENT (new complete)
      // ==========================================================

      case "org-data": {
        const { iteration_id } = req.query;
        if (!iteration_id)
          return res.status(400).json({ success: false, message: "iteration_id required." });
        const [units, roles, people] = await Promise.all([
          supabase.from("organization_units").select("*").eq("iteration_id", iteration_id),
          supabase.from("person_roles").select("*").eq("iteration_id", iteration_id),
          supabase.from("people").select("*"),
        ]);
        res.status(200).json({ success: true, units: units.data, roles: roles.data, people: people.data });
        break;
      }

      case "create-org-unit": {
        const { name, parent_id, iteration_id } = req.body;
        if (!name || !iteration_id)
          return res.status(400).json({ success: false, message: "Missing fields." });
        const { data, error } = await supabase
          .from("organization_units")
          .insert([{ name, parent_id: parent_id || null, iteration_id }])
          .select()
          .single();
        if (error) throw error;
        res.status(200).json({ success: true, unit: data });
        break;
      }

      case "update-org-unit": {
        const { id, name } = req.body;
        const { error } = await supabase.from("organization_units").update({ name }).eq("id", id);
        if (error) throw error;
        res.status(200).json({ success: true });
        break;
      }

      case "delete-org-unit": {
        const { id } = req.query;
        if (!id) return res.status(400).json({ success: false, message: "Missing id" });

        const deleteRecursive = async (unitId) => {
          const { data: children } = await supabase
            .from("organization_units")
            .select("id")
            .eq("parent_id", unitId);
          for (const child of children) await deleteRecursive(child.id);
          await supabase.from("person_roles").delete().eq("org_unit_id", unitId);
          await supabase.from("organization_units").delete().eq("id", unitId);
        };

        await deleteRecursive(Number(id));
        res.status(200).json({ success: true });
        break;
      }

      case "assign-person": {
        const { person_id, org_unit_id, is_manager, iteration_id } = req.body;
        const { data, error } = await supabase
          .from("person_roles")
          .insert([{ person_id, org_unit_id, is_manager, iteration_id }])
          .select()
          .single();
        if (error) throw error;
        res.status(200).json({ success: true, role: data });
        break;
      }

      case "remove-person": {
        const { role_id } = req.query;
        const { error } = await supabase.from("person_roles").delete().eq("id", role_id);
        if (error) throw error;
        res.status(200).json({ success: true });
        break;
      }

      // ==========================================================
      // 🧩 TABLE VIEWER ENDPOINTS
      // ==========================================================
      case "people-all": {
        const { data } = await supabase.from("people").select("*");
        res.status(200).json({ success: true, rows: data });
        break;
      }
      case "org-units-all": {
        const { data } = await supabase.from("organization_units").select("*");
        res.status(200).json({ success: true, rows: data });
        break;
      }
      case "roles-all": {
        const { data } = await supabase.from("person_roles").select("*");
        res.status(200).json({ success: true, rows: data });
        break;
      }
      case "iterations-all": {
        const { data } = await supabase.from("iterations").select("*");
        res.status(200).json({ success: true, rows: data });
        break;
      }
      case "app-data-all": {
        const { data } = await supabase.from("app_data").select("*");
        res.status(200).json({ success: true, rows: data });
        break;
      }
      case "surveys-all": {
        const { data } = await supabase.from("surveys").select("*");
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

