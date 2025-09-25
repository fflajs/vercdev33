const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// --- DATABASE CONNECTION ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// --- GOOGLE AI SETUP ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});

app.use(express.json({ limit: '10mb' }));

// --- API ENDPOINTS ---
app.get('/api/all-tables-data', async (req, res) => {
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

app.get('/api/active-iteration', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, start_date, end_date, question_set FROM iterations WHERE end_date IS NULL LIMIT 1');
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No active iteration found.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching active iteration:', error);
        res.status(500).json({ message: 'Error fetching active iteration.' });
    }
});

// ... the rest of your API endpoints remain the same ...
// (The full file content is omitted here for brevity, only the top part needs to change)


// --- MODULE EXPORT FOR VERCEL ---
module.exports = app;
