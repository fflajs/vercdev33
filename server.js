const express = require('express');
const path = require('path');
const { Pool } = require('pg'); // Import the PostgreSQL driver

const app = express();
const port = 3000;

// --- DATABASE CONNECTION ---
// Create a new pool of connections to your database.
// IMPORTANT: Replace 'your_gauss_password' with the actual password for the 'gauss' user.
const pool = new Pool({
    user: 'gauss',
    host: 'localhost',
    database: 'gaussdb',
    password: 'fla.99.fla.99', // <-- IMPORTANT: CHANGE THIS
    port: 5432,
});

// --- NEW: Test the database connection on startup ---
pool.connect((err, client, release) => {
    if (err) {
        console.error('DATABASE CONNECTION FAILED:', err.stack);
        console.error("Please check your database connection settings in server.js, especially the password.");
        return;
    }
    client.query('SELECT NOW()', (err, result) => {
        release(); // release the client back to the pool
        if (err) {
            return console.error('Error executing connection test query:', err.stack);
        }
        console.log('Database connection successful. Current time from DB:', result.rows[0].now);
    });
});


// Directories for static data (CSV, questions)
const dataDir = path.join(__dirname, 'data');

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// --- API ROUTES (REWRITTEN FOR DATABASE) ---

// Endpoint to get the list of saved survey filenames
app.get('/api/saved-files', async (req, res) => {
    try {
        const result = await pool.query('SELECT filename FROM surveys ORDER BY filename ASC');
        // The front-end expects a simple array of strings
        const filenames = result.rows.map(row => row.filename);
        res.json(filenames);
    } catch (error) {
        console.error('Error fetching file list from database:', error);
        res.status(500).json({ message: 'Error fetching file list.' });
    }
});

// Endpoint to get a specific saved survey by filename
app.get('/api/saved-files/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const result = await pool.query(
            'SELECT survey_results, analysis_voxel, analysis_graphs FROM surveys WHERE filename = $1',
            [filename]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'File not found.' });
        }
        
        // Reconstruct the JSON object to match the structure the front-end expects
        const dbRow = result.rows[0];
        const surveyData = {
            survey_results: dbRow.survey_results,
            analysis: {
                voxel: dbRow.analysis_voxel,
                graphs: dbRow.analysis_graphs
            }
        };
        res.json(surveyData);

    } catch (error) {
        console.error(`Error reading file ${req.params.filename} from database:`, error);
        res.status(404).json({ message: 'File not found.' });
    }
});

// Endpoint to save a new survey
app.post('/api/saved-files', async (req, res) => {
    try {
        const now = new Date();
        const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
        const filename = `cognitive_data_${timestamp}.json`;
        
        const { survey_results, analysis } = req.body;

        const query = `
            INSERT INTO surveys(filename, survey_type, survey_results, analysis_voxel, analysis_graphs)
            VALUES($1, $2, $3, $4, $5)
        `;
        // FIX: Explicitly stringify the JSON objects before sending to the database
        const values = [
            filename, 
            'individual', 
            JSON.stringify(survey_results), 
            JSON.stringify(analysis.voxel), 
            JSON.stringify(analysis.graphs)
        ];
        
        await pool.query(query, values);
        res.status(201).json({ message: 'Survey saved successfully to database', filename });
    } catch (error) {
        console.error('Error saving survey to database:', error);
        res.status(500).json({ message: 'Error saving survey.' });
    }
});

// Endpoint to delete multiple surveys
app.delete('/api/saved-files', async (req, res) => {
    try {
        const { filenames } = req.body;
        if (!Array.isArray(filenames)) {
            return res.status(400).json({ message: 'Invalid request format.' });
        }
        // Use ANY($1) to efficiently delete multiple rows from an array of filenames
        await pool.query('DELETE FROM surveys WHERE filename = ANY($1::varchar[])', [filenames]);
        res.json({ message: 'Files deleted successfully from database.' });
    } catch (error) {
        console.error('Error deleting files from database:', error);
        res.status(500).json({ message: 'Error deleting files.' });
    }
});

