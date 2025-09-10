const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const port = 3000;

// Define the directory for saved data
const dataOutDir = path.join(__dirname, 'dataout');

// Middleware to parse JSON bodies from requests
app.use(express.json());
// Middleware to serve static files (like CSS or client-side JS)
app.use(express.static(path.join(__dirname, 'public')));

// --- API ROUTES ---

// API endpoint to serve the voxel CSV data (from the 'data' directory)
app.get('/api/voxel-data', async (req, res) => {
    try {
        const filePath = path.join(__dirname, 'data', 'voxel_data.csv');
        await fs.access(filePath);
        res.sendFile(filePath);
    } catch (error) {
        res.status(404).send('Voxel data file not found.');
    }
});

// API endpoint to serve the questions JSON data (from the 'data' directory)
app.get('/api/questions', async (req, res) => {
    try {
        const filePath = path.join(__dirname, 'data', 'questions.json');
        await fs.access(filePath);
        res.sendFile(filePath);
    } catch (error) {
        res.status(404).send('Questions data file not found.');
    }
});

// NEW: API endpoint to list saved JSON files from the 'dataout' directory
app.get('/api/saved-files', async (req, res) => {
    try {
        // Ensure the dataout directory exists
        await fs.mkdir(dataOutDir, { recursive: true });
        const files = await fs.readdir(dataOutDir);
        // Filter for .json files and send the list
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        res.json(jsonFiles);
    } catch (error) {
        console.error('Error listing saved files:', error);
        res.status(500).send('Error listing files.');
    }
});

// NEW: API endpoint to get the content of a specific saved file
app.get('/api/saved-files/:filename', async (req, res) => {
    // Basic security: only allow valid filenames, prevent directory traversal
    const filename = path.basename(req.params.filename);
    const filePath = path.join(dataOutDir, filename);

    try {
        await fs.access(filePath);
        res.sendFile(filePath);
    } catch (error) {
        res.status(404).send('File not found.');
    }
});

// NEW: API endpoint to save new data to a file
app.post('/api/saved-files', async (req, res) => {
    try {
        const jsonData = req.body;
        // Create a unique, timestamped filename
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const filename = `cognitive_data_${timestamp}.json`;
        const filePath = path.join(dataOutDir, filename);

        // Write the received JSON data to the file
        await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2));

        res.json({ success: true, filename: filename });
    } catch (error) {
        console.error('Error saving file:', error);
        res.status(500).send('Error saving file.');
    }
});


// --- FRONT-END ROUTE ---
// This robust catch-all route serves the main HTML page for any
// request that is not an API call. It must be defined last.
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Express server listening at http://localhost:${port}`);
});
