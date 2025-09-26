// Forcing a new deployment to read the latest environment variables
const express = require('express');
const path = require('path');
// ... rest of the file is the same
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- START DEBUG LOGGING ---
console.log('--- VERCEL ENVIRONMENT DEBUG ---');
console.log('Is DATABASE_URL set:', !!process.env.DATABASE_URL);
if (process.env.DATABASE_URL) {
    // Safely log the host without showing the password
    try {
        const dbUrl = new URL(process.env.DATABASE_URL);
        console.log('DATABASE_URL host:', dbUrl.hostname);
    } catch (e) {
        console.log('Could not parse DATABASE_URL');
    }
}
// --- END DEBUG LOGGING ---

const app = express();

// --- DATABASE CONNECTION ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// --- GOOGLE AI SETUP ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});

app.use(express.json({ limit: '10mb' }));


// --- ALL API ENDPOINTS ARE DEFINED FIRST ---
app.get('/api/all-tables-data', async (req, res) => {
    console.log('Entering /api/all-tables-data endpoint...'); // Added for debugging
    try {
        const queries = {
            iterations: pool.query('SELECT * FROM iterations ORDER BY id'),
            organization_units: pool.query('SELECT * FROM organization_units ORDER BY id'),
            people: pool.query('SELECT * FROM people ORDER BY id'),
            person_roles: pool.query('SELECT * FROM person_roles ORDER BY id'),
            surveys: pool.query('SELECT * FROM surveys ORDER BY id'),
            app_data: pool.query('SELECT * FROM app_data ORDER BY key')
        };

        const results = await Promise.all(Object.values(queries));
        const [iterationsResult, orgUnitsResult, peopleResult, rolesResult, surveysResult, appDataResult] = results;

        res.json({
            iterations: iterationsResult.rows,
            organization_units: orgUnitsResult.rows,
            people: peopleResult.rows,
            person_roles: rolesResult.rows,
            surveys: surveysResult.rows,
            app_data: appDataResult.rows
        });

    } catch (error) {
        console.error('Error fetching all table data:', error);
        res.status(500).json({ message: 'Error fetching all table data.' });
    }
});

// ... the rest of your API endpoints remain the same ...
// (The full file content is omitted here for brevity)

// const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.dtfecbqteajwtcmqudpd:Vener99.Vener99@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require'
});

app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT 1');
    res.json({ success: true, result: result.rows });
  } catch (err) {
    console.error('DB test failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- MODULE EXPORT FOR VERCEL ---
// Problem with environment variables un Vercel
// module.exports = app;
const serverless = require('serverless-http');
module.exports = serverless(app);
