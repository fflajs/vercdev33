require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const https = require('https'); // Use the built-in https module

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

const dataDir = path.join(__dirname, 'data');
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));


// --- NEW ENDPOINT FOR TABLE VIEWER ---
app.get('/api/all-tables-data', async (req, res) => {
    // NOTE: In a real production app, you would add admin authentication here.
    // This endpoint is functionally "open" but the UI only links to it from the admin page.
    try {
        const queries = {
            organization_units: pool.query('SELECT * FROM organization_units ORDER BY id'),
            people: pool.query('SELECT * FROM people ORDER BY id'),
            person_roles: pool.query('SELECT * FROM person_roles ORDER BY id'),
            surveys: pool.query('SELECT * FROM surveys ORDER BY id'),
            app_data: pool.query('SELECT * FROM app_data ORDER BY key')
        };

        const results = await Promise.all(Object.values(queries));
        const [orgUnitsResult, peopleResult, rolesResult, surveysResult, appDataResult] = results;

        res.json({
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


// --- NEW ENDPOINTS FOR TEXT ANALYSIS ---
app.get('/api/aggregate-texts', async (req, res) => {
    try {
        const targetQuery = pool.query("SELECT value FROM app_data WHERE key = 'target'");
        const descriptionsQuery = pool.query("SELECT description FROM person_roles WHERE description IS NOT NULL AND description <> ''");

        const [targetResult, descriptionsResult] = await Promise.all([targetQuery, descriptionsQuery]);

        let aggregatedText = "";
        
        if (targetResult.rows.length > 0 && targetResult.rows[0].value) {
            aggregatedText += "Overall Target:\n" + targetResult.rows[0].value + "\n\n---\n\n";
        }

        if (descriptionsResult.rows.length > 0) {
            aggregatedText += "Role Descriptions:\n";
            descriptionsResult.rows.forEach(row => {
                aggregatedText += "- " + row.description + "\n";
            });
        }
        
        if (!aggregatedText.trim()) {
            aggregatedText = "No Target or Descriptions have been entered yet.";
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
            return res.status(400).json({ message: 'Text for analysis is required.' });
        }
        
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("GEMINI_API_KEY is not set in the .env file.");
            return res.status(500).json({ message: "Server is missing API configuration for text analysis." });
        }
        
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

        const systemPrompt = "You are an expert business analyst. Analyze the provided text, which includes an overall target and a list of individual role descriptions. Your task is to provide a concise summary of the collective focus and then extract the most important and recurring key points or themes as a bulleted list.";
        const userQuery = `Please analyze the following text:\n\n${text}`;

        const payload = {
            contents: [{ parts: [{ text: userQuery }] }],
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
        };

        const url = new URL(apiUrl);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        };

        const geminiPromise = new Promise((resolve, reject) => {
            const apiReq = https.request(options, (apiRes) => {
                let data = '';
                apiRes.on('data', (chunk) => { data += chunk; });
                apiRes.on('end', () => {
                    if (apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
                        resolve(JSON.parse(data));
                    } else {
                        console.error('Gemini API Error:', data);
                        reject(new Error(`Gemini API responded with status: ${apiRes.statusCode}`));
                    }
                });
            });
            apiReq.on('error', (e) => reject(e));
            apiReq.write(JSON.stringify(payload));
            apiReq.end();
        });

        const result = await geminiPromise;
        const analysis = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!analysis) {
            throw new Error("Could not extract analysis from the Gemini API response.");
        }

        res.json({ analysis });

    } catch (error) {
        console.error('Error analyzing text:', error);
        res.status(500).json({ message: 'An error occurred during text analysis.' });
    }
});


// --- EXISTING API ENDPOINTS ---
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
        const { name, orgUnitId, isManager } = req.body;
        if (!name || !orgUnitId || isManager === undefined) {
            return res.status(400).json({ message: 'Name, Unit, and Role are required.' });
        }

        const query = `
            SELECT pr.id as "personRoleId", p.id as "personId", p.name, pr.is_manager, pr.org_unit_id, o.name as "orgUnitName"
            FROM person_roles pr
            JOIN people p ON pr.person_id = p.id
            JOIN organization_units o ON pr.org_unit_id = o.id
            WHERE p.name = $1 AND pr.org_unit_id = $2 AND pr.is_manager = $3
        `;
        const result = await pool.query(query, [name, orgUnitId, isManager]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No matching role found for this user in the specified unit.' });
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

        const queries = {
            target: pool.query("SELECT value FROM app_data WHERE key = 'target' AND value IS NOT NULL AND value <> ''"),
            totalRoles: pool.query("SELECT COUNT(*) as count FROM person_roles"),
            descriptions: pool.query("SELECT COUNT(*) as count FROM person_roles WHERE description IS NOT NULL AND description <> ''"),
            cognitiveData: pool.query("SELECT COUNT(DISTINCT person_role_id) as count FROM surveys WHERE survey_type = 'individual'"),
            totalUnits: pool.query("SELECT COUNT(*) as count FROM organization_units"),
            calculatedUnits: pool.query("SELECT COUNT(*) as count FROM surveys WHERE survey_type = 'calculated'")
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
        const { survey_results, analysis, personRoleId, orgUnitId } = req.body;
        
        const roleResult = await pool.query('SELECT p.name, pr.is_manager FROM person_roles pr JOIN people p ON pr.person_id = p.id WHERE pr.id = $1', [personRoleId]);
        if (roleResult.rows.length === 0) return res.status(404).json({ message: "User role not found." });
        
        const { name, is_manager } = roleResult.rows[0];
        const role = is_manager ? 'manager' : 'coworker';
        const filename = `cognitive_data_${orgUnitId}_${name}_${role}.json`;

        const query = `
            INSERT INTO surveys (person_role_id, survey_type, filename, survey_results, analysis_voxel, analysis_graphs, org_unit_id)
            VALUES ($1, 'individual', $2, $3, $4, $5, $6)
            ON CONFLICT (person_role_id) WHERE survey_type = 'individual'
            DO UPDATE SET
                filename = EXCLUDED.filename,
                survey_results = EXCLUDED.survey_results,
                analysis_voxel = EXCLUDED.analysis_voxel,
                analysis_graphs = EXCLUDED.analysis_graphs,
                org_unit_id = EXCLUDED.org_unit_id;
        `;
        const values = [personRoleId, filename, JSON.stringify(survey_results), JSON.stringify(analysis.voxel), JSON.stringify(analysis.graphs), orgUnitId];
        
        await pool.query(query, values);
        res.status(201).json({ message: 'Survey saved successfully', filename });
    } catch (error) { 
        console.error("Error saving survey to DB:", error);
        res.status(500).json({ message: 'Error saving survey.' }); 
    }
});

app.post('/api/calculate', async (req, res) => {
    try {
        const { personRoleId, orgUnitId } = req.body;
        
        const userResult = await pool.query('SELECT * FROM person_roles WHERE id = $1', [personRoleId]);
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
        const insertValues = [orgUnitId, newFilename, JSON.stringify(averagedSurveyResults), JSON.stringify(averagedData.analysis.voxel), JSON.stringify(averagedData.analysis.graphs)];
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
app.get('/api/org-data', async (req, res) => {
    try {
        const unitsQuery = pool.query('SELECT * FROM organization_units ORDER BY parent_id NULLS FIRST, name ASC');
        const peopleQuery = pool.query('SELECT id, name FROM people ORDER BY name ASC');
        const rolesQuery = pool.query('SELECT id, person_id, org_unit_id, is_manager FROM person_roles');

        const [unitsResult, peopleResult, rolesResult] = await Promise.all([unitsQuery, peopleQuery, rolesQuery]);

        res.json({ 
            units: unitsResult.rows, 
            people: peopleResult.rows,
            roles: rolesResult.rows 
        });
    } catch (error) { res.status(500).json({ message: 'Error fetching organization data.' }); }
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

// --- API ROUTES FOR PEOPLE & ROLES ---
app.post('/api/people', async (req, res) => {
    try {
        const { name } = req.body;
        if (name.toLowerCase() === 'admin') {
            return res.status(400).json({ message: 'This name is reserved.' });
        }
        const result = await pool.query('INSERT INTO people(name) VALUES($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *', [name]);
        res.status(201).json(result.rows[0]);
    } catch(e){ res.status(500).json({ message: 'Error creating person.' }); }
});

app.post('/api/roles', async (req, res) => {
    try {
        const { personId, orgUnitId, isManager } = req.body;
        const result = await pool.query('INSERT INTO person_roles(person_id, org_unit_id, is_manager) VALUES($1, $2, $3) RETURNING *', [personId, orgUnitId, isManager]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ message: 'Error: This person already has this exact role (manager/coworker) in this unit.' });
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
        
        const rootUnitResult = await pool.query('SELECT id FROM organization_units WHERE parent_id IS NULL');
        const rootUnitId = rootUnitResult.rows.length > 0 ? rootUnitResult.rows[0].id : null;

        const query = `
            SELECT 
                pr.id as "personRoleId",
                p.id as "personId", p.name, 
                pr.description,
                pr.is_manager, pr.org_unit_id,
                o.name as "orgUnitName",
                CASE WHEN pr.org_unit_id = $2 AND pr.is_manager = true THEN true ELSE false END as "isRootManager"
            FROM person_roles pr
            JOIN people p ON pr.person_id = p.id
            JOIN organization_units o ON pr.org_unit_id = o.id
            WHERE pr.id = $1
        `;
        const result = await pool.query(query, [personRoleId, rootUnitId]);
        
        if (result.rows.length === 0) return res.status(404).json({ message: 'Person role not found.' });
        
        res.json(result.rows[0]);
    } catch(e) {
        console.error('Error fetching person context:', e);
        res.status(500).json({ message: 'Error fetching person context.' })
    }
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
             const roleResult = await pool.query(`
                SELECT pr.id FROM person_roles pr
                JOIN organization_units ou ON pr.org_unit_id = ou.id
                WHERE pr.person_id = $1 AND pr.is_manager = true AND ou.parent_id IS NULL
            `, [personId]);

            if (roleResult.rows.length === 0) return res.status(403).json({ message: 'Permission denied: Only a root manager can edit the target.' });
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

// --- STATIC DATA ROUTES ---
app.get('/api/voxel-data', (req, res) => res.sendFile(path.join(dataDir, 'voxel_data.csv')));
app.get('/api/questions', (req, res) => res.sendFile(path.join(dataDir, 'questions.json')));

// --- START SERVER ---
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});


