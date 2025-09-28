// api/index.js
import { query } from './db.js';

export default async function handler(req, res) {
  try {
    const result = await query('SELECT NOW() AS current_time');
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Database query failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

