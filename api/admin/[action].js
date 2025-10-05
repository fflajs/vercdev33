// api/admin/[action].js
const fs = require("fs");
const path = require("path");
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
        if (req.method !== "POST")
          return res.status(405).json({ success: false, message: "Method not allowed" });

        const { name, question_set } = req.body;
        if (!name || !question_set)
          return res.status(400).json({ success: false, message: "Name and question_set are required." });

        const { data: active } = await supabase
          .from("iterations")
          .select("*")
          .is("end_date", null)
          .maybeSingle();
        if (active)
          return res.status(400).json({ success: false, message: "An active iteration already exists." });

        const { data: newIter, error: createErr } = await supabase
          .from("iterations")
          .insert([{ name, question_set, start_date: new Date().toISOString() }])
          .select()
          .single();
        if (createErr) throw createErr;

        const newIterId = newIter.id;
        const { data: prevIter } = await supabase
          .from("iterations")
          .select("*")
          .not("end_date", "is", null)
          .order("end_date", { ascending: false })
          .limit(1)
          .single();

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
              if (newParent && newId)
                await supabase.from("organization_units").update({ parent_id: newParent }).eq("id", newId);
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
        if (req.method !== "POST")
          return res.status(405).json({ success: false, message: "Method not allowed" });
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
        if (req.method !== "POST")
          return res.status(405).json({ success: false, message: "Method not allowed" });
        const { name } = req.body;
        if (!name?.trim())
          return res.status(400).json({ success: false, message: "Name required." });
        if (name.trim().toLowerCase() === "admin")
          return res.status(400).json({ success: false, message: "The name 'Admin' is reserved." });

        const { data, error } = await supabase
          .from("people")
          .insert([{ name }])
          .select()
          .single();
        if (error) throw error;
        res.status(200).json({ success: true, person: data });
        break;
      }

      case "get-user-roles": {
        const { name } = req.query;
        if (!name)
          return res.status(400).json({ success: false, message: "Name is required." });

        const { data: person } = await supabase.from("people").select("*").ilike("name", name).maybeSingle();
        if (!person)
          return res.status(404).json({ success: false, message: "User not found." });

        const { data: roles } = await supabase
          .from("person_roles")
          .select("*, organization_units(name), iterations(name, id, start_date, question_set)")
          .eq("person_id", person.id);

        res.status(200).json({ success: true, user: person, roles });
        break;
      }

      // ==========================================================
      // 🧱 ORGANIZATION MANAGEMENT
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

      // ==========================================================
      // 🧠 COGNITIVE TOOL ENDPOINTS (UPDATED)
      // ==========================================================
      case "cog-list-sets": {
        const dir = path.join(process.cwd(), "public", "data");
        const files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => ({ name: f }));
        res.status(200).json({ success: true, files });
        break;
      }

      case "cog-load-set": {
        const { filename } = req.query;
        if (!filename)
          return res.status(400).json({ success: false, message: "filename required" });

        const filePath = path.join(process.cwd(), "public", "data", filename);
        if (!fs.existsSync(filePath))
          return res.status(404).json({ success: false, message: "File not found" });

        // ✅ Improved JSON loader (fix for "Invalid or unexpected token")
        let content = fs.readFileSync(filePath, "utf8");
        content = content.replace(/^\uFEFF/, "").trim(); // strip BOM + trim
        try {
          const jsonData = JSON.parse(content);
          res.status(200).json({ success: true, filename, data: jsonData });
        } catch (parseError) {
          console.error("JSON parse error in:", filename, parseError);
          res.status(400).json({ success: false, message: `Invalid JSON format in ${filename}` });
        }
        break;
      }

      case "cog-save-response": {
        if (req.method !== "POST")
          return res.status(405).json({ success: false, message: "Method not allowed" });

        let { person_role_id, org_unit_id, person_id, iteration_id, question_set, answers } = req.body;
        if (!iteration_id || !question_set || !answers)
          return res.status(400).json({ success: false, message: "Missing fields (iteration_id, question_set, answers required)" });

        // Try to resolve role/org if missing but person_id provided
        if ((!person_role_id || !org_unit_id) && person_id) {
          const { data: role } = await supabase
            .from("person_roles")
            .select("*")
            .eq("person_id", person_id)
            .eq("iteration_id", iteration_id)
            .maybeSingle();
          if (role) {
            person_role_id = person_role_id || role.id;
            org_unit_id = org_unit_id || role.org_unit_id;
          }
        }

        const serializedResults = Array.isArray(answers)
          ? JSON.stringify(answers)
          : typeof answers === "string"
          ? answers
          : JSON.stringify([]);

        const { data, error } = await supabase
          .from("surveys")
          .insert([{
            person_role_id: person_role_id ?? null,
            org_unit_id: org_unit_id ?? null,
            iteration_id,
            survey_type: "individual",
            filename: question_set,
            survey_results: serializedResults
          }])
          .select()
          .single();

        if (error) {
          console.error("cog-save-response error:", error.message, error.details, error.hint);
          throw error;
        }

        res.status(200).json({ success: true, record: data });
        break;
      }

      case "cog-get-responses": {
        const { iteration_id } = req.query;
        let query = supabase.from("surveys").select("*");
        if (iteration_id) query = query.eq("iteration_id", iteration_id);
        const { data, error } = await query;
        if (error) throw error;
        res.status(200).json({ success: true, rows: data });
        break;
      }

      case "cog-summary": {
        const { data, error } = await supabase
          .from("surveys")
          .select("iteration_id, count:count(*)")
          .group("iteration_id");
        if (error) throw error;
        res.status(200).json({ success: true, summary: data });
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
      default: {
        res.status(400).json({ success: false, message: `Unknown action: ${action}` });
        break;
      }
    }
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ success: false, message: err.message, details: err.details || null });
  }
};

