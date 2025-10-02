// api/admin/[action].js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { query, method, body } = req;
  const { action } = query;

  console.log(`[${new Date().toISOString()}] ➡️ Admin API called: action=${action}, method=${method}`);

  try {
    switch (action) {
      /**
       * ------------------------------------------------
       * ACTIVE ITERATION
       * ------------------------------------------------
       */
      case 'active-iteration':
        if (method === 'GET') {
          console.log(`[active-iteration] Fetching active iteration...`);
          const { data, error } = await supabase
            .from('iterations')
            .select('*')
            .is('end_date', null)
            .single();

          if (error && error.code !== 'PGRST116') {
            console.error(`[active-iteration] Error:`, error);
            return res.status(500).json({ success: false, message: error.message });
          }

          if (!data) {
            console.log(`[active-iteration] No active iteration found.`);
            return res.status(404).json({ success: false, message: 'No active iteration found' });
          }

          console.log(`[active-iteration] Found iteration:`, data);
          return res.status(200).json({ success: true, iteration: data });
        }
        break;

      /**
       * ------------------------------------------------
       * USER CONTEXT (MOCKED)
       * ------------------------------------------------
       */
      case 'user-context':
        if (method === 'GET') {
          console.log(`[user-context] Returning mocked context for now.`);
          // ⚠️ Later this should come from login/session
          const mockContext = {
            userName: 'M0',
            role: 'Manager',
            orgUnitName: 'IT33',
          };
          return res.status(200).json({ success: true, context: mockContext });
        }
        break;

      /**
       * ------------------------------------------------
       * SURVEY
       * ------------------------------------------------
       */
      case 'survey':
        if (method === 'POST') {
          const { person_id, iteration_id, answers } = body;
          console.log(`[survey] Saving survey: person_id=${person_id}, iteration_id=${iteration_id}`);

          if (!person_id || !iteration_id || !answers) {
            return res.status(400).json({
              success: false,
              message: 'person_id, iteration_id and answers are required',
            });
          }

          const { data, error } = await supabase
            .from('survey')
            .insert([{ person_id, iteration_id, answers }])
            .select()
            .single();

          if (error) {
            console.error(`[survey] Insert error:`, error);
            return res.status(500).json({ success: false, message: error.message });
          }

          console.log(`[survey] Insert success:`, data);
          return res.status(201).json({ success: true, survey: data });
        }

        if (method === 'GET') {
          const { person_id, iteration_id } = query;
          console.log(`[survey] Fetching survey for person_id=${person_id}, iteration_id=${iteration_id}`);

          if (!person_id || !iteration_id) {
            return res.status(400).json({
              success: false,
              message: 'person_id and iteration_id are required',
            });
          }

          const { data, error } = await supabase
            .from('survey')
            .select('*')
            .eq('person_id', person_id)
            .eq('iteration_id', iteration_id)
            .maybeSingle();

          if (error && error.code !== 'PGRST116') {
            console.error(`[survey] Fetch error:`, error);
            return res.status(500).json({ success: false, message: error.message });
          }

          if (!data) {
            console.log(`[survey] No survey found for this person/iteration`);
            return res.status(404).json({ success: false, message: 'No survey found' });
          }

          console.log(`[survey] Found survey:`, data);
          return res.status(200).json({ success: true, survey: data });
        }
        break;

      /**
       * ------------------------------------------------
       * PEOPLE MANAGEMENT
       * ------------------------------------------------
       */
      case 'people':
        if (method === 'GET') {
          const { data, error } = await supabase.from('people').select('*');
          if (error) throw error;
          return res.status(200).json({ success: true, people: data });
        }

        if (method === 'POST') {
          const { name } = body;
          console.log(`[people] Creating person with name=${name}`);
          if (!name) {
            return res.status(400).json({
              success: false,
              message: 'Name is required',
            });
          }

          const { data, error } = await supabase
            .from('people')
            .insert([{ name }])
            .select()
            .single();

          if (error) {
            if (error.code === '23505') {
              return res.status(409).json({
                success: false,
                message: `Name "${name}" already exists.`,
              });
            }
            throw error;
          }

          return res.status(201).json({ success: true, person: data });
        }
        break;

      default:
        console.warn(`[${action}] Unknown action`);
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (error) {
    console.error(`[${action}] Admin API error:`, error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

