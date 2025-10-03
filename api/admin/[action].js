import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { action } = req.query;
  const method = req.method;
  const body = req.body || {};

  console.info(`[${new Date().toISOString()}] ➡️ Admin API called: action=${action}, method=${method}`);

  try {
    switch (action) {
      /**
       * 🔹 Registration (people)
       */
      case "people":
        if (method === "POST") {
          const { name } = body;
          if (!name) return res.status(400).json({ success: false, message: "Name is required" });

          // Check duplicate
          const { data: existing } = await supabase
            .from("people")
            .select("*")
            .eq("name", name)
            .maybeSingle();
          if (existing) return res.json({ success: false, message: `Name "${name}" already exists.` });

          const { data, error } = await supabase.from("people").insert([{ name }]).select().single();
          if (error) throw error;
          return res.json({ success: true, person: data });
        }
        return res.status(405).json({ success: false, message: "Method not allowed" });

      /**
       * 🔹 Active Iteration (for admin.html)
       */
      case "active-iteration":
        if (method === "GET") {
          const { data, error } = await supabase
            .from("iterations")
            .select("*")
            .is("end_date", null)
            .order("id", { ascending: false })
            .maybeSingle();
          if (error) throw error;
          if (!data) return res.json({ success: false, message: "No active iteration found" });
          return res.json({ success: true, iteration: data });
        }
        return res.status(405).json({ success: false, message: "Method not allowed" });

      /**
       * 🔹 Create Iteration
       */
      case "create-iteration":
        if (method === "POST") {
          const { name, set } = body;
          if (!name || !set) return res.status(400).json({ success: false, message: "Name and question set required" });

          // close any existing
          await supabase.from("iterations").update({ end_date: new Date().toISOString() }).is("end_date", null);

          // create new
          const { data: newIter, error } = await supabase
            .from("iterations")
            .insert([{ name, question_set: set }])
            .select()
            .single();
          if (error) throw error;

          return res.json({ success: true, iteration: newIter });
        }
        return res.status(405).json({ success: false, message: "Method not allowed" });

      /**
       * 🔹 Close Iteration
       */
      case "close-iteration":
        if (method === "POST") {
          const { iteration_id } = body;
          if (!iteration_id) return res.json({ success: false, message: "Iteration ID required" });

          const { error } = await supabase
            .from("iterations")
            .update({ end_date: new Date().toISOString() })
            .eq("id", iteration_id);
          if (error) throw error;

          return res.json({ success: true });
        }
        return res.status(405).json({ success: false, message: "Method not allowed" });

      /**
       * 🔹 Org Data
       */
      case "org-data":
        if (method === "GET") {
          const { iteration_id } = req.query;
          if (!iteration_id) return res.status(400).json({ success: false, message: "iteration_id required" });

          const { data: units } = await supabase.from("organization_units").select("*").eq("iteration_id", iteration_id);
          const { data: roles } = await supabase
            .from("person_roles")
            .select("id,person_id,org_unit_id,is_manager,description,people(name)")
            .eq("iteration_id", iteration_id);
          const { data: people } = await supabase.from("people").select("*");

          return res.json({ success: true, units, roles, people });
        }
        return res.status(405).json({ success: false, message: "Method not allowed" });

      /**
       * 🔹 Create Org Unit
       */
      case "create-org-unit":
        if (method === "POST") {
          const { name, parent_id, iteration_id } = body;
          const { data, error } = await supabase
            .from("organization_units")
            .insert([{ name, parent_id, iteration_id }])
            .select()
            .single();
          if (error) throw error;
          return res.json({ success: true, unit: data });
        }
        return res.status(405).json({ success: false, message: "Method not allowed" });

      /**
       * 🔹 Assign Role
       */
      case "assign-role":
        if (method === "POST") {
          const { person_id, org_unit_id, is_manager, iteration_id } = body;
          const { data, error } = await supabase
            .from("person_roles")
            .insert([{ person_id, org_unit_id, is_manager, iteration_id }])
            .select()
            .single();
          if (error) throw error;
          return res.json({ success: true, role: data });
        }
        return res.status(405).json({ success: false, message: "Method not allowed" });

      /**
       * 🔹 Remove Role
       */
      case "remove-role":
        if (method === "POST") {
          const { role_id } = body;
          const { error } = await supabase.from("person_roles").delete().eq("id", role_id);
          if (error) throw error;
          return res.json({ success: true });
        }
        return res.status(405).json({ success: false, message: "Method not allowed" });

      /**
       * 🔹 Table Viewer
       */
      case "table-viewer":
        if (method === "GET") {
          const { table } = req.query;
          if (!table) return res.status(400).json({ success: false, message: "table required" });
          const { data, error } = await supabase.from(table).select("*");
          if (error) throw error;
          return res.json({ success: true, data });
        }
        return res.status(405).json({ success: false, message: "Method not allowed" });

      /**
       * 🔹 Get User Roles (for login-user.html)
       */
      case "get-user-roles":
        if (method === "GET") {
          const { name } = req.query;
          if (!name) return res.status(400).json({ success: false, message: "name required" });

          const { data: user } = await supabase.from("people").select("*").eq("name", name).maybeSingle();
          if (!user) return res.json({ success: false, message: `User ${name} not found` });

          const { data: iteration } = await supabase
            .from("iterations")
            .select("*")
            .is("end_date", null)
            .order("id", { ascending: false })
            .maybeSingle();
          if (!iteration) return res.json({ success: false, message: "No active iteration" });

          const { data: roles } = await supabase
            .from("person_roles")
            .select("id,is_manager,org_unit_id,iteration_id,organization_units(id,name,parent_id)")
            .eq("person_id", user.id)
            .eq("iteration_id", iteration.id);

          return res.json({ success: true, user, iteration, roles });
        }
        return res.status(405).json({ success: false, message: "Method not allowed" });

      /**
       * 🔹 Get Role Context (for portal.html + org-chart.html)
       */
      case "get-role-context":
        if (method === "GET") {
          const { role_id } = req.query;
          if (!role_id) return res.status(400).json({ success: false, message: "role_id required" });

          const { data: role } = await supabase
            .from("person_roles")
            .select("id,is_manager,iteration_id,org_unit_id,people(name),organization_units(name),iterations(name,question_set)")
            .eq("id", role_id)
            .single();

          return res.json({
            success: true,
            context: {
              user: role.people?.name,
              roleType: role.is_manager ? "Manager" : "Member",
              unitName: role.organization_units?.name,
              iterName: role.iterations?.name,
              iterId: role.iteration_id,
              qset: role.iterations?.question_set,
            },
          });
        }
        return res.status(405).json({ success: false, message: "Method not allowed" });

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error("API error", err);
    return res.status(500).json({ success: false, message: err.message || "Internal Server Error" });
  }
}

