const express = require('express');
const path = require('path');
const fs = require('fs').promises; // Use the promises version of fs

const app = express();
const port = 3000;

// Define path for the new data directory
const dataDirectory = path.join(__dirname, 'data');

// Middleware to serve static files (like CSS or JS if you add them later)
app.use(express.static(path.join(__dirname, 'public')));

// --- DATA API ROUTES ---

// API Route to serve the voxel CSV data
app.get('/api/voxel-data', async (req, res) => {
  try {
    const filePath = path.join(dataDirectory, 'voxel_data.csv');
    const data = await fs.readFile(filePath, 'utf8');
    res.type('text/csv').send(data);
  } catch (error) {
    console.error('Error reading voxel data file:', error);
    res.status(500).send('Could not load voxel data.');
  }
});

// API Route to serve the questions JSON data
app.get('/api/questions', async (req, res) => {
  try {
    const filePath = path.join(dataDirectory, 'questions.json');
    const data = await fs.readFile(filePath, 'utf8');
    res.type('application/json').send(data);
  } catch (error) {
    console.error('Error reading questions data file:', error);
    res.status(500).send('Could not load questions data.');
  }
});


// --- PAGE ROUTE ---

// Serves your main application page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Express server listening at http://localhost:${port}`);
  console.log(`Serving the Cognitive Space Visualizer.`);
});


