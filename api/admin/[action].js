import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { query, method, body } = req;
  const { action } = query;

  console.info(`[${new Date().toISOString()}] ➡️ Admin API called: action=${action}, method=${method}`);

  try {
    switch (action) {
      /**
       * GET active iteration by role context
       */
      case "get-role-context":
        if (method === "GET") {
          const { role_id } = query;
          if (!role_id) return res.status(400).json({ success: false, message: "role_id required" });

          const { data: role, error } = await supabase
            .from("person_roles")
            .select("id, is_manager, iteration_id, org_unit_id, people(name), organization_units(name), iterations(name, question_set)")
            .eq("id", role_id)
            .single();

          if (error || !role) return res.status(404).json({ success: false, message: "Role not found" });

          return res.json({
            success: true,
            context: {
              user: role.people?.name,
              roleType: role.is_manager ? "Manager" : "Member",
              unitName: role.organization_units?.name,
              iterName: role.iterations?.name,
              iterId: role.iterations?.id || role.iteration_id,
              qset: role.iterations?.question_set
            }
          });
        }
        break;

      /**
       * GET org-data for iteration
       */
      case "org-data":
        if (method === "GET") {
          const { iteration_id } = query;
          if (!iteration_id) return res.status(400).json({ success: false, message: "iteration_id required" });

          const { data: units, error: errUnits } = await supabase
            .from("organization_units")
            .select("*")
            .eq("iteration_id", iteration_id);

          const { data: roles, error: errRoles } = await supabase
            .from("person_roles")
            .select("*")
            .eq("iteration_id", iteration_id);

          const { data: people, error: errPeople } = await supabase
            .from("people")
            .select("*");

          if (errUnits || errRoles || errPeople) {
            return res.status(500).json({
              success: false,
              message: "Error loading org-data",
              error: errUnits || errRoles || errPeople
            });
          }

          return res.json({ success: true, units, roles, people });
        }
        break;

      /**
       * POST create-org-unit
       */
      case "create-org-unit":
        if (method === "POST") {
          const { name, parent_id, iteration_id } = body;
          if (!name || !iteration_id) {
            return res.status(400).json({ success: false, message: "Name and iteration_id required" });
          }

          const { data, error } = await supabase
            .from("organization_units")
            .insert([{ name, parent_id, iteration_id }])
            .select()
            .single();

          if (error) {
            return res.status(500).json({ success: false, message: "Error creating org unit", error });
          }

          return res.json({ success: true, unit: data });
        }
        break;

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error("Handler error", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

