require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

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

// --- GOOGLE AI SETUP ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// UPDATED the model name here from "gemini-pro" to a current version
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});


const dataDir = path.join(__dirname, 'data');
app.use(express.json({ limit: '10mb' }));


// --- ALL API ENDPOINTS ARE DEFINED FIRST ---

// --- ENDPOINT FOR TABLE VIEWER ---
app.get('/api/all-tables-data', async (req, res) => {
    try {
        const queries = {
            iterations: pool.query('SELECT * FROM iterations ORDER BY id'),
            organization_units: pool.query('SELECT * FROM organization_units ORDER BY id'),
            people: pool.query('SELECT * FROM people ORDER BY id'),
            person_roles: pool.query('SELECT * FROM person_roles ORDER BY id'),
            surveys: pool.query('SELECT * FROM surveys ORDER BY id'),
            app_data: pool.query('SELECT * FROM app_data ORDER BY key')
        };

        const results = await Promise.all(Object.values(queries));
        const [iterationsResult, orgUnitsResult, peopleResult, rolesResult, surveysResult, appDataResult] = results;

        res.json({
            iterations: iterationsResult.rows,
            organization_units: orgUnitsResult.rows,
            people: peopleResult.rows,
            person_roles: rolesResult.rows,
            surveys: surveysResult.rows,
            app_data: appDataResult.rows
        });

    } catch (error) {
        console.error('Error fetching all table data:', error);
        res.status(500).json({ message: 'Error fetching all table data.' });
    }
});

// --- API ENDPOINTS FOR ITERATION MANAGEMENT ---
app.get('/api/iterations', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, start_date, end_date, question_set FROM iterations ORDER BY start_date DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching iterations:', error);
        res.status(500).json({ message: 'Error fetching iterations.' });
    }
});

app.get('/api/active-iteration', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, start_date, end_date, question_set FROM iterations WHERE end_date IS NULL LIMIT 1');
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No active iteration found.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching active iteration:', error);
        res.status(500).json({ message: 'Error fetching active iteration.' });
    }
});

app.post('/api/iterations', async (req, res) => {
    try {
        const { name, question_set } = req.body;
        const activeCheck = await pool.query('SELECT id FROM iterations WHERE end_date IS NULL');
        if (activeCheck.rows.length > 0) {
            return res.status(400).json({ message: 'An active iteration already exists. Please close it before creating a new one.' });
        }
        const query = question_set
            ? 'INSERT INTO iterations(name, question_set) VALUES($1, $2) RETURNING *'
            : 'INSERT INTO iterations(name) VALUES($1) RETURNING *';
        const values = question_set ? [name, question_set] : [name];
        
        const result = await pool.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating iteration:', error);
        res.status(500).json({ message: 'Error creating iteration.' });
    }
});

app.post('/api/iterations/next', async (req, res) => {
    const { name, question_set } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const activeCheck = await client.query('SELECT id FROM iterations WHERE end_date IS NULL');
        if (activeCheck.rows.length > 0) {
            throw new Error('An active iteration already exists. It must be closed before creating the next one.');
        }

        const lastClosedResult = await client.query('SELECT id FROM iterations WHERE end_date IS NOT NULL ORDER BY end_date DESC LIMIT 1');
        if (lastClosedResult.rows.length === 0) {
            throw new Error('No previously closed iteration found to copy from. Please create an initial iteration.');
        }
        const sourceIterationId = lastClosedResult.rows[0].id;

        const insertQuery = question_set
            ? 'INSERT INTO iterations(name, question_set) VALUES($1, $2) RETURNING id'
            : 'INSERT INTO iterations(name) VALUES($1) RETURNING id';
        const insertValues = question_set ? [name, question_set] : [name];
        const newIterationResult = await client.query(insertQuery, insertValues);
        const newIterationId = newIterationResult.rows[0].id;

        const oldUnits = await client.query('SELECT * FROM organization_units WHERE iteration_id = $1', [sourceIterationId]);
        const unitIdMap = new Map();

        const copyUnitsRecursive = async (parentId, newParentId) => {
            const children = oldUnits.rows.filter(u => u.parent_id === parentId);
            for (const child of children) {
                const newUnitResult = await client.query(
                    'INSERT INTO organization_units(name, parent_id, iteration_id) VALUES($1, $2, $3) RETURNING id',
                    [child.name, newParentId, newIterationId]
                );
                const newUnitId = newUnitResult.rows[0].id;
                unitIdMap.set(child.id, newUnitId);
                await copyUnitsRecursive(child.id, newUnitId);
            }
        };
        
        await copyUnitsRecursive(null, null);

        const oldRoles = await client.query('SELECT * FROM person_roles WHERE iteration_id = $1', [sourceIterationId]);
        for (const role of oldRoles.rows) {
            const newOrgUnitId = unitIdMap.get(role.org_unit_id);
            if (newOrgUnitId) {
                 await client.query(
                    'INSERT INTO person_roles(person_id, org_unit_id, is_manager, description, iteration_id) VALUES($1, $2, $3, $4, $5)',
                    [role.person_id, newOrgUnitId, role.is_manager, role.description, newIterationId]
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ message: `Successfully created and copied iteration '${name}'.` });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating next iteration:', error);
        res.status(500).json({ message: error.message || 'Error creating next iteration.' });
    } finally {
        client.release();
    }
});

