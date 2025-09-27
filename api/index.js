// api/index.js
// ff
import pool from './db.js';

export default async function handler(req, res) {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT NOW() AS current_time');
      res.status(200).json({ success: true, data: result.rows[0] });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Database query failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

