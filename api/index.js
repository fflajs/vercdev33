// api/index.js

require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
// REMOVED: const port = process.env.PORT || 3000;

// --- DATABASE CONNECTION (No changes needed) ---
const pool = new Pool({
    // IMPORTANT: Use Vercel's Environment Variables, not .env file in production
    // Supabase provides a single connection string which is easier
    connectionString: process.env.DATABASE_URL 
});

// --- GOOGLE AI SETUP (No changes needed) ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});

// Path to data directory needs to be relative to this file's new location
const dataDir = path.resolve(__dirname, '..', 'data');
app.use(express.json({ limit: '10mb' }));

// --- ALL API ENDPOINTS ARE DEFINED HERE ---
// (No changes needed for any of your app.get, app.post, etc. routes)
// ... all your API routes ...
// app.get('/api/all-tables-data', ...);
// app.post('/api/analyze-text', ...);
// etc.

// --- SERVE STATIC FILES (REMOVE THIS SECTION) ---
// REMOVED: app.use(express.static(path.join(__dirname)));
// Vercel handles serving the 'public' directory automatically.

// --- START THE SERVER (REMOVE THIS SECTION) ---
// REMOVED: app.listen(port, () => {
//     console.log(`Server running at http://localhost:${port}`);
// });

// --- ADD THIS LINE AT THE VERY END ---
// Export the Express app for Vercel to use
module.exports = app;