app.put('/api/iterations/:id/close', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('UPDATE iterations SET end_date = NOW() WHERE id = $1 AND end_date IS NULL RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Active iteration not found or already closed.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error closing iteration:', error);
        res.status(500).json({ message: 'Error closing iteration.' });
    }
});

app.delete('/api/iterations/:id', async (req, res) => {
    const targetId = parseInt(req.params.id, 10);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        
        const minIdResult = await client.query('SELECT MIN(id) as min_id FROM iterations');
        const isDeletingFirstIteration = minIdResult.rows.length > 0 && minIdResult.rows[0].min_id === targetId;

        const iterationsToDeleteResult = await client.query('SELECT id FROM iterations WHERE id >= $1', [targetId]);
        if (iterationsToDeleteResult.rows.length === 0) {
            await client.query('COMMIT');
            return res.status(204).send();
        }
        const iterationIdsToDelete = iterationsToDeleteResult.rows.map(row => row.id);

        await client.query('DELETE FROM surveys WHERE iteration_id = ANY($1::int[])', [iterationIdsToDelete]);
        await client.query('DELETE FROM person_roles WHERE iteration_id = ANY($1::int[])', [iterationIdsToDelete]);
        await client.query('DELETE FROM organization_units WHERE iteration_id = ANY($1::int[])', [iterationIdsToDelete]);
        await client.query('DELETE FROM iterations WHERE id = ANY($1::int[])', [iterationIdsToDelete]);

        if (isDeletingFirstIteration) {
            await client.query("UPDATE app_data SET value = '' WHERE key = 'target'");
        }

        await client.query('COMMIT');
        res.status(204).send();

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error during cascading delete for iteration ID >= ${targetId}:`, error);
        res.status(500).json({ message: 'An error occurred while deleting the iteration(s).' });
    } finally {
        client.release();
    }
});

// --- NEW ENDPOINTS FOR TEXT ANALYSIS ---
app.get('/api/aggregate-texts', async (req, res) => {
    try {
        const activeIterationResult = await pool.query('SELECT id FROM iterations WHERE end_date IS NULL LIMIT 1');
        if (activeIterationResult.rows.length === 0) {
            return res.status(404).json({ message: 'No active iteration found.' });
        }
        const iterationId = activeIterationResult.rows[0].id;

        const targetQuery = pool.query("SELECT value FROM app_data WHERE key = 'target'");
        const descriptionsQuery = pool.query("SELECT description FROM person_roles WHERE iteration_id = $1 AND description IS NOT NULL AND description <> ''", [iterationId]);

        const [targetResult, descriptionsResult] = await Promise.all([targetQuery, descriptionsQuery]);

        let aggregatedText = "--- ORGANIZATIONAL TARGET ---\n";
        aggregatedText += (targetResult.rows.length > 0 ? targetResult.rows[0].value : "Not defined.") + "\n\n";
        aggregatedText += "--- AGGREGATED ROLE DESCRIPTIONS ---\n";
        
        if (descriptionsResult.rows.length > 0) {
            descriptionsResult.rows.forEach(row => {
                aggregatedText += `- ${row.description}\n`;
            });
        } else {
            aggregatedText += "No descriptions entered for this iteration.";
        }

        res.json({ aggregatedText });

    } catch (error) {
        console.error('Error aggregating texts:', error);
        res.status(500).json({ message: 'Error aggregating texts.' });
    }
});

app.post('/api/analyze-text', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ message: 'Text to analyze is required.' });
        }

        const prompt = `Please provide a concise summary of the following organizational texts. Identify the main goal from the "TARGET" section and then list the key themes, responsibilities, and potential overlaps or conflicts from the "ROLE DESCRIPTIONS" section.\n\n${text}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const analysis = response.text();
        
        res.json({ analysis });

    } catch (error) {
        console.error('Error analyzing text with Google AI:', error);
        res.status(500).json({ message: 'Error analyzing text.' });
    }
});

