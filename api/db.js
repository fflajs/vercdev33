// api/db.js
import pkg from 'pg';
const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL;

// force SSL ignore for self-signed certs
const pool = new Pool({
  connectionString,
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
});

export default pool;

