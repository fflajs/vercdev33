// api/db.js
import pkg from 'pg';
const { Client } = pkg;

let client;

async function getClient() {
  if (!client) {
    client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: {
        require: true,
        rejectUnauthorized: false, // Supabase cert workaround
      },
    });
    await client.connect();
  }
  return client;
}

export default getClient;

