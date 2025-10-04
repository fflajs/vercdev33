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
      // ✅ Get the current active iteration
      case "active-iteration": {
        const { data, error } = await supabase
          .from("iterations")
          .select("*")
          .is("end_date", null)   // active = where end_date IS NULL
          .single();

        if (error) {
          if (error.code === "PGRST116") {
            // no rows found
            return res.status(200).json({ success: true, iteration: null });
          }
          throw error;
        }
        res.status(200).json({ success: true, iteration: data });
        break;
      }

      // ✅ Return all iterations (for Table Viewer)
      case "iterations-all": {
        const { data, error } = await supabase.from("iterations").select("*");
        if (error) throw error;
        res.status(200).json({ success: true, rows: data });
        break;
      }

      // ✅ Create a new iteration
      case "create-iteration": {
        if (req.method !== "POST") {
          return res.status(405).json({ success: false, message: "Method not allowed" });
        }
        const { data, error } = await supabase
          .from("iterations")
          .insert([{ start_date: new Date().toISOString() }])
          .select()
          .single();
        if (error) throw error;
        res.status(200).json({ success: true, iteration: data });
        break;
      }

      // ✅ Close the current active iteration
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

      // 🧑 People registration
      case "people": {
        if (req.method !== "POST") {
          return res.status(405).json({ success: false, message: "Method not allowed" });
        }
        const { name } = req.body;
        if (!name) {
          return res.status(400).json({ success: false, message: "Name required" });
        }
        if (name.trim().toLowerCase() === "admin") {
          return res.status(400).json({ success: false, message: "The name 'Admin' is reserved." });
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

      // ✅ All-rows fetchers for Table Viewer
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

      default:
        res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

