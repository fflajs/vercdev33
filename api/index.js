// Forcing a redeploy to use the latest environment variables
// Forcing a redeploy to use the latest environment variables
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');
import { createClient } from '@supabase/supabase-js';
const serverless = require('serverless-http');

// --- START DEBUG LOGGING ---
console.log('--- VERCEL ENVIRONMENT DEBUG ---');
console.log('Is DATABASE_URL set:', !!process.env.DATABASE_URL);
if (process.env.DATABASE_URL) {
  try {
    const dbUrl = new URL(process.env.DATABASE_URL);
    console.log('DATABASE_URL host:', dbUrl.hostname);
  } catch (e) {
    console.log('Could not parse DATABASE_URL');
  }
}
// --- END DEBUG LOGGING ---

const app = express();
const router = express.Router();

// ✅ Log every incoming request with full path
app.use((req, res, next) => {
  console.log(`✅ Received request: ${req.method} ${req.originalUrl}`);
  next();
});

app.use(express.json({ limit: '10mb' }));

// --- DATABASE CONNECTION ---
//const pool = new Pool({
  //connectionString: process.env.DATABASE_URL,
//});

// --- GOOGLE AI SETUP ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- SUPABASE CLIENT ---
//const supabase = createClient(
//  'https://dtfecbqteajwtcmqudpd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0ZmVjYnF0ZWFqd3RjbXF1ZHBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3Mjc0MzksImV4cCI6MjA3NDMwMzQzOX0.tY8R92LdJuGMDI3kVA2nN3ALugSRP3LJKCMBuVm7vRY'
// );

// --- ROUTES ---
router.get('/db-test', async (req, res) => {
  console.log('✅ /db-test route is executing');
  res.json({ message: 'Hello from Vercel!' });
});

//router.get('/all-tables-data', async (req, res) => {
//  console.log('Entering /all-tables-data endpoint...');
//  try {
//    const queries = {
//      iterations: pool.query('SELECT * FROM iterations ORDER BY id'),
//      organization_units: pool.query('SELECT * FROM organization_units ORDER BY id'),
//      people: pool.query('SELECT * FROM people ORDER BY id'),
//      person_roles: pool.query('SELECT * FROM person_roles ORDER BY id'),
//      surveys: pool.query('SELECT * FROM surveys ORDER BY id'),
//      app_data: pool.query('SELECT * FROM app_data ORDER BY key')
//    };
//
//    const results = await Promise.all(Object.values(queries));
//    const [iterationsResult, orgUnitsResult, peopleResult, rolesResult, surveysResult, appDataResult] = results;
//
//    res.json({
//      iterations: iterationsResult.rows,
//      organization_units: orgUnitsResult.rows,
//      people: peopleResult.rows,
//      person_roles: rolesResult.rows,
//      surveys: surveysResult.rows,
//      app_data: appDataResult.rows
//    });
//  } catch (error) {
//    console.error('Error fetching all table data:', error);
//    res.status(500).json({ message: 'Error fetching all table data.' });
//  }
//});

// ✅ Mount router at /api to match Vercel rewrite
app.use('/api', router);

// --- MODULE EXPORT FOR VERCEL ---
module.exports = serverless(app);

