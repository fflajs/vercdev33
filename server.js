const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const port = 3000;

const dataOutDir = path.join(__dirname, 'dataout');
const dataDir = path.join(__dirname, 'data');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API ROUTES ---

app.get('/api/voxel-data', async (req, res) => {
    try {
        const filePath = path.join(dataDir, 'voxel_data.csv');
        await fs.access(filePath);
        res.sendFile(filePath);
    } catch (error) {
        res.status(404).send('Voxel data file not found.');
    }
});

app.get('/api/questions', async (req, res) => {
    try {
        const filePath = path.join(dataDir, 'questions.json');
        await fs.access(filePath);
        res.sendFile(filePath);
    } catch (error) {
        res.status(404).send('Questions data file not found.');
    }
});

app.get('/api/saved-files', async (req, res) => {
    try {
        await fs.mkdir(dataOutDir, { recursive: true });
        const files = await fs.readdir(dataOutDir);
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        res.json(jsonFiles);
    } catch (error) {
        console.error('Error listing saved files:', error);
        res.status(500).send('Error listing files.');
    }
});

app.get('/api/saved-files/:filename', async (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(dataOutDir, filename);

    try {
        await fs.access(filePath);
        res.sendFile(filePath);
    } catch (error) {
        res.status(404).send('File not found.');
    }
});

app.post('/api/saved-files', async (req, res) => {
    try {
        const jsonData = req.body;
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

// NEW: API endpoint to delete selected files
app.delete('/api/saved-files', async (req, res) => {
    const { filenames } = req.body;
    if (!filenames || !Array.isArray(filenames)) {
        return res.status(400).send('Invalid request body.');
    }

    try {
        const deletePromises = filenames.map(filename => {
            const safeFilename = path.basename(filename);
            const filePath = path.join(dataOutDir, safeFilename);
            return fs.unlink(filePath);
        });
        await Promise.all(deletePromises);
        res.json({ success: true, message: `${filenames.length} files deleted.` });
    } catch (error) {
        console.error('Error deleting files:', error);
        res.status(500).send('Error deleting files.');
    }
});

// NEW: API endpoint to calculate the average of selected files
app.post('/api/calculate', async (req, res) => {
    const { filenames } = req.body;
    if (!filenames || !Array.isArray(filenames) || filenames.length === 0) {
        return res.status(400).send('No files selected for calculation.');
    }

    try {
        const sumOfResults = Array(120).fill(0);
        let fileCount = 0;

        for (const filename of filenames) {
            const safeFilename = path.basename(filename);
            const filePath = path.join(dataOutDir, safeFilename);
            try {
                const content = await fs.readFile(filePath, 'utf8');
                const data = JSON.parse(content);
                if (data.survey_results && data.survey_results.length === 120) {
                    data.survey_results.forEach((val, index) => {
                        sumOfResults[index] += val;
                    });
                    fileCount++;
                }
            } catch (readError) {
                console.error(`Could not read or parse ${safeFilename}:`, readError);
            }
        }
        
        if (fileCount === 0) {
            return res.status(400).send('None of the selected files could be processed.');
        }

        const averageResults = sumOfResults.map(sum => Math.ceil(sum / fileCount));

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
        console.error('Error calculating averages:', error);
        res.status(500).send('Error calculating averages.');
    }
});


// --- FRONT-END ROUTE ---
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Express server listening at http://localhost:${port}`);
});


