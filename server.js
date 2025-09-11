const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const port = 3000;

const dataOutDir = path.join(__dirname, 'dataout');
const dataDir = path.join(__dirname, 'data');

// Middleware to parse JSON bodies
app.use(express.json());
// Middleware to serve static files (like CSS or client-side JS, if any)
app.use(express.static(path.join(__dirname, 'public')));


// --- API ROUTES ---

// API to serve the initial static data (voxel data and questions)
app.get('/api/voxel-data', async (req, res) => {
    const filePath = path.join(dataDir, 'voxel_data.csv');
    try {
        await fs.access(filePath); // Check if file exists
        res.sendFile(filePath);
    } catch (error) {
        res.status(404).send('Voxel data file not found.');
    }
});

app.get('/api/questions', async (req, res) => {
    const filePath = path.join(dataDir, 'questions.json');
    try {
        await fs.access(filePath);
        res.sendFile(filePath);
    } catch (error) {
        res.status(404).send('Questions data file not found.');
    }
});

// API to list all saved JSON files in the dataout directory
app.get('/api/saved-files', async (req, res) => {
    try {
        // Ensure the dataout directory exists
        await fs.mkdir(dataOutDir, { recursive: true });
        const files = await fs.readdir(dataOutDir);
        // Filter for .json files just in case
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        res.json(jsonFiles);
    } catch (error) {
        console.error('Error listing saved files:', error);
        res.status(500).send('Error listing files.');
    }
});

// API to get the content of a specific saved file
app.get('/api/saved-files/:filename', async (req, res) => {
    const { filename } = req.params;
    // Basic security: prevent directory traversal attacks
    const safeFilename = path.basename(filename);
    const filePath = path.join(dataOutDir, safeFilename);

    try {
        const data = await fs.readFile(filePath, 'utf8');
        res.setHeader('Content-Type', 'application/json');
        res.send(data);
    } catch (error) {
        console.error(`Error reading file ${safeFilename}:`, error);
        res.status(404).send('File not found.');
    }
});

// API to save the current survey data
app.post('/api/saved-files', async (req, res) => {
    try {
        const jsonData = req.body;
        // Generate a unique filename with a timestamp
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const filename = `cognitive_data_${timestamp}.json`;
        const filePath = path.join(dataOutDir, filename);

        await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2));
        res.json({ success: true, filename: filename });
    } catch (error) {
        console.error('Error saving file:', error);
        res.status(500).send('Error saving file.');
    }
});

// API to delete multiple selected files
app.delete('/api/saved-files', async (req, res) => {
    const { filenames } = req.body;
    if (!filenames || !Array.isArray(filenames)) {
        return res.status(400).send('Invalid request body. Expecting an array of filenames.');
    }

    try {
        const deletePromises = filenames.map(filename => {
            const safeFilename = path.basename(filename);
            const filePath = path.join(dataOutDir, safeFilename);
            return fs.unlink(filePath);
        });
        await Promise.all(deletePromises);
        res.json({ success: true, message: `${filenames.length} files deleted successfully.` });
    } catch (error) {
        console.error('Error deleting files:', error);
        res.status(500).send('Error deleting files.');
    }
});


// API to calculate the average of selected files
app.post('/api/calculate', async (req, res) => {
    const { filenames } = req.body;
    if (!filenames || !Array.isArray(filenames) || filenames.length === 0) {
        return res.status(400).send('No files selected for calculation.');
    }

    try {
        const sumOfResults = Array(120).fill(0);
        let validFileCount = 0;

        for (const filename of filenames) {
            const safeFilename = path.basename(filename);
            const filePath = path.join(dataOutDir, safeFilename);
            try {
                const content = await fs.readFile(filePath, 'utf8');
                const data = JSON.parse(content);
                if (data.survey_results && data.survey_results.length === 120) {
                    data.survey_results.forEach((value, index) => {
                        sumOfResults[index] += value;
                    });
                    validFileCount++;
                }
            } catch (readError) {
                console.error(`Could not read or parse file ${safeFilename} during calculation:`, readError);
            }
        }

        if (validFileCount === 0) {
            return res.status(400).send('None of the selected files could be processed.');
        }

        // Calculate the average for each survey result, rounding up
        const averageResults = sumOfResults.map(sum => Math.ceil(sum / validFileCount));

        // Create the new JSON object for the calculation result
        const newJsonData = {
            timestamp: new Date().toISOString(),
            calculation_source_files: filenames,
            survey_results: averageResults
        };

        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const newFilename = `calc-${timestamp}.json`;
        const newFilePath = path.join(dataOutDir, newFilename);

        await fs.writeFile(newFilePath, JSON.stringify(newJsonData, null, 2));

        res.json({ success: true, filename: newFilename });
    } catch (error) {
        console.error('Error during calculation:', error);
        res.status(500).send('Error performing calculation.');
    }
});


// --- FRONT-END ROUTE (Catch-all) ---
// This must be the LAST route defined
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


app.listen(port, () => {
  console.log(`Express server listening at http://localhost:${port}`);
});


