// api/admin/org/snapshot.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // 1) Active iteration
    const { data: activeArr, error: activeErr } = await supabase
      .from('iterations')
      .select('*')
      .is('end_date', null)
      .order('start_date', { ascending: false })
      .limit(1);

    if (activeErr) throw activeErr;
    if (!activeArr || activeArr.length === 0) {
      return res.status(404).json({ success: false, message: 'No active iteration found' });
    }
    const iteration = activeArr[0];

    // 2) Fetch org units / roles for this iteration + all people
    const [unitsRes, rolesRes, peopleRes] = await Promise.all([
      supabase
        .from('organization_units')
        .select('*')
        .eq('iteration_id', iteration.id)
        .order('parent_id', { ascending: true }),
      supabase
        .from('person_roles')
        .select('*')
        .eq('iteration_id', iteration.id)
        .order('id', { ascending: true }),
      supabase
        .from('people')
        .select('id,name,created_at')
        .order('name', { ascending: true })
    ]);

    if (unitsRes.error) throw unitsRes.error;
    if (rolesRes.error) throw rolesRes.error;
    if (peopleRes.error) throw peopleRes.error;

    return res.status(200).json({
      success: true,
      iteration,
      units: unitsRes.data || [],
      roles: rolesRes.data || [],
      people: peopleRes.data || []
    });
  } catch (err) {
    console.error('Supabase error (org/snapshot):', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