// Endpoint to calculate the average of selected surveys
app.post('/api/calculate', async (req, res) => {
    try {
        const { filenames } = req.body;
        if (!Array.isArray(filenames) || filenames.length === 0) {
            return res.status(400).json({ message: 'No files selected.' });
        }

        // Fetch all selected surveys from the database
        const sourceSurveysResult = await pool.query(
            'SELECT filename, survey_results, analysis_voxel, analysis_graphs FROM surveys WHERE filename = ANY($1::varchar[])',
            [filenames]
        );
        
        const sourceFilesData = sourceSurveysResult.rows.map(row => ({
             filename: row.filename,
             data: {
                 survey_results: row.survey_results,
                 analysis: {
                     voxel: row.analysis_voxel,
                     graphs: row.analysis_graphs
                 }
             }
        }));

        const allSurveyResults = sourceFilesData.map(file => file.data.survey_results);

        // --- Perform the same calculation logic as before ---
        const numFiles = allSurveyResults.length;
        const averagedSurveyResults = Array(120).fill(0);
        for (const resultSet of allSurveyResults) {
            for (let i = 0; i < 120; i++) {
                averagedSurveyResults[i] += resultSet[i] / numFiles;
            }
        }
        const getMode = (arr) => {
             if (!arr || arr.length === 0) return null;
             const counts = {}; let maxCount = 0, mode = null;
             for (const value of arr) { counts[value] = (counts[value] || 0) + 1; if (counts[value] > maxCount) { maxCount = counts[value]; mode = value; } }
             return mode;
        };
        const getGaussianData = (mean, stdDev = 1) => {
            const gaussian = (x, m, s) => Math.exp(-0.5 * Math.pow((x - m) / s, 2)) / (s * Math.sqrt(2 * Math.PI));
            return Array.from({length: 71}, (_, i) => parseFloat(gaussian(1 + i * 0.1, mean, stdDev).toFixed(4)));
        };
        const knowledgeAvg = averagedSurveyResults.slice(0, 40).reduce((a, b) => a + b, 0) / 40;
        const familiarityAvg = averagedSurveyResults.slice(40, 80).reduce((a, b) => a + b, 0) / 40;
        const cognitiveLoadAvg = averagedSurveyResults.slice(80, 120).reduce((a, b) => a + b, 0) / 40;
        const averagedData = {
            timestamp: new Date().toISOString(), survey_results: averagedSurveyResults.map(v => Math.ceil(v)),
            analysis: {
                voxel: {
                    mean: { x: +knowledgeAvg.toFixed(2), y: +familiarityAvg.toFixed(2), z: +cognitiveLoadAvg.toFixed(2) },
                    mode: { x: getMode(averagedSurveyResults.slice(0, 40).map(Math.round)), y: getMode(averagedSurveyResults.slice(40, 80).map(Math.round)), z: getMode(averagedSurveyResults.slice(80, 120).map(Math.round)) },
                    roundedMean: { x: Math.round(Math.min(Math.max(knowledgeAvg, 1), 8)), y: Math.round(Math.min(Math.max(familiarityAvg, 1), 8)), z: Math.round(Math.min(Math.max(cognitiveLoadAvg, 1), 8)) }
                },
                graphs: {
                    knowledge_density: { mean: +knowledgeAvg.toFixed(2), distribution_data: getGaussianData(knowledgeAvg) },
                    familiarity: { mean: +familiarityAvg.toFixed(2), distribution_data: getGaussianData(familiarityAvg) },
                    cognitive_load: { mean: +cognitiveLoadAvg.toFixed(2), distribution_data: getGaussianData(cognitiveLoadAvg) }
                }
            }
        };
        const now = new Date();
        const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
        const newFilename = `calc_${timestamp}.json`;

        // Save the new calculated result to the database
        const insertQuery = `
            INSERT INTO surveys(filename, survey_type, survey_results, analysis_voxel, analysis_graphs)
            VALUES($1, $2, $3, $4, $5)
        `;
        // FIX: Explicitly stringify the JSON objects before sending to the database
        const insertValues = [
            newFilename, 
            'calculated', 
            JSON.stringify(averagedData.survey_results), 
            JSON.stringify(averagedData.analysis.voxel), 
            JSON.stringify(averagedData.analysis.graphs)
        ];
        await pool.query(insertQuery, insertValues);

        // Send the complete response back to the front-end
        res.json({
            calculationResult: { filename: newFilename, data: averagedData },
            sourceFiles: sourceFilesData
        });

    } catch (error) {
        console.error('Error calculating average:', error);
        res.status(500).json({ message: 'Error calculating average.' });
    }
});

// --- STATIC DATA ROUTES (Unchanged) ---
app.get('/api/voxel-data', (req, res) => {
    res.sendFile(path.join(dataDir, 'voxel_data.csv'));
});
app.get('/api/questions', (req, res) => {
    res.sendFile(path.join(dataDir, 'questions.json'));
});

// --- CATCH-ALL ROUTE (Unchanged) ---
app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});


