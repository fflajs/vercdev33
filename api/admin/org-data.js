// api/admin/org-data.js
import { supabase } from '../dbClient.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { iteration_id } = req.query;

      if (!iteration_id) {
        return res.status(400).json({ success: false, message: 'iteration_id is required' });
      }

      // Fetch organization units
      const { data: units, error: unitError } = await supabase
        .from('organization_units')
        .select('*')
        .eq('iteration_id', iteration_id);

      if (unitError) throw unitError;

      // Fetch roles
      const { data: roles, error: roleError } = await supabase
        .from('person_roles')
        .select('*')
        .eq('iteration_id', iteration_id);

      if (roleError) throw roleError;

      // Fetch people
      const { data: people, error: peopleError } = await supabase
        .from('people')
        .select('*');

      if (peopleError) throw peopleError;

      return res.status(200).json({
        success: true,
        units,
        roles,
        people,
      });
    } catch (err) {
      console.error('Error loading org data:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  res.setHeader('Allow', ['GET']);
  return res.status(405).json({ success: false, message: `Method ${req.method} Not Allowed` });
}

