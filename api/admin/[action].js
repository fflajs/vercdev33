// api/admin/[action].js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { method } = req;
  const { action } = req.query;
  const body = req.body;

  console.log(`[${new Date().toISOString()}] ➡️ Admin API called: action=${action}, method=${method}`);

  try {
    switch (action) {
      /**
       * =========================
       * ITERATIONS
       * =========================
       */
      case "active-iteration":
        if (method === "GET") {
          const { data, error } = await supabase
            .from("iterations")
            .select("*")
            .is("end_date", null)
            .order("start_date", { ascending: false })
            .limit(1)
            .single();

          if (error && error.code !== "PGRST116") throw error;
          if (!data) {
            return res.status(404).json({ success: false, message: "No active iteration found" });
          }
          return res.status(200).json({ success: true, iteration: data });
        }
        break;

      case "create-iteration":
        if (method === "POST") {
          const { name, set } = body;
          if (!name || !set) {
            return res.status(400).json({ success: false, message: "Name and Question Set are required" });
          }

          const { data, error } = await supabase
            .from("iterations")
            .insert([{ name, question_set: set, start_date: new Date().toISOString() }])
            .select()
            .single();

          if (error) throw error;
          return res.status(201).json({ success: true, iteration: data });
        }
        break;

      case "close-iteration":
        if (method === "POST") {
          const { id } = body;
          if (!id) return res.status(400).json({ success: false, message: "Iteration ID is required" });

          const { data, error } = await supabase
            .from("iterations")
            .update({ end_date: new Date().toISOString() })
            .eq("id", id)
            .select()
            .single();

          if (error) throw error;
          return res.status(200).json({ success: true, iteration: data });
        }
        break;

      /**
       * =========================
       * ORGANIZATION MANAGER
       * =========================
       */
      case "org-data":
        if (method === "GET") {
          const { iteration_id } = req.query;
          console.log(`[org-data] iteration_id=${iteration_id}`);

          const { data: units, error: unitError } = await supabase
            .from("organization_units")
            .select("*")
            .eq("iteration_id", iteration_id);

          if (unitError) throw unitError;

          const { data: roles, error: roleError } = await supabase
            .from("person_roles")
            .select("*, people(name)")
            .eq("iteration_id", iteration_id);

          if (roleError) throw roleError;

          const { data: people, error: peopleError } = await supabase
            .from("people")
            .select("*");

          if (peopleError) throw peopleError;

          return res.status(200).json({ success: true, units, roles, people });
        }
        break;

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

          if (error) throw error;
          return res.status(201).json({ success: true, unit: data });
        }
        break;

      case "update-org-unit":
        if (method === "PUT") {
          const { id, name } = body;
          if (!id || !name) {
            return res.status(400).json({ success: false, message: "ID and name required" });
          }

          const { data, error } = await supabase
            .from("organization_units")
            .update({ name })
            .eq("id", id)
            .select()
            .single();

          if (error) throw error;
          return res.status(200).json({ success: true, unit: data });
        }
        break;

      case "delete-org-unit":
        if (method === "DELETE") {
          const { id } = body;
          if (!id) return res.status(400).json({ success: false, message: "ID required" });

          const { error } = await supabase.from("organization_units").delete().eq("id", id);
          if (error) throw error;

          return res.status(200).json({ success: true, message: "Org unit deleted" });
        }
        break;

      case "assign-role":
        if (method === "POST") {
          const { person_id, org_unit_id, iteration_id, is_manager } = body;
          if (!person_id || !org_unit_id || !iteration_id) {
            return res.status(400).json({ success: false, message: "Missing role assignment data" });
          }

          const { data, error } = await supabase
            .from("person_roles")
            .insert([{ person_id, org_unit_id, iteration_id, is_manager: !!is_manager }])
            .select()
            .single();

          if (error) throw error;
          return res.status(201).json({ success: true, role: data });
        }
        break;

      case "delete-role":
        if (method === "DELETE") {
          const { id } = body;
          if (!id) return res.status(400).json({ success: false, message: "Role ID required" });

          const { error } = await supabase.from("person_roles").delete().eq("id", id);
          if (error) throw error;

          return res.status(200).json({ success: true, message: "Role deleted" });
        }
        break;

      /**
       * =========================
       * PEOPLE
       * =========================
       */
      case "people":
        if (method === "GET") {
          const { data, error } = await supabase.from("people").select("*");
          if (error) throw error;
          return res.status(200).json({ success: true, people: data });
        }

        if (method === "POST") {
          const { name } = body;
          if (!name) return res.status(400).json({ success: false, message: "Name is required" });

          const { data, error } = await supabase
            .from("people")
            .insert([{ name }])
            .select()
            .single();

          if (error) {
            if (error.code === "23505") {
              return res.status(409).json({ success: false, message: `Name "${name}" already exists.` });
            }
            throw error;
          }

          return res.status(201).json({ success: true, person: data });
        }
        break;

      /**
       * =========================
       * TABLE VIEWER
       * =========================
       */
      case "table-data":
        if (method === "GET") {
          const { table } = req.query;
          if (!table) return res.status(400).json({ success: false, message: "Table name required" });

          const { data, error } = await supabase.from(table).select("*");
          if (error) throw error;

          return res.status(200).json({ success: true, rows: data });
        }
        break;

      case "reset-test-data":
        if (method === "POST") {
          await supabase.from("person_roles").delete().neq("id", 0);
          await supabase.from("organization_units").delete().neq("id", 0);
          await supabase.from("iterations").delete().neq("id", 0);
          await supabase.from("people").delete().neq("id", 0);

          return res.status(200).json({ success: true, message: "Test data reset complete" });
        }
        break;

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ API error:`, error);
    return res.status(500).json({ success: false, message: error.message, error });
  }
}

