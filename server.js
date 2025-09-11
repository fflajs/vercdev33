const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const port = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_OUT_DIR = path.join(__dirname, 'dataout');

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- HELPER FUNCTIONS ---
const getMode = (arr) => {
    if (arr.length === 0) return null;
    const counts = {};
    let maxCount = 0;
    let mode = null;
    for (const value of arr) {
        counts[value] = (counts[value] || 0) + 1;
        if (counts[value] > maxCount) {
            maxCount = counts[value];
            mode = value;
        }
    }
    return mode;
};

const getGaussianData = (mean, stdDev = 1) => {
    const gaussian = (x, m, s) => Math.exp(-0.5 * Math.pow((x - m) / s, 2)) / (s * Math.sqrt(2 * Math.PI));
    return Array.from({ length: 71 }, (_, i) => parseFloat(gaussian(1 + i * 0.1, mean, stdDev).toFixed(4)));
};


// --- API ROUTES ---

app.get('/api/voxel-data', async (req, res) => {
    try {
        const filePath = path.join(DATA_DIR, 'voxel_data.csv');
        const data = await fs.readFile(filePath, 'utf8');
        res.type('text/csv').send(data);
    } catch (error) {
        res.status(500).send('Error reading voxel data file.');
    }
});

app.get('/api/questions', async (req, res) => {
    try {
        const filePath = path.join(DATA_DIR, 'questions.json');
        const data = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).send('Error reading questions file.');
    }
});

app.get('/api/saved-files', async (req, res) => {
    try {
        const files = await fs.readdir(DATA_OUT_DIR);
        const jsonFiles = files
            .filter(file => file.endsWith('.json'))
            .sort((a, b) => {
                const timeA = a.split('_').pop().replace('.json', '');
                const timeB = b.split('_').pop().replace('.json', '');
                return timeB.localeCompare(timeA);
            });
        res.json(jsonFiles);
    } catch (error) {
        res.status(500).json({ message: 'Could not list saved files.' });
    }
});

app.get('/api/saved-files/:filename', async (req, res) => {
    try {
        const filePath = path.join(DATA_OUT_DIR, req.params.filename);
        const data = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(404).json({ message: 'File not found.' });
    }
});

app.post('/api/saved-files', async (req, res) => {
    try {
        const jsonData = req.body;
        const now = new Date();
        const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
        const filename = `cognitive_data_${timestamp}.json`;
        const filePath = path.join(DATA_OUT_DIR, filename);

        await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2));
        res.status(201).json({ success: true, filename });
    } catch (error) {
        res.status(500).json({ message: 'Error saving file.' });
    }
});

app.delete('/api/saved-files', async (req, res) => {
    try {
        const { filenames } = req.body;
        if (!filenames || !Array.isArray(filenames)) {
            return res.status(400).json({ message: 'Invalid request body.' });
        }
        for (const filename of filenames) {
            await fs.unlink(path.join(DATA_OUT_DIR, filename));
        }
        res.json({ success: true, message: `${filenames.length} file(s) deleted.` });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting files.' });
    }
});

app.post('/api/calculate', async (req, res) => {
    try {
        const { filenames } = req.body;
        if (!filenames || !Array.isArray(filenames) || filenames.length === 0) {
            return res.status(400).json({ message: 'Invalid request body.' });
        }

        let totalFiles = 0;
        const surveySums = Array(120).fill(0);
        const meanSums = { x: 0, y: 0, z: 0 };
        const sourceFileData = [];

        for (const filename of filenames) {
            const filePath = path.join(DATA_OUT_DIR, filename);
            const content = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(content);
            sourceFileData.push({ filename, data }); 

            if (data.survey_results && data.survey_results.length === 120) {
                totalFiles++;
                for (let i = 0; i < 120; i++) {
                    surveySums[i] += data.survey_results[i];
                }
                meanSums.x += data.analysis.voxel.mean.x;
                meanSums.y += data.analysis.voxel.mean.y;
                meanSums.z += data.analysis.voxel.mean.z;
            }
        }

        if (totalFiles === 0) {
            return res.status(400).json({ message: 'No valid files found for calculation.' });
        }

        const avgSurveyResults = surveySums.map(sum => Math.ceil(sum / totalFiles));
        const avgMean = {
            x: parseFloat((meanSums.x / totalFiles).toFixed(2)),
            y: parseFloat((meanSums.y / totalFiles).toFixed(2)),
            z: parseFloat((meanSums.z / totalFiles).toFixed(2))
        };
        
        const avgMode = {
            x: getMode(avgSurveyResults.slice(0, 40)),
            y: getMode(avgSurveyResults.slice(40, 80)),
            z: getMode(avgSurveyResults.slice(80, 120))
        };
        const avgRoundedMean = {
            x: Math.round(avgMean.x),
            y: Math.round(avgMean.y),
            z: Math.round(avgMean.z)
        };

        const resultData = {
            timestamp: new Date().toISOString(),
            source_files: filenames,
            survey_results: avgSurveyResults,
            analysis: {
                voxel: { 
                    mean: avgMean,
                    mode: avgMode,
                    roundedMean: avgRoundedMean
                },
                graphs: {
                    knowledge_density: { mean: avgMean.x, distribution_data: getGaussianData(avgMean.x) },
                    familiarity: { mean: avgMean.y, distribution_data: getGaussianData(avgMean.y) },
                    cognitive_load: { mean: avgMean.z, distribution_data: getGaussianData(avgMean.z) }
                }
            }
        };

        const now = new Date();
        const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
        const newFilename = `calc_${timestamp}.json`;
        const newFilePath = path.join(DATA_OUT_DIR, newFilename);

        await fs.writeFile(newFilePath, JSON.stringify(resultData, null, 2));
        
        res.json({
            success: true,
            calculationResult: { filename: newFilename, data: resultData },
            sourceFiles: sourceFileData
        });

    } catch (error) {
        console.error('Calculation error:', error);
        res.status(500).json({ message: 'Error performing calculation.' });
    }
});


// --- CATCH-ALL ROUTE FOR THE FRONT-END ---
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});