// --- (The rest of the file remains the same) ---
app.post('/api/check-person', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'Name is required.' });
        }
        const result = await pool.query('SELECT id FROM people WHERE name = $1', [name]);
        if (result.rows.length > 0) {
            res.status(200).json({ message: 'User exists.', person: result.rows[0] });
        } else {
            res.status(404).json({ message: 'You are not registered.' });
        }
    } catch (error) {
        console.error('Error checking person:', error);
        res.status(500).json({ message: 'An error occurred.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { name, orgUnitId, isManager, iterationId } = req.body;
        if (!name || !orgUnitId || isManager === undefined || !iterationId) {
            return res.status(400).json({ message: 'Name, Unit, Role, and Iteration are required.' });
        }
        const query = `
            SELECT pr.id as "personRoleId", p.id as "personId", p.name, pr.is_manager, pr.org_unit_id, o.name as "orgUnitName"
            FROM person_roles pr
            JOIN people p ON pr.person_id = p.id
            JOIN organization_units o ON pr.org_unit_id = o.id
            WHERE p.name = $1 AND pr.org_unit_id = $2 AND pr.is_manager = $3 AND pr.iteration_id = $4
        `;
        const result = await pool.query(query, [name, orgUnitId, isManager, iterationId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No matching role found for this user in the specified unit for the active iteration.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'An error occurred during login.' });
    }
});

app.get('/api/initial-load/:personRoleId', async (req, res) => {
    try {
        const { personRoleId } = req.params;
        if (!personRoleId) return res.status(400).json({ message: "User role not specified." });

        const roleResult = await pool.query('SELECT org_unit_id FROM person_roles WHERE id = $1', [personRoleId]);
        if (roleResult.rows.length === 0) return res.status(404).json({ message: "User role not found." });
        const userOrgUnitId = roleResult.rows[0].org_unit_id;

        const individualQuery = pool.query(`SELECT survey_results, analysis_voxel, analysis_graphs FROM surveys WHERE person_role_id = $1 AND survey_type = 'individual'`, [personRoleId]);
        const calculatedQuery = pool.query(`SELECT survey_results, analysis_voxel, analysis_graphs FROM surveys WHERE org_unit_id = $1 AND survey_type = 'calculated'`, [userOrgUnitId]);

        const [individualResult, calculatedResult] = await Promise.all([individualQuery, calculatedQuery]);

        const individualData = individualResult.rows.length > 0 ? { survey_results: individualResult.rows[0].survey_results, analysis: { voxel: individualResult.rows[0].analysis_voxel, graphs: individualResult.rows[0].analysis_graphs } } : null;
        const calculatedData = calculatedResult.rows.length > 0 ? { survey_results: calculatedResult.rows[0].survey_results, analysis: { voxel: calculatedResult.rows[0].analysis_voxel, graphs: calculatedResult.rows[0].analysis_graphs } } : null;

        res.json({ individualData, calculatedData });
    } catch (error) {
        console.error('Error fetching initial load data:', error);
        res.status(500).json({ message: 'Error fetching initial load data.' });
    }
});

