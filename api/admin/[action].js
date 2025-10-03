// api/admin/[action].js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const {
    query: { action, ...query },
    method,
    body,
  } = req;

  console.info(
    `[${new Date().toISOString()}] ➡️ Admin API called: action=${action}, method=${method}`
  );

  try {
    switch (action) {
      /**
       * ACTIVE ITERATION
       */
      case "active-iteration":
        if (method === "GET") {
          const { data, error } = await supabase
            .from("iterations")
            .select("*")
            .is("end_date", null)
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) throw error;
          if (!data)
            return res
              .status(404)
              .json({ success: false, message: "No active iteration found" });

          return res.json({ success: true, iteration: data });
        }
        break;

      /**
       * CREATE ITERATION
       */
      case "create-iteration":
        if (method === "POST") {
          const { name, set } = body;
          if (!name || !set) {
            return res
              .status(400)
              .json({ success: false, message: "Name and question set required" });
          }

          // Insert iteration
          const { data: newIter, error: errNew } = await supabase
            .from("iterations")
            .insert([{ name, question_set: set }])
            .select()
            .single();

          if (errNew) throw errNew;

          // Clone org + roles from last iteration if exists
          const { data: prevIter } = await supabase
            .from("iterations")
            .select("id")
            .lt("id", newIter.id)
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (prevIter) {
            // Copy units
            const { data: units } = await supabase
              .from("organization_units")
              .select("*")
              .eq("iteration_id", prevIter.id);

            if (units?.length) {
              const newUnits = units.map((u) => ({
                name: u.name,
                parent_id: u.parent_id,
                iteration_id: newIter.id,
              }));
              await supabase.from("organization_units").insert(newUnits);
            }

            // Copy roles
            const { data: roles } = await supabase
              .from("person_roles")
              .select("*")
              .eq("iteration_id", prevIter.id);

            if (roles?.length) {
              const newRoles = roles.map((r) => ({
                person_id: r.person_id,
                org_unit_id: r.org_unit_id,
                is_manager: r.is_manager,
                description: r.description,
                iteration_id: newIter.id,
              }));
              await supabase.from("person_roles").insert(newRoles);
            }
          }

          return res.json({ success: true, iteration: newIter });
        }
        break;

      /**
       * CLOSE ITERATION
       */
      case "close-iteration":
        if (method === "POST") {
          const { iteration_id } = body;
          if (!iteration_id)
            return res
              .status(400)
              .json({ success: false, message: "Iteration ID required" });

          const { error } = await supabase
            .from("iterations")
            .update({ end_date: new Date().toISOString() })
            .eq("id", iteration_id);

          if (error) throw error;
          return res.json({ success: true, message: "Iteration closed" });
        }
        break;

      /**
       * GET USER ROLES (for login-user.html)
       */
      case "get-user-roles":
        if (method === "GET") {
          const { name } = query;
          if (!name)
            return res
              .status(400)
              .json({ success: false, message: "Name required" });

          // 1. Find user
          const { data: user, error: errUser } = await supabase
            .from("people")
            .select("*")
            .eq("name", name)
            .single();

          if (errUser || !user)
            return res
              .status(404)
              .json({ success: false, message: "User not found" });

          // 2. Active iteration
          const { data: iteration, error: errIter } = await supabase
            .from("iterations")
            .select("*")
            .is("end_date", null)
            .order("id", { ascending: false })
            .limit(1)
            .single();

          if (errIter || !iteration)
            return res
              .status(404)
              .json({ success: false, message: "No active iteration" });

          // 3. Roles
          const { data: roles, error: errRoles } = await supabase
            .from("person_roles")
            .select(
              "id, is_manager, org_unit_id, iteration_id, organization_units(id, name, parent_id)"
            )
            .eq("person_id", user.id)
            .eq("iteration_id", iteration.id);

          if (errRoles)
            return res.json({
              success: false,
              message: "Error loading roles",
              error: errRoles,
            });

          return res.json({ success: true, user, iteration, roles });
        }
        break;

      /**
       * GET ROLE CONTEXT (for portal)
       */
      case "get-role-context":
        if (method === "GET") {
          const { role_id } = query;
          if (!role_id)
            return res
              .status(400)
              .json({ success: false, message: "role_id required" });

          const { data, error } = await supabase
            .from("person_roles")
            .select(
              `id, is_manager, description,
               people(id, name),
               organization_units(id, name),
               iterations(id, name, question_set)`
            )
            .eq("id", role_id)
            .single();

          if (error || !data)
            return res.json({ success: false, message: "Role not found" });

          const context = {
            user: data.people?.name,
            roleType: data.is_manager ? "Manager" : "Coworker",
            unitName: data.organization_units?.name,
            iterName: data.iterations?.name,
            iterId: data.iterations?.id,
            qset: data.iterations?.question_set,
          };

          return res.json({ success: true, context });
        }
        break;

      /**
       * ORG DATA
       */
      case "org-data":
        if (method === "GET") {
          const { iteration_id } = query;
          if (!iteration_id)
            return res
              .status(400)
              .json({ success: false, message: "iteration_id required" });

          // Units
          const { data: units, error: errUnits } = await supabase
            .from("organization_units")
            .select("*")
            .eq("iteration_id", iteration_id);

          if (errUnits) throw errUnits;

          // Roles
          const { data: roles, error: errRoles } = await supabase
            .from("person_roles")
            .select(
              "id, person_id, org_unit_id, is_manager, description, people(name)"
            )
            .eq("iteration_id", iteration_id);

          if (errRoles) throw errRoles;

          // People
          const { data: people, error: errPeople } = await supabase
            .from("people")
            .select("*");

          if (errPeople) throw errPeople;

          return res.json({ success: true, units, roles, people });
        }
        break;

      /**
       * CREATE ORG UNIT
       */
      case "create-org-unit":
        if (method === "POST") {
          const { name, parent_id, iteration_id } = body;
          if (!name || !iteration_id)
            return res.status(400).json({
              success: false,
              message: "name and iteration_id required",
            });

          const { data, error } = await supabase
            .from("organization_units")
            .insert([{ name, parent_id, iteration_id }])
            .select()
            .single();

          if (error) throw error;
          return res.json({ success: true, unit: data });
        }
        break;

      /**
       * ASSIGN ROLE
       */
      case "assign-role":
        if (method === "POST") {
          const { person_id, org_unit_id, is_manager, iteration_id } = body;
          if (!person_id || !org_unit_id || !iteration_id)
            return res
              .status(400)
              .json({ success: false, message: "Missing fields" });

          const { data, error } = await supabase
            .from("person_roles")
            .insert([{ person_id, org_unit_id, is_manager, iteration_id }])
            .select()
            .single();

          if (error) throw error;
          return res.json({ success: true, role: data });
        }
        break;

      /**
       * TABLE VIEWER
       */
      case "table-viewer":
        if (method === "GET") {
          const { table } = query;
          if (!table)
            return res
              .status(400)
              .json({ success: false, message: "Table required" });

          const { data, error } = await supabase.from(table).select("*");
          if (error) throw error;

          return res.json({ success: true, data });
        }
        break;

      default:
        return res
          .status(400)
          .json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error("API error", err);
    return res.status(500).json({ success: false, message: err.message, error: err });
  }
}

