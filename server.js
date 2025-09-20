require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = 3002;

// --- DATABASE CONNECTION ---
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
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

app.get('/api/initial-load/:personId', async (req, res) => {
    try {
        const { personId } = req.params;
        if (!personId) return res.status(400).json({ message: "User not specified." });

        const userResult = await pool.query('SELECT org_unit_id FROM persons WHERE id = $1', [personId]);
        if (userResult.rows.length === 0) return res.status(404).json({ message: "User not found." });
        const userOrgUnitId = userResult.rows[0].org_unit_id;

        const individualQuery = pool.query(`
            SELECT survey_results, analysis_voxel, analysis_graphs 
            FROM surveys 
            WHERE person_id = $1 AND survey_type = 'individual'
        `, [personId]);

        const calculatedQuery = pool.query(`
            SELECT survey_results, analysis_voxel, analysis_graphs 
            FROM surveys 
            WHERE org_unit_id = $1 AND survey_type = 'calculated'
        `, [userOrgUnitId]);

        const [individualResult, calculatedResult] = await Promise.all([individualQuery, calculatedQuery]);

        const individualData = individualResult.rows.length > 0 ? {
            survey_results: individualResult.rows[0].survey_results,
            analysis: {
                voxel: individualResult.rows[0].analysis_voxel,
                graphs: individualResult.rows[0].analysis_graphs
            }
        } : null;

        const calculatedData = calculatedResult.rows.length > 0 ? {
            survey_results: calculatedResult.rows[0].survey_results,
            analysis: {
                voxel: calculatedResult.rows[0].analysis_voxel,
                graphs: calculatedResult.rows[0].analysis_graphs
            }
        } : null;

        res.json({ individualData, calculatedData });

    } catch (error) {
        console.error('Error fetching initial load data:', error);
        res.status(500).json({ message: 'Error fetching initial load data.' });
    }
});

app.get('/api/organization-stats/:personId', async (req, res) => {
    try {
        const { personId } = req.params;
        const managerCheck = await pool.query('SELECT is_manager FROM persons WHERE id = $1', [personId]);
        if (managerCheck.rows.length === 0 || !managerCheck.rows[0].is_manager) {
            return res.status(403).json({ message: 'Permission denied.' });
        }

        const queries = {
            target: pool.query("SELECT value FROM app_data WHERE key = 'target' AND value IS NOT NULL AND value <> ''"),
            totalPeople: pool.query("SELECT COUNT(*) as count FROM persons"),
            descriptions: pool.query("SELECT COUNT(*) as count FROM persons WHERE description IS NOT NULL AND description <> ''"),
            cognitiveData: pool.query("SELECT COUNT(DISTINCT person_id) as count FROM surveys WHERE survey_type = 'individual'"),
            totalUnits: pool.query("SELECT COUNT(*) as count FROM organization_units"),
            calculatedUnits: pool.query("SELECT COUNT(*) as count FROM surveys WHERE survey_type = 'calculated'")
        };

        const results = await Promise.all(Object.values(queries));
        const [targetResult, totalPeopleResult, descriptionsResult, cognitiveDataResult, totalUnitsResult, calculatedUnitsResult] = results;

        const stats = {
            targetEntered: targetResult.rows.length > 0 ? 1 : 0,
            totalPeople: parseInt(totalPeopleResult.rows[0].count, 10),
            descriptionsEntered: parseInt(descriptionsResult.rows[0].count, 10),
            cognitiveDataEntered: parseInt(cognitiveDataResult.rows[0].count, 10),
            totalUnits: parseInt(totalUnitsResult.rows[0].count, 10),
            calculatedUnits: parseInt(calculatedUnitsResult.rows[0].count, 10)
        };
        
        res.json(stats);

    } catch (error) {
        console.error('Error fetching organization stats:', error);
        res.status(500).json({ message: 'Error fetching organization stats.' });
    }
});

// NEW endpoint for handling name-based login
app.post('/api/login', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'Name is required.' });
        }

        const query = `
            SELECT 
                p.id, p.name, p.is_manager, p.org_unit_id, o.name as org_unit_name
            FROM persons p
            JOIN organization_units o ON p.org_unit_id = o.id
            WHERE p.name = $1
        `;
        const result = await pool.query(query, [name]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User with this name not found.' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'An error occurred during login.' });
    }
});


