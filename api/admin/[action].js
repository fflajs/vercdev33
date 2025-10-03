import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const {
    query: { action, table, role_id, name },
    method,
    body,
  } = req;

  console.info(`[${new Date().toISOString()}] ➡️ Admin API called: action=${action}, method=${method}`);

  try {
    switch (action) {
      /**
       * ----------------------------------------------------
       * Iterations
       * ----------------------------------------------------
       */
      case "active-iteration":
        if (method === "GET") {
          const { data, error } = await supabase
            .from("iterations")
            .select("*")
            .is("end_date", null)
            .single();
          if (error) {
            console.error("Error fetching active iteration", error);
            return res.status(404).json({ success: false, message: "No active iteration found" });
          }
          return res.status(200).json({ success: true, iteration: data });
        }
        break;

      case "create-iteration":
        if (method === "POST") {
          const { name, question_set } = body;
          if (!name || !question_set) {
            return res.status(400).json({ success: false, message: "Name and question_set required" });
          }

          // Find latest iteration
          const { data: lastIter } = await supabase
            .from("iterations")
            .select("*")
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle();

          // Insert new iteration
          const { data: newIter, error: errNew } = await supabase
            .from("iterations")
            .insert([{ name, question_set }])
            .select()
            .single();
          if (errNew) throw errNew;

          // Clone org structure if previous iteration exists
          if (lastIter) {
            const { data: prevUnits } = await supabase
              .from("organization_units")
              .select("*")
              .eq("iteration_id", lastIter.id);
            if (prevUnits?.length) {
              const unitMap = {};
              for (const u of prevUnits) {
                const { data: inserted } = await supabase
                  .from("organization_units")
                  .insert([{ name: u.name, parent_id: null, iteration_id: newIter.id }])
                  .select()
                  .single();
                unitMap[u.id] = inserted.id;
              }
              const { data: prevRoles } = await supabase
                .from("person_roles")
                .select("*")
                .eq("iteration_id", lastIter.id);
              for (const r of prevRoles || []) {
                await supabase.from("person_roles").insert([
                  {
                    person_id: r.person_id,
                    org_unit_id: unitMap[r.org_unit_id] || null,
                    is_manager: r.is_manager,
                    description: r.description,
                    iteration_id: newIter.id,
                  },
                ]);
              }
            }
          }

          return res.status(201).json({ success: true, iteration: newIter });
        }
        break;

      case "close-iteration":
        if (method === "POST") {
          const { iteration_id } = body;
          if (!iteration_id) {
            return res.status(400).json({ success: false, message: "Iteration ID required" });
          }
          const { error } = await supabase
            .from("iterations")
            .update({ end_date: new Date().toISOString() })
            .eq("id", iteration_id);
          if (error) throw error;
          return res.status(200).json({ success: true });
        }
        break;

      /**
       * ----------------------------------------------------
       * Organization Manager
       * ----------------------------------------------------
       */
      case "org-data":
        if (method === "GET") {
          const { iteration_id } = req.query;
          if (!iteration_id) return res.status(400).json({ success: false, message: "iteration_id required" });

          const { data: units } = await supabase
            .from("organization_units")
            .select("*")
            .eq("iteration_id", iteration_id);

          const { data: roles } = await supabase
            .from("person_roles")
            .select("*, person:people(*), unit:organization_units(*)")
            .eq("iteration_id", iteration_id);

          const { data: people } = await supabase.from("people").select("*");

          return res.status(200).json({ success: true, units: units || [], roles: roles || [], people: people || [] });
        }
        break;

      case "create-org-unit":
        if (method === "POST") {
          const { name, parent_id, iteration_id } = body;
          const { data, error } = await supabase
            .from("organization_units")
            .insert([{ name, parent_id, iteration_id }])
            .select()
            .single();
          if (error) throw error;
          return res.status(201).json({ success: true, unit: data });
        }
        break;

      case "assign-role":
        if (method === "POST") {
          const { person_id, org_unit_id, is_manager, iteration_id } = body;
          const { data, error } = await supabase
            .from("person_roles")
            .insert([{ person_id, org_unit_id, is_manager, iteration_id }])
            .select()
            .single();
          if (error) throw error;
          return res.status(201).json({ success: true, role: data });
        }
        break;

      /**
       * ----------------------------------------------------
       * Table Viewer
       * ----------------------------------------------------
       */
      case "table-viewer":
        if (method === "GET") {
          if (!table) return res.status(400).json({ success: false, message: "Table name required" });
          const { data, error } = await supabase.from(table).select("*");
          if (error) throw error;
          return res.status(200).json({ success: true, rows: data });
        }
        break;

      /**
       * ----------------------------------------------------
       * Role / Login context
       * ----------------------------------------------------
       */
      case "get-user-roles":
        if (method === "GET") {
          if (!name) return res.status(400).json({ success: false, message: "name required" });
          const { data: user } = await supabase.from("people").select("*").eq("name", name).single();
          const { data: iteration } = await supabase.from("iterations").select("*").is("end_date", null).single();
          const { data: roles } = await supabase
            .from("person_roles")
            .select("*, unit:organization_units(*)")
            .eq("person_id", user.id)
            .eq("iteration_id", iteration.id);
          return res.status(200).json({ success: true, user, iteration, roles });
        }
        break;

      case "get-role-context":
        if (method === "GET") {
          if (!role_id) return res.status(400).json({ success: false, message: "role_id required" });
          const { data: role } = await supabase
            .from("person_roles")
            .select("*, person:people(*), unit:organization_units(*), iteration:iterations(*)")
            .eq("id", role_id)
            .single();

          const context = {
            user: role.person.name,
            roleType: role.is_manager ? "Manager" : "Member",
            unitName: role.unit.name,
            iterName: role.iteration.name,
            iterId: role.iteration.id,
            qset: role.iteration.question_set,
          };
          return res.status(200).json({ success: true, context });
        }
        break;

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error("API error", err);
    return res.status(500).json({ success: false, message: err.message, error: err });
  }
}

