const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json());
// Middleware to serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Specific API routes must be defined BEFORE the catch-all route.

// API endpoint to serve the voxel CSV data
app.get('/api/voxel-data', async (req, res) => {
    try {
        const filePath = path.join(__dirname, 'data', 'voxel_data.csv');
        // Ensure the file exists before sending
        await fs.access(filePath);
        res.sendFile(filePath);
    } catch (error) {
        console.error('Error serving voxel data:', error);
        res.status(404).send('Voxel data file not found.');
    }
});

// API endpoint to serve the questions JSON data
app.get('/api/questions', async (req, res) => {
    try {
        const filePath = path.join(__dirname, 'data', 'questions.json');
        // Ensure the file exists before sending
        await fs.access(filePath);
        res.sendFile(filePath);
    } catch (error) {
        console.error('Error serving questions data:', error);
        res.status(404).send('Questions data file not found.');
    }
});

// *** NEW ROBUST CATCH-ALL ROUTE ***
// This route uses a regular expression to match all GET requests
// that do NOT start with /api. This avoids the wildcard parsing issue.
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Express server listening at http://localhost:${port}`);
});