app.post('/api/saved-files', async (req, res) => {
    try {
        const { survey_results, analysis, personId, orgUnitId } = req.body;
        
        const userResult = await pool.query('SELECT is_manager FROM persons WHERE id = $1', [personId]);
        if (userResult.rows.length === 0) return res.status(404).json({ message: "User not found." });
        
        const role = userResult.rows[0].is_manager ? 'manager' : 'coworker';
        const filename = `cognitive_data_${orgUnitId}_${personId}_${role}.json`;

        const query = `
            INSERT INTO surveys (person_id, survey_type, filename, survey_results, analysis_voxel, analysis_graphs, org_unit_id)
            VALUES ($1, 'individual', $2, $3, $4, $5, $6)
            ON CONFLICT (person_id) WHERE survey_type = 'individual'
            DO UPDATE SET
                filename = EXCLUDED.filename,
                survey_results = EXCLUDED.survey_results,
                analysis_voxel = EXCLUDED.analysis_voxel,
                analysis_graphs = EXCLUDED.analysis_graphs,
                org_unit_id = EXCLUDED.org_unit_id;
        `;
        const values = [personId, filename, JSON.stringify(survey_results), JSON.stringify(analysis.voxel), JSON.stringify(analysis.graphs), orgUnitId];
        
        await pool.query(query, values);
        res.status(201).json({ message: 'Survey saved successfully', filename });
    } catch (error) { 
        console.error("Error saving survey to DB:", error);
        res.status(500).json({ message: 'Error saving survey.' }); 
    }
});

app.post('/api/calculate', async (req, res) => {
    try {
        const { personId, orgUnitId } = req.body;
        
        const userResult = await pool.query('SELECT * FROM persons WHERE id = $1', [personId]);
        if (userResult.rows.length === 0 || !userResult.rows[0].is_manager) {
            return res.status(403).json({ message: 'Permission denied: Only managers can perform calculations.' });
        }
        
        const subordinateDataQuery = `
            WITH RECURSIVE subordinate_units AS (
                SELECT id FROM organization_units WHERE id = $1
                UNION
                SELECT u.id FROM organization_units u INNER JOIN subordinate_units s ON u.parent_id = s.id
            )
            SELECT filename, survey_results, analysis_voxel FROM surveys
            WHERE org_unit_id IN (SELECT id FROM subordinate_units) AND survey_type = 'individual';
        `;
        
        const sourceSurveysResult = await pool.query(subordinateDataQuery, [orgUnitId]);
        if (sourceSurveysResult.rows.length === 0) {
            return res.status(404).json({ message: 'No individual surveys found in this unit or its subordinates to calculate.' });
        }
        
        const allSurveyResults = sourceSurveysResult.rows.map(row => row.survey_results);
        const sourceFilesData = sourceSurveysResult.rows.map(row => ({
            filename: row.filename,
            data: { analysis: { voxel: row.analysis_voxel } }
        }));
        
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
                voxel: { mean: { x: +knowledgeAvg.toFixed(2), y: +familiarityAvg.toFixed(2), z: +cognitiveLoadAvg.toFixed(2) }, mode: { x: getMode(averagedSurveyResults.slice(0, 40).map(Math.round)), y: getMode(averagedSurveyResults.slice(40, 80).map(Math.round)), z: getMode(averagedSurveyResults.slice(80, 120).map(Math.round)) }, roundedMean: { x: Math.round(Math.min(Math.max(knowledgeAvg, 1), 8)), y: Math.round(Math.min(Math.max(familiarityAvg, 1), 8)), z: Math.round(Math.min(Math.max(cognitiveLoadAvg, 1), 8)) } },
                graphs: { knowledge_density: { mean: +knowledgeAvg.toFixed(2), distribution_data: getGaussianData(knowledgeAvg) }, familiarity: { mean: +familiarityAvg.toFixed(2), distribution_data: getGaussianData(familiarityAvg) }, cognitive_load: { mean: +cognitiveLoadAvg.toFixed(2), distribution_data: getGaussianData(cognitiveLoadAvg) } }
            }
        };
        
        const newFilename = `calc_${orgUnitId}.json`;
        
        const insertQuery = `
            INSERT INTO surveys (org_unit_id, survey_type, filename, survey_results, analysis_voxel, analysis_graphs)
            VALUES ($1, 'calculated', $2, $3, $4, $5)
            ON CONFLICT (org_unit_id) WHERE survey_type = 'calculated'
            DO UPDATE SET
                filename = EXCLUDED.filename,
                survey_results = EXCLUDED.survey_results,
                analysis_voxel = EXCLUDED.analysis_voxel,
                analysis_graphs = EXCLUDED.analysis_graphs;
        `;
        const insertValues = [orgUnitId, newFilename, JSON.stringify(averagedData.survey_results), JSON.stringify(averagedData.analysis.voxel), JSON.stringify(averagedData.analysis.graphs)];
        await pool.query(insertQuery, insertValues);

        res.json({
            message: `Calculation for OrgUnit ${orgUnitId} successful. Saved as ${newFilename}.`,
            calculationResult: { filename: newFilename, data: averagedData },
            sourceFiles: sourceFilesData
        });

    } catch (error) { 
        console.error("Error calculating average:", error);
        res.status(500).json({ message: 'Error calculating average.' }); 
    }
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
        
        const rootUnitResult = await pool.query('SELECT id FROM organization_units WHERE parent_id IS NULL');
        const rootUnitId = rootUnitResult.rows.length > 0 ? rootUnitResult.rows[0].id : null;

        const query = `
            SELECT 
                p.id, p.name, p.is_manager, p.org_unit_id, p.description,
                o.name as org_unit_name,
                CASE WHEN p.org_unit_id = $2 AND p.is_manager = true THEN true ELSE false END as "isRootManager"
            FROM persons p 
            JOIN organization_units o ON p.org_unit_id = o.id 
            WHERE p.id = $1
        `;
        const result = await pool.query(query, [id, rootUnitId]);
        
        if (result.rows.length === 0) return res.status(404).json({ message: 'Person not found.' });
        
        res.json(result.rows[0]);
    } catch(e) {
        console.error('Error fetching person details:', e);
        res.status(500).json({ message: 'Error fetching person.' })
    }
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

