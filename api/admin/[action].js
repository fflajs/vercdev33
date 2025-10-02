// api/admin/[action].js
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const { action } = req.query;
  const log = (msg, data = null) => {
    console.log(`[${new Date().toISOString()}] ${msg}`, data || '');
  };

  try {
    log(`➡️ Admin API called: action=${action}, method=${req.method}`);

    // ---------------- ITERATIONS ----------------
    if (action === 'active-iteration' && req.method === 'GET') {
      const result = await pool.query(
        `SELECT * FROM iterations WHERE end_date IS NULL ORDER BY id DESC LIMIT 1`
      );
      if (result.rows.length) {
        return res.json({ success: true, iteration: result.rows[0] });
      }
      return res.json({ success: false, message: 'No active iteration found' });
    }

    if (action === 'create-iteration' && req.method === 'POST') {
      const { name, set } = req.body;
      const result = await pool.query(
        `INSERT INTO iterations (name, start_date, question_set)
         VALUES ($1, NOW(), $2) RETURNING *`,
        [name, set]
      );
      return res.json({ success: true, iteration: result.rows[0] });
    }

    if (action === 'close-iteration' && req.method === 'POST') {
      const { id } = req.body;
      await pool.query(`UPDATE iterations SET end_date = NOW() WHERE id=$1`, [id]);
      return res.json({ success: true, message: 'Iteration closed' });
    }

    // ---------------- ORG MANAGER ----------------
    if (action === 'org-data' && req.method === 'GET') {
      const { iteration_id } = req.query;
      log('Fetching org-data', { iteration_id });

      const units = await pool.query(
        `SELECT * FROM organization_units WHERE iteration_id=$1 ORDER BY id`,
        [iteration_id]
      );
      const roles = await pool.query(
        `SELECT * FROM person_roles WHERE iteration_id=$1 ORDER BY id`,
        [iteration_id]
      );
      const people = await pool.query(`SELECT * FROM people ORDER BY id`);

      return res.json({
        success: true,
        units: units.rows,
        roles: roles.rows,
        people: people.rows
      });
    }

    if (action === 'create-org-unit' && req.method === 'POST') {
      const { name, parent_id, iteration_id } = req.body;
      log('Creating org unit', req.body);
      const result = await pool.query(
        `INSERT INTO organization_units (name, parent_id, iteration_id)
         VALUES ($1, $2, $3) RETURNING *`,
        [name, parent_id, iteration_id]
      );
      return res.json({ success: true, unit: result.rows[0] });
    }

    if (action === 'rename-org-unit' && req.method === 'POST') {
      const { unit_id, new_name } = req.body;
      log('Renaming org unit', req.body);
      await pool.query(
        `UPDATE organization_units SET name=$1 WHERE id=$2`,
        [new_name, unit_id]
      );
      return res.json({ success: true, message: 'Unit renamed' });
    }

    if (action === 'delete-org-unit' && req.method === 'POST') {
      const { unit_id } = req.body;
      log('Deleting org unit', req.body);
      await pool.query(`DELETE FROM organization_units WHERE id=$1`, [unit_id]);
      return res.json({ success: true, message: 'Unit deleted' });
    }

    if (action === 'assign-role' && req.method === 'POST') {
      const { org_unit_id, person_id, iteration_id, is_manager = false } = req.body;
      log('Assigning role', req.body);
      const result = await pool.query(
        `INSERT INTO person_roles (person_id, org_unit_id, iteration_id, is_manager)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [person_id, org_unit_id, iteration_id, is_manager]
      );
      return res.json({ success: true, role: result.rows[0] });
    }

    if (action === 'remove-role' && req.method === 'POST') {
      const { role_id } = req.body;
      log('Removing role', req.body);
      await pool.query(`DELETE FROM person_roles WHERE id=$1`, [role_id]);
      return res.json({ success: true, message: 'Role removed' });
    }

    // ---------------- TABLE VIEWER ----------------
    if (action === 'list-tables' && req.method === 'GET') {
      const tables = ['organization_units', 'iterations', 'people', 'person_roles', 'surveys'];
      return res.json({ success: true, tables });
    }

    if (action === 'table-data' && req.method === 'GET') {
      const { table } = req.query;
      try {
        const result = await pool.query(`SELECT * FROM ${table} ORDER BY id LIMIT 100`);
        return res.json({ success: true, rows: result.rows });
      } catch (error) {
        log('Error fetching table-data', error);
        return res.json({ success: false, message: 'Error fetching table data', error });
      }
    }

    // ---------------- SURVEY DATA ----------------
    if (action === 'save-survey' && req.method === 'POST') {
      const { person_role_id, iteration_id, data } = req.body;
      log('Saving survey', req.body);
      const result = await pool.query(
        `INSERT INTO surveys (person_role_id, iteration_id, data)
         VALUES ($1, $2, $3) RETURNING *`,
        [person_role_id, iteration_id, data]
      );
      return res.json({ success: true, survey: result.rows[0] });
    }

    if (action === 'list-surveys' && req.method === 'GET') {
      const result = await pool.query(`SELECT * FROM surveys ORDER BY id DESC LIMIT 50`);
      return res.json({ success: true, surveys: result.rows });
    }

    // ---------------- DEFAULT ----------------
    return res.status(400).json({ success: false, message: `Unknown action: ${action}` });

  } catch (error) {
    log('❌ API error', error);
    return res.status(500).json({ success: false, message: error.message, error });
  }
}

