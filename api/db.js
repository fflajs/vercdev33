// api/db.js
import pkg from 'pg';
const { Client } = pkg;

export async function query(sql, params = []) {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    const result = await client.query(sql, params);
    return result;
  } finally {
    await client.end(); // close after each call
  }
}

