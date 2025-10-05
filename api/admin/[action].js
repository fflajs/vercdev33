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
      // ==========================================================
      // 🧭 ITERATION MANAGEMENT
      // ==========================================================

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

      case "create-iteration": {
        if (req.method !== "POST") {
          return res.status(405).json({ success: false, message: "Method not allowed" });
        }

        const { name, question_set } = req.body;
        if (!name || !question_set) {
          return res.status(400).json({ success: false, message: "Name and question_set are required." });
        }

        const { data: active, error: activeErr } = await supabase
          .from("iterations")
          .select("*")
          .is("end_date", null)
          .maybeSingle();
        if (activeErr) throw activeErr;
        if (active) {
          return res.status(400).json({ success: false, message: "An active iteration already exists." });
        }

        const { data: newIter, error: createErr } = await supabase
          .from("iterations")
          .insert([{ name, question_set, start_date: new Date().toISOString() }])
          .select()
          .single();
        if (createErr) throw createErr;

        const newIterId = newIter.id;

        const { data: prevIter, error: prevErr } = await supabase
          .from("iterations")
          .select("*")
          .not("end_date", "is", null)
          .order("end_date", { ascending: false })
          .limit(1)
          .single();
        if (prevErr && prevErr.code !== "PGRST116") throw prevErr;

        if (prevIter) {
          const { data: oldUnits } = await supabase
            .from("organization_units")
            .select("*")
            .eq("iteration_id", prevIter.id);

          const idMap = new Map();
          for (const u of oldUnits) {
            const { data: ins } = await supabase
              .from("organization_units")
              .insert([{ name: u.name, parent_id: null, iteration_id: newIterId }])
              .select()
              .single();
            idMap.set(u.id, ins.id);
          }

          for (const u of oldUnits) {
            if (u.parent_id) {
              const newParent = idMap.get(u.parent_id);
              const newId = idMap.get(u.id);
              if (newParent && newId) {
                await supabase.from("organization_units").update({ parent_id: newParent }).eq("id", newId);
              }
            }
          }

          const { data: oldRoles } = await supabase
            .from("person_roles")
            .select("*")
            .eq("iteration_id", prevIter.id);
          for (const r of oldRoles) {
            const newOrgId = idMap.get(r.org_unit_id);
            if (!newOrgId) continue;
            await supabase
              .from("person_roles")
              .insert([{ person_id: r.person_id, org_unit_id: newOrgId, is_manager: r.is_manager, iteration_id: newIterId }]);
          }
        }

        res.status(200).json({ success: true, iteration: newIter });
        break;
      }

      case "close-iteration": {
        if (req.method !== "POST") {
          return res.status(405).json({ success: false, message: "Method not allowed" });
        }
        const { error } = await supabase
          .from("iterations")
          .update({ end_date:_

