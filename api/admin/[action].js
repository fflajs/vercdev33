import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const { action } = req.query;
  const method = req.method;
  const body = req.body || {};
  console.info(`[${new Date().toISOString()}] ➡️ Admin API called: action=${action}, method=${method}`);

  try {
    switch (action) {
      case "get-role-context":
        if (method !== "GET") return res.status(405).json({ success: false, message: "Method not allowed" });
        {
          const { role_id } = req.query;
          if (!role_id) return res.status(400).json({ success: false, message: "role_id required" });

          const { data: role, error } = await supabase
            .from("person_roles")
            .select("id,is_manager,iteration_id,org_unit_id,people(name),organization_units(name),iterations(name,question_set)")
            .eq("id", role_id)
            .single();
          if (error) throw error;

          return res.json({
            success: true,
            context: {
              user: role.people?.name,
              roleType: role.is_manager ? "Manager" : "Member",
              unitName: role.organization_units?.name,
              iterName: role.iterations?.name,
              iterId: role.iteration_id,
              qset: role.iterations?.question_set
            }
          });
        }

      case "org-data":
        if (method !== "GET") return res.status(405).json({ success: false, message: "Method not allowed" });
        {
          const { iteration_id } = req.query;
          if (!iteration_id) return res.status(400).json({ success: false, message: "iteration_id required" });

          const { data: units, error: errUnits } = await supabase
            .from("organization_units").select("*").eq("iteration_id", iteration_id);
          if (errUnits) throw errUnits;

          const { data: roles, error: errRoles } = await supabase
            .from("person_roles").select("id,person_id,org_unit_id,is_manager,description,people(name)").eq("iteration_id", iteration_id);
          if (errRoles) throw errRoles;

          const { data: people, error: errPeople } = await supabase.from("people").select("*");
          if (errPeople) throw errPeople;

          return res.json({ success: true, units, roles, people });
        }

      case "table-viewer":
        if (method !== "GET") return res.status(405).json({ success: false, message: "Method not allowed" });
        {
          const { table } = req.query;
          if (!table) return res.status(400).json({ success: false, message: "table required" });

          const { data, error } = await supabase.from(table).select("*");
          if (error) throw error;
          return res.json({ success: true, data });
        }

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error("API error", err);
    return res.status(500).json({ success: false, message: err.message || "Internal Server Error" });
  }
}

