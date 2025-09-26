// Triggering redeploy to refresh routing and env vars
// Triggering redeploy to refresh routing and env vars
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
// ✅ Log every incoming request
app.use((req, res, next) => {
  console.log(`✅ Received request: ${req.method} ${req.url}`);
  next();
});

// --- DATABASE CONNECTION ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// --- GOOGLE AI SETUP ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});

app.use(express.json({ limit: '10mb' }));


// --- ALL API ENDPOINTS ARE DEFINED FIRST ---
app.get('/all-tables-data', async (req, res) => {
    console.log('Entering /all-tables-data endpoint...'); // Added for debugging
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

// ########################################################
//import { createClient } from '@supabase/supabase-js';
//
//const supabase = createClient(
//  'https://dtfecbqteajwtcmqudpd.supabase.co',
//  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0ZmVjYnF0ZWFqd3RjbXF1ZHBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3Mjc0MzksImV4cCI6MjA3NDMwMzQzOX0.tY8R92LdJuGMDI3kVA2nN3ALugSRP3LJKCMBuVm7vRY'
//);
//
//app.get('/api/db-test', async (req, res) => {
//  console.log('Entering /api/db-test endpoint. Connect string is HARDCODED...'); // Added for debugging
//  const { data, error } = await supabase.from('people').select('*');
//  if (error) {
//    console.error('Supabase error:', error);
//    return res.status(500).json({ error: error.message });
//  }
//  res.json({ data });
//});
//
// ########################################################
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dtfecbqteajwtcmqudpd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0ZmVjYnF0ZWFqd3RjbXF1ZHBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3Mjc0MzksImV4cCI6MjA3NDMwMzQzOX0.tY8R92LdJuGMDI3kVA2nN3ALugSRP3LJKCMBuVm7vRY'
);

//app.get('/db-test', async (req, res) => {
//  const { data, error } = await supabase.from('people').select('*');
//  if (error) {
//    console.error('Supabase error:', error);
//    return res.status(500).json({ error: error.message });
//  }
//  res.json({ data });
//});

app.get('/db-test', async (req, res) => {
  console.log('✅ /db-test route is executing');
  res.json({ message: 'Hello from Vercel!' });
});
// --- MODULE EXPORT FOR VERCEL ---
// Problem with environment variables un Vercel
// module.exports = app;
const serverless = require('serverless-http');
module.exports = serverless(app);
