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
      // ✅ ACTIVE ITERATION (end_date IS NULL)
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

      // ✅ CREATE NEW ITERATION
      case "create-iteration": {
        if (req.method !== "POST") {
          return res.status(405).json({ success: false, message: "Method not allowed" });
        }

        const { name, question_set } = req.body;
        if (!name || !question_set) {
          return res.status(400).json({
            success: false,
            message: "Name and question_set are required.",
          });
        }

        // check if another active iteration exists
        const { data: active, error: activeError } = await supabase
          .from("iterations")
          .select("*")
          .is("end_date", null)
          .maybeSingle();
        if (activeError) throw activeError;
        if (active) {
          return res.status(400).json({
            success: false,
            message: "An active iteration already exists.",
          });
        }

        const { data, error } = await supabase
          .from("iterations")
          .insert([{ name, question_set, start_date: new Date().toISOString() }])
          .select()
          .single();
        if (error) throw error;
        res.status(200).json({ success: true, iteration: data });
        break;
      }

      // ✅ CLOSE ACTIVE ITERATION
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

      // ✅ ALL TABLE FETCHERS (for Table Viewer)
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
      case "iterations-all": {
        const { data, error } = await supabase.from("iterations").select("*");
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