// --- API ROUTES FOR TARGET AND DESCRIPTION ---
app.get('/api/app-data/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const result = await pool.query('SELECT value FROM app_data WHERE key = $1', [key]);
        const value = result.rows.length > 0 ? result.rows[0].value : '';
        res.json({ value });
    } catch (error) {
        console.error(`Error fetching app data for key ${key}:`, error);
        res.status(500).json({ message: 'Error fetching application data.' });
    }
});

app.put('/api/app-data/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value, personId } = req.body;

        if (key === 'target') {
            const rootUnitResult = await pool.query('SELECT id FROM organization_units WHERE parent_id IS NULL');
            if (rootUnitResult.rows.length === 0) return res.status(403).json({ message: 'Permission denied: No root unit found.' });
            const rootUnitId = rootUnitResult.rows[0].id;

            const managerResult = await pool.query(
                'SELECT id FROM persons WHERE id = $1 AND org_unit_id = $2 AND is_manager = true',
                [personId, rootUnitId]
            );
            if (managerResult.rows.length === 0) return res.status(403).json({ message: 'Permission denied: Only the root manager can edit the target.' });
        }
        
        const existingResult = await pool.query('SELECT key FROM app_data WHERE key = $1', [key]);

        if (existingResult.rows.length > 0) {
            await pool.query(
                'UPDATE app_data SET value = $1, updated_by_person_id = $2, updated_at = NOW() WHERE key = $3',
                [value, personId, key]
            );
        } else {
            await pool.query(
                'INSERT INTO app_data (key, value, updated_by_person_id, updated_at) VALUES ($1, $2, $3, NOW())',
                [key, value, personId]
            );
        }

        res.status(200).json({ message: 'Data saved successfully.' });
    } catch (error) {
        console.error(`Error saving app data for key ${key}:`, error);
        res.status(500).json({ message: 'Error saving application data.' });
    }
});

app.put('/api/person-description', async (req, res) => {
    try {
        const { description, personId } = req.body;
        if (personId === undefined) return res.status(400).json({ message: 'personId is required.'});

        const query = 'UPDATE persons SET description = $1 WHERE id = $2 RETURNING id';
        const result = await pool.query(query, [description, personId]);
        
        if (result.rows.length === 0) return res.status(404).json({ message: 'Person not found.'});

        res.status(200).json({ message: 'Description saved successfully.' });
    } catch (error) {
        console.error('Error saving description:', error);
        res.status(500).json({ message: 'Error saving description.' });
    }
});

// --- STATIC DATA ROUTES ---
app.get('/api/voxel-data', (req, res) => res.sendFile(path.join(dataDir, 'voxel_data.csv')));
app.get('/api/questions', (req, res) => res.sendFile(path.join(dataDir, 'questions.json')));

// --- START SERVER ---
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});


