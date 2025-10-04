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
      // ... [all your existing cases here unchanged] ...

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

