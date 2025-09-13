require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = 3000;

// --- DATABASE CONNECTION ---
const pool = new Pool({
    user: 'gauss',
    host: 'localhost',
    database: 'gaussdb',
    password: process.env.DB_PASSWORD,
    port: 5432,
});

pool.connect((err, client, release) => {
    if (err) return console.error('DATABASE CONNECTION FAILED:', err.stack);
    client.query('SELECT NOW()', (err, result) => {
        release();
        if (err) return console.error('Error executing connection test query:', err.stack);
        console.log('Database connection successful. Current time from DB:', result.rows[0].now);
    });
});

const dataDir = path.join(__dirname, 'data');
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// --- API ROUTES FOR COGNITIVE VISUALIZER ---
app.get('/api/saved-files', async (req, res) => {
    try {
        const { personId } = req.query;
        if (!personId) { // Fallback for original tool version
             const result = await pool.query('SELECT filename FROM surveys ORDER BY filename ASC');
             return res.json(result.rows.map(row => row.filename));
        }

        const userResult = await pool.query('SELECT * FROM persons WHERE id = $1', [personId]);
        if (userResult.rows.length === 0) return res.status(404).json({ message: "User not found." });
        const user = userResult.rows[0];

        let query;
        let queryParams = [user.id, user.org_unit_id];

        if (user.is_manager) {
            query = `
                WITH RECURSIVE subordinate_units AS (
                    SELECT id FROM organization_units WHERE id = $2
                    UNION
                    SELECT u.id FROM organization_units u INNER JOIN subordinate_units s ON u.parent_id = s.id
                )
                SELECT filename FROM surveys
                WHERE (person_id = $1) OR (org_unit_id = $2 AND survey_type = 'individual') OR (org_unit_id IN (SELECT id FROM subordinate_units) AND survey_type = 'calculated')
                ORDER BY filename ASC;
            `;
        } else {
            query = `SELECT filename FROM surveys WHERE person_id = $1 ORDER BY filename ASC;`;
        }
        
        const result = await pool.query(query, queryParams);
        res.json(result.rows.map(row => row.filename));
    } catch (error) {
        console.error('Error fetching file list:', error);
        res.status(500).json({ message: 'Error fetching file list.' });
    }
});
app.get('/api/saved-files/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const result = await pool.query('SELECT survey_results, analysis_voxel, analysis_graphs FROM surveys WHERE filename = $1', [filename]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'File not found.' });
        const dbRow = result.rows[0];
        res.json({ survey_results: dbRow.survey_results, analysis: { voxel: dbRow.analysis_voxel, graphs: dbRow.analysis_graphs } });
    } catch (error) { res.status(404).json({ message: 'File not found.' }); }
});
app.post('/api/saved-files', async (req, res) => {
    try {
        const { survey_results, analysis, personId, orgUnitId } = req.body;
        const now = new Date();
        const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
        const filename = personId ? `cognitive_data_${personId}_${orgUnitId}_${timestamp}.json` : `cognitive_data_${timestamp}.json`;

        const query = `INSERT INTO surveys(filename, survey_type, survey_results, analysis_voxel, analysis_graphs, person_id, org_unit_id) VALUES($1, $2, $3, $4, $5, $6, $7)`;
        const values = [filename, 'individual', JSON.stringify(survey_results), JSON.stringify(analysis.voxel), JSON.stringify(analysis.graphs), personId, orgUnitId];
        await pool.query(query, values);
        res.status(201).json({ message: 'Survey saved successfully', filename });
    } catch (error) { res.status(500).json({ message: 'Error saving survey.' }); }
});
app.delete('/api/saved-files', async (req, res) => {
    try {
        const { filenames } = req.body;
        if (!Array.isArray(filenames)) return res.status(400).json({ message: 'Invalid request format.' });
        await pool.query('DELETE FROM surveys WHERE filename = ANY($1::varchar[])', [filenames]);
        res.json({ message: 'Files deleted successfully.' });
    } catch (error) { res.status(500).json({ message: 'Error deleting files.' }); }
});
app.post('/api/calculate', async (req, res) => {
    try {
        const { filenames, personId } = req.body;
        if (!Array.isArray(filenames) || filenames.length === 0) return res.status(400).json({ message: 'No files selected.' });
        if(personId){
            const userResult = await pool.query('SELECT * FROM persons WHERE id = $1', [personId]);
            if (userResult.rows.length === 0 || !userResult.rows[0].is_manager) {
                return res.status(403).json({ message: 'Permission denied: Only managers can perform calculations.' });
            }
        }
        
        const sourceSurveysResult = await pool.query('SELECT filename, survey_results, analysis_voxel, analysis_graphs FROM surveys WHERE filename = ANY($1::varchar[])', [filenames]);
        const sourceFilesData = sourceSurveysResult.rows.map(row => ({ filename: row.filename, data: { survey_results: row.survey_results, analysis: { voxel: row.analysis_voxel, graphs: row.analysis_graphs } } }));
        const allSurveyResults = sourceFilesData.map(file => file.data.survey_results);
        
        const numFiles = allSurveyResults.length;
        const averagedSurveyResults = Array(120).fill(0);
        for (const resultSet of allSurveyResults) {
            for (let i = 0; i < 120; i++) { averagedSurveyResults[i] += resultSet[i] / numFiles; }
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
        
        const user = personId ? (await pool.query('SELECT * FROM persons WHERE id = $1', [personId])).rows[0] : null;
        const insertQuery = `INSERT INTO surveys(filename, survey_type, survey_results, analysis_voxel, analysis_graphs, person_id, org_unit_id) VALUES($1, $2, $3, $4, $5, $6, $7)`;
        const insertValues = [newFilename, 'calculated', JSON.stringify(averagedData.survey_results), JSON.stringify(averagedData.analysis.voxel), JSON.stringify(averagedData.analysis.graphs), user ? user.id : null, user ? user.org_unit_id : null];
        await pool.query(insertQuery, insertValues);

        res.json({
            calculationResult: { filename: newFilename, data: averagedData },
            sourceFiles: sourceFilesData
        });

    } catch (error) { res.status(500).json({ message: 'Error calculating average.' }); }
});


// --- API ROUTES FOR ORG CHART ---
app.get('/api/org-tree', async (req, res) => {
    try {
        const unitsResult = await pool.query('SELECT * FROM organization_units ORDER BY parent_id NULLS FIRST, name ASC');
        const personsResult = await pool.query('SELECT * FROM persons ORDER BY name ASC');
        res.json({ units: unitsResult.rows, persons: personsResult.rows });
    } catch (error) { res.status(500).json({ message: 'Error fetching organization tree.' }); }
});
app.post('/api/org-tree', async (req, res) => {
    try {
        const { name, parentId } = req.body;
        const result = await pool.query('INSERT INTO organization_units(name, parent_id) VALUES($1, $2) RETURNING *', [name, parentId]);
        res.status(201).json(result.rows[0]);
    } catch (error) { res.status(500).json({ message: 'Error adding organization unit.' }); }
});
app.put('/api/org-tree/:id', async (req, res) => {
    try {
        const { id } = req.params; const { name } = req.body;
        const result = await pool.query('UPDATE organization_units SET name = $1 WHERE id = $2 RETURNING *', [name, id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Unit not found.' });
        res.json(result.rows[0]);
    } catch (error) { res.status(500).json({ message: 'Error updating organization unit.' }); }
});
app.delete('/api/org-tree/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM organization_units WHERE id = $1', [id]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Unit not found.' });
        res.status(204).send();
    } catch (error) { res.status(500).json({ message: 'Error deleting organization unit.' }); }
});

// --- API ROUTES FOR PERSONS ---
app.get('/api/person/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const query = `SELECT p.id, p.name, p.is_manager, p.org_unit_id, o.name as org_unit_name FROM persons p JOIN organization_units o ON p.org_unit_id = o.id WHERE p.id = $1`;
        const result = await pool.query(query, [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Person not found.' });
        res.json(result.rows[0]);
    } catch(e) { res.status(500).json({ message: 'Error fetching person.' }) }
});
app.post('/api/persons', async (req, res) => {
    try {
        const { name, orgUnitId, isManager } = req.body;
        const result = await pool.query('INSERT INTO persons(name, org_unit_id, is_manager) VALUES($1, $2, $3) RETURNING *', [name, orgUnitId, isManager]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ message: 'Error: This organization unit already has a manager.' });
        res.status(500).json({ message: 'Error adding person.' });
    }
});
app.put('/api/persons/:id', async (req, res) => {
    try {
        const { id } = req.params; const { name, isManager } = req.body;
        const result = await pool.query('UPDATE persons SET name = $1, is_manager = $2 WHERE id = $3 RETURNING *', [name, isManager, id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Person not found.' });
        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ message: 'Error: This organization unit already has a manager.' });
        res.status(500).json({ message: 'Error updating person.' });
    }
});
app.delete('/api/persons/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM persons WHERE id = $1', [id]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Person not found.' });
        res.status(204).send();
    } catch (error) { res.status(500).json({ message: 'Error deleting person.' }); }
});

// --- STATIC DATA ROUTES ---
app.get('/api/voxel-data', (req, res) => res.sendFile(path.join(dataDir, 'voxel_data.csv')));
app.get('/api/questions', (req, res) => res.sendFile(path.join(dataDir, 'questions.json')));

// --- START SERVER ---
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