app.get('/api/organization-stats/:personRoleId', async (req, res) => {
    try {
        const { personRoleId } = req.params;
        const managerCheck = await pool.query('SELECT is_manager FROM person_roles WHERE id = $1', [personRoleId]);
        if (managerCheck.rows.length === 0 || !managerCheck.rows[0].is_manager) {
            return res.status(403).json({ message: 'Permission denied.' });
        }
        
        const activeIterationResult = await pool.query('SELECT id FROM iterations WHERE end_date IS NULL LIMIT 1');
        if (activeIterationResult.rows.length === 0) {
            return res.json({ targetEntered: 0, totalRoles: 0, descriptionsEntered: 0, cognitiveDataEntered: 0, totalUnits: 0, calculatedUnits: 0 });
        }
        const iterationId = activeIterationResult.rows[0].id;

        const queries = {
            target: pool.query("SELECT value FROM app_data WHERE key = 'target' AND value IS NOT NULL AND value <> ''"),
            totalRoles: pool.query("SELECT COUNT(*) as count FROM person_roles WHERE iteration_id = $1", [iterationId]),
            descriptions: pool.query("SELECT COUNT(*) as count FROM person_roles WHERE description IS NOT NULL AND description <> '' AND iteration_id = $1", [iterationId]),
            cognitiveData: pool.query("SELECT COUNT(DISTINCT person_role_id) as count FROM surveys WHERE survey_type = 'individual' AND iteration_id = $1", [iterationId]),
            totalUnits: pool.query("SELECT COUNT(*) as count FROM organization_units WHERE iteration_id = $1", [iterationId]),
            calculatedUnits: pool.query("SELECT COUNT(*) as count FROM surveys WHERE survey_type = 'calculated' AND iteration_id = $1", [iterationId])
        };

        const results = await Promise.all(Object.values(queries));
        const [targetResult, totalRolesResult, descriptionsResult, cognitiveDataResult, totalUnitsResult, calculatedUnitsResult] = results;

        const stats = {
            targetEntered: targetResult.rows.length > 0 ? 1 : 0,
            totalRoles: parseInt(totalRolesResult.rows[0].count, 10),
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

app.post('/api/saved-files', async (req, res) => {
    try {
        const { survey_results, analysis, personRoleId, orgUnitId, iterationId } = req.body;
        
        const roleResult = await pool.query('SELECT p.name, pr.is_manager FROM person_roles pr JOIN people p ON pr.person_id = p.id WHERE pr.id = $1', [personRoleId]);
        if (roleResult.rows.length === 0) return res.status(404).json({ message: "User role not found." });
        
        const { name, is_manager } = roleResult.rows[0];
        const role = is_manager ? 'manager' : 'coworker';
        const filename = `cognitive_data_${orgUnitId}_${name}_${role}.json`;

        const query = `
            INSERT INTO surveys (person_role_id, survey_type, filename, survey_results, analysis_voxel, analysis_graphs, org_unit_id, iteration_id)
            VALUES ($1, 'individual', $2, $3, $4, $5, $6, $7)
            ON CONFLICT (person_role_id) WHERE survey_type = 'individual'
            DO UPDATE SET
                filename = EXCLUDED.filename,
                survey_results = EXCLUDED.survey_results,
                analysis_voxel = EXCLUDED.analysis_voxel,
                analysis_graphs = EXCLUDED.analysis_graphs,
                org_unit_id = EXCLUDED.org_unit_id,
                iteration_id = EXCLUDED.iteration_id;
        `;
        const values = [personRoleId, filename, JSON.stringify(survey_results), JSON.stringify(analysis.voxel), JSON.stringify(analysis.graphs), orgUnitId, iterationId];
        
        await pool.query(query, values);
        res.status(201).json({ message: 'Survey saved successfully', filename });
    } catch (error) { 
        console.error("Error saving survey to DB:", error);
        res.status(500).json({ message: 'Error saving survey.' }); 
    }
});

app.post('/api/calculate', async (req, res) => {
    try {
        const { personRoleId, orgUnitId, iterationId } = req.body;
        
        const userResult = await pool.query('SELECT * FROM person_roles WHERE id = $1', [personRoleId]);
        if (userResult.rows.length === 0 || !userResult.rows[0].is_manager) {
            return res.status(403).json({ message: 'Permission denied: Only managers can perform calculations.' });
        }
        
        const subordinateDataQuery = `
            WITH RECURSIVE subordinate_units AS (
                SELECT id FROM organization_units WHERE id = $1 AND iteration_id = $2
                UNION
                SELECT u.id FROM organization_units u INNER JOIN subordinate_units s ON u.parent_id = s.id WHERE u.iteration_id = $2
            )
            SELECT filename, survey_results, analysis_voxel FROM surveys
            WHERE org_unit_id IN (SELECT id FROM subordinate_units) AND survey_type = 'individual' AND iteration_id = $2;
        `;
        
        const sourceSurveysResult = await pool.query(subordinateDataQuery, [orgUnitId, iterationId]);
        if (sourceSurveysResult.rows.length === 0) {
            return res.status(404).json({ message: 'No individual surveys found in this unit or its subordinates to calculate.' });
        }
        
        const allSurveyResults = sourceSurveysResult.rows.map(row => row.survey_results);
        const sourceFilesData = sourceSurveysResult.rows.map(row => ({
            filename: row.filename,
            data: { analysis: { voxel: row.analysis_voxel } }
        }));
        
        const numFiles = allSurveyResults.length;
        const totalQuestions = allSurveyResults[0].length; 
        const questionsPerGroup = totalQuestions / 3;

        const averagedSurveyResults = Array(totalQuestions).fill(0);
        for (const resultSet of allSurveyResults) {
            for (let i = 0; i < totalQuestions; i++) { averagedSurveyResults[i] += resultSet[i] / numFiles; }
        }
        
        const getMode = (arr) => { if (!arr || arr.length === 0) return null; const counts = {}; let maxCount = 0, mode = null; for (const value of arr) { counts[value] = (counts[value] || 0) + 1; if (counts[value] > maxCount) { maxCount = counts[value]; mode = value; } } return mode; };
        const getGaussianData = (mean, stdDev = 1) => { const gaussian = (x, m, s) => Math.exp(-0.5 * Math.pow((x - m) / s, 2)) / (s * Math.sqrt(2 * Math.PI)); return Array.from({length: 71}, (_, i) => parseFloat(gaussian(1 + i * 0.1, mean, stdDev).toFixed(4))); };
        
        const knowledgeAvg = averagedSurveyResults.slice(0, questionsPerGroup).reduce((a, b) => a + b, 0) / questionsPerGroup;
        const familiarityAvg = averagedSurveyResults.slice(questionsPerGroup, questionsPerGroup * 2).reduce((a, b) => a + b, 0) / questionsPerGroup;
        const cognitiveLoadAvg = averagedSurveyResults.slice(questionsPerGroup * 2, totalQuestions).reduce((a, b) => a + b, 0) / questionsPerGroup;

        const averagedData = { timestamp: new Date().toISOString(), survey_results: averagedSurveyResults.map(v => Math.ceil(v)), analysis: { voxel: { mean: { x: +knowledgeAvg.toFixed(2), y: +familiarityAvg.toFixed(2), z: +cognitiveLoadAvg.toFixed(2) }, mode: { x: getMode(averagedSurveyResults.slice(0, questionsPerGroup).map(Math.round)), y: getMode(averagedSurveyResults.slice(questionsPerGroup, questionsPerGroup * 2).map(Math.round)), z: getMode(averagedSurveyResults.slice(questionsPerGroup * 2, totalQuestions).map(Math.round)) }, roundedMean: { x: Math.round(Math.min(Math.max(knowledgeAvg, 1), 8)), y: Math.round(Math.min(Math.max(familiarityAvg, 1), 8)), z: Math.round(Math.min(Math.max(cognitiveLoadAvg, 1), 8)) } }, graphs: { knowledge_density: { mean: +knowledgeAvg.toFixed(2), distribution_data: getGaussianData(knowledgeAvg) }, familiarity: { mean: +familiarityAvg.toFixed(2), distribution_data: getGaussianData(familiarityAvg) }, cognitive_load: { mean: +cognitiveLoadAvg.toFixed(2), distribution_data: getGaussianData(cognitiveLoadAvg) } } } };
        const newFilename = `calc_${orgUnitId}.json`;
        
        const insertQuery = `
            INSERT INTO surveys (org_unit_id, survey_type, filename, survey_results, analysis_voxel, analysis_graphs, iteration_id)
            VALUES ($1, 'calculated', $2, $3, $4, $5, $6)
            ON CONFLICT (org_unit_id) WHERE survey_type = 'calculated'
            DO UPDATE SET
                filename = EXCLUDED.filename,
                survey_results = EXCLUDED.survey_results,
                analysis_voxel = EXCLUDED.analysis_voxel,
                analysis_graphs = EXCLUDED.analysis_graphs,
                iteration_id = EXCLUDED.iteration_id;
        `;
        const insertValues = [orgUnitId, newFilename, JSON.stringify(averagedSurveyResults), JSON.stringify(averagedData.analysis.voxel), JSON.stringify(averagedData.analysis.graphs), iterationId];
        await pool.query(insertQuery, insertValues);

        res.json({ message: `Calculation for OrgUnit ${orgUnitId} successful. Saved as ${newFilename}.`, calculationResult: { filename: newFilename, data: averagedData }, sourceFiles: sourceFilesData });
    } catch (error) { 
        console.error("Error calculating average:", error);
        res.status(500).json({ message: 'Error calculating average.' }); 
    }
});


app.get('/api/org-data/:iterationId', async (req, res) => {
    try {
        const { iterationId } = req.params;
        const unitsQuery = pool.query('SELECT * FROM organization_units WHERE iteration_id = $1 ORDER BY parent_id NULLS FIRST, name ASC', [iterationId]);
        const peopleQuery = pool.query('SELECT id, name FROM people ORDER BY name ASC');
        const rolesQuery = pool.query('SELECT id, person_id, org_unit_id, is_manager FROM person_roles WHERE iteration_id = $1', [iterationId]);
        const [unitsResult, peopleResult, rolesResult] = await Promise.all([unitsQuery, peopleQuery, rolesQuery]);
        res.json({ units: unitsResult.rows, people: peopleResult.rows, roles: rolesResult.rows });
    } catch (error) { res.status(500).json({ message: 'Error fetching organization data.' }); }
});

app.post('/api/org-tree', async (req, res) => {
    try {
        const { name, parentId, iterationId } = req.body;
        const result = await pool.query('INSERT INTO organization_units(name, parent_id, iteration_id) VALUES($1, $2, $3) RETURNING *', [name, parentId, iterationId]);
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

app.post('/api/people', async (req, res) => {
    try {
        const { name } = req.body;
        if (name.toLowerCase() === 'admin') { return res.status(400).json({ message: 'This name is reserved.' }); }
        const result = await pool.query('INSERT INTO people(name) VALUES($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *', [name]);
        res.status(201).json(result.rows[0]);
    } catch(e){ res.status(500).json({ message: 'Error creating person.' }); }
});

app.post('/api/roles', async (req, res) => {
    try {
        const { personId, orgUnitId, isManager, iterationId } = req.body;
        const result = await pool.query('INSERT INTO person_roles(person_id, org_unit_id, is_manager, iteration_id) VALUES($1, $2, $3, $4) RETURNING *', [personId, orgUnitId, isManager, iterationId]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ message: 'Error: This person already has this exact role in this unit for this iteration.' });
        res.status(500).json({ message: 'Error adding role.' });
    }
});

app.delete('/api/roles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM person_roles WHERE id = $1', [id]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Role not found.' });
        res.status(204).send();
    } catch (error) { res.status(500).json({ message: 'Error deleting role.' }); }
});

app.get('/api/person-context/:personRoleId', async (req, res) => {
    try {
        const { personRoleId } = req.params;
        const query = `
            SELECT 
                pr.id as "personRoleId", p.id as "personId", p.name, pr.description,
                pr.is_manager, pr.org_unit_id, o.name as "orgUnitName",
                (SELECT ou.parent_id IS NULL FROM organization_units ou WHERE ou.id = pr.org_unit_id) as "isRootUnit",
                (SELECT MIN(id) FROM iterations) as "firstIterationId"
            FROM person_roles pr
            JOIN people p ON pr.person_id = p.id
            JOIN organization_units o ON pr.org_unit_id = o.id
            WHERE pr.id = $1
        `;
        const result = await pool.query(query, [personRoleId]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Person role not found.' });
        
        const user = result.rows[0];
        user.isRootManager = user.isRootUnit && user.is_manager;
        res.json(user);
    } catch(e) {
        console.error('Error fetching person context:', e);
        res.status(500).json({ message: 'Error fetching person context.' })
    }
});

app.get('/api/app-data/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const result = await pool.query('SELECT value FROM app_data WHERE key = $1', [key]);
        res.json(result.rows[0] || { value: '' });
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
            const iterationCheckQuery = `
                SELECT
                    (SELECT MIN(id) FROM iterations) as first_id,
                    (SELECT id FROM iterations WHERE end_date IS NULL LIMIT 1) as active_id
            `;
            const iterationResult = await pool.query(iterationCheckQuery);

            if (iterationResult.rows.length === 0 || !iterationResult.rows[0].active_id) {
                 return res.status(403).json({ message: 'Cannot set Target without an active iteration.' });
            }
            const { first_id, active_id } = iterationResult.rows[0];

            if (active_id !== first_id) {
                return res.status(403).json({ message: 'The Target can only be set during the first iteration.' });
            }

            const managerCheckQuery = `
                SELECT 1 FROM person_roles pr
                JOIN organization_units ou ON pr.org_unit_id = ou.id
                WHERE pr.person_id = $1
                  AND pr.is_manager = TRUE
                  AND ou.parent_id IS NULL
                  AND pr.iteration_id = $2
            `;
            const managerResult = await pool.query(managerCheckQuery, [personId, active_id]);

            if (managerResult.rows.length === 0) {
                return res.status(403).json({ message: 'Only a root manager can set the Target in the first iteration.' });
            }
        }

        const existingResult = await pool.query('SELECT key FROM app_data WHERE key = $1', [key]);
        if (existingResult.rows.length > 0) {
            await pool.query('UPDATE app_data SET value = $1, updated_by_person_id = $2, updated_at = NOW() WHERE key = $3', [value, personId, key]);
        } else {
            await pool.query('INSERT INTO app_data (key, value, updated_by_person_id, updated_at) VALUES ($1, $2, $3, NOW())', [key, value, personId]);
        }
        res.status(200).json({ message: 'Data saved successfully.' });
    } catch (error) {
        console.error(`Error saving app data for key ${key}:`, error);
        res.status(500).json({ message: 'Error saving application data.' });
    }
});

app.put('/api/role-description', async (req, res) => {
    try {
        const { description, personRoleId } = req.body;
        if (personRoleId === undefined) return res.status(400).json({ message: 'personRoleId is required.'});
        const query = 'UPDATE person_roles SET description = $1 WHERE id = $2 RETURNING id';
        const result = await pool.query(query, [description, personRoleId]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Person role not found.'});
        res.status(200).json({ message: 'Description saved successfully.' });
    } catch (error) {
        console.error('Error saving description:', error);
        res.status(500).json({ message: 'Error saving description.' });
    }
});

app.get('/api/voxel-data', (req, res) => res.sendFile(path.join(dataDir, 'voxel_data.csv')));

app.get('/api/questions/:iterationId', async (req, res) => {
    try {
        const { iterationId } = req.params;
        if (!iterationId) {
            return res.status(400).json({ message: 'Iteration ID is required.' });
        }

        const result = await pool.query('SELECT question_set FROM iterations WHERE id = $1', [iterationId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Iteration not found.' });
        }

        const filename = result.rows[0].question_set;
        
        const allowedFiles = ['Deep_Analysis_120.json', 'Normal_Analysis_60.json', 'Pulse_Check_12.json'];
        if (!allowedFiles.includes(filename)) {
            console.error(`Forbidden file access attempt: ${filename}`);
            return res.status(403).json({ message: 'Invalid or forbidden question set.' });
        }

        const filePath = path.join(dataDir, filename);
        res.sendFile(filePath, (err) => {
            if (err) {
                console.error(`Error sending file ${filePath}:`, err);
                res.status(404).json({ message: 'Question file not found on server.' });
            }
        });

    } catch (error) {
        console.error('Error fetching questions:', error);
        res.status(500).json({ message: 'Error fetching questions.' });
    }
});


// --- SERVE STATIC FILES LAST (Correct Position) ---
app.use(express.static(path.join(__dirname)));


app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
