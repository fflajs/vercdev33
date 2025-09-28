// api/db.js
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // accept self-signed certs (needed for Supabase + Vercel)
  },
});

export default pool;

