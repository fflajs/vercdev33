// api/admin/[action].js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { action } = req.query;

  try {
    switch (action) {
      case "active-iteration": {
        const { data, error } = await supabase
          .from("iterations")
          .select("*")
          .eq("active", true)
          .single();
        if (error) throw error;
        res.status(200).json({ success: true, iteration: data });
        break;
      }

      case "org-data": {
        const iterationId = req.query.iteration_id;
        const [units, roles, people] = await Promise.all([
          supabase.from("organization_units").select("*").eq("iteration_id", iterationId),
          supabase.from("person_roles").select("*").eq("iteration_id", iterationId),
          supabase.from("people").select("*"),
        ]);
        if (units.error) throw units.error;
        if (roles.error) throw roles.error;
        if (people.error) throw people.error;
        res.status(200).json({
          success: true,
          units: units.data,
          roles: roles.data,
          people: people.data,
        });
        break;
      }

      case "add-unit": {
        const { name, parent_id, iteration_id } = req.body;
        const { data, error } = await supabase
          .from("organization_units")
          .insert([{ name, parent_id, iteration_id }])
          .select()
          .single();
        if (error) throw error;
        res.status(200).json({ success: true, unit: data });
        break;
      }

      case "delete-unit": {
        const { id } = req.body;
        // cascade delete roles first
        await supabase.from("person_roles").delete().eq("org_unit_id", id);
        // then delete subunits
        await supabase.from("organization_units").delete().eq("parent_id", id);
        // finally delete this unit
        const { error } = await supabase.from("organization_units").delete().eq("id", id);
        if (error) throw error;
        res.status(200).json({ success: true });
        break;
      }

      case "add-role": {
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

      case "remove-role": {
        const { id } = req.body;
        const { error } = await supabase.from("person_roles").delete().eq("id", id);
        if (error) throw error;
        res.status(200).json({ success: true });
        break;
      }

      // 🆕 NEW: Register a person
      case "people": {
        if (req.method !== "POST") {
          res.status(405).json({ success: false, message: "Method not allowed" });
          break;
        }
        const { name } = req.body;
        if (!name) {
          res.status(400).json({ success: false, message: "Name required" });
          break;
        }
        const { data, error } = await supabase
          .from("people")
          .insert([{ name }])
          .select()
          .single();
        if (error) throw error;
        res.status(200).json({ success: true, person: data });
        break;
      }

      default:
        res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
}

