const express = require('express');
const app = express();

// --- START DEBUG LOGGING ---
console.log('--- VERCEL ENVIRONMENT DEBUG ---');
console.log('Is DATABASE_URL set:', !!process.env.DATABASE_URL);

if (process.env.DATABASE_URL) {
// Define a simple route
app.get('/', (req, res) => {
  res.send('Hello, Vercel!');
});

// Export the app as a serverless function
module.exports = app;

