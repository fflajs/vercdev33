const express = require('express');
const serverless = require('serverless-http');

const app = express();
app.use(express.json());

// ✅ Log incoming requests
app.use((req, res, next) => {
  console.log(`✅ Received request: ${req.method} ${req.originalUrl}`);
  next();
});

// ✅ Minimal POST route for /people
app.post('/people', (req, res) => {
  console.log('✅ /people POST route hit');
  res.json({ message: 'People endpoint received your POST!' });
});

// ✅ Minimal GET route for testing
app.get('/db-test', (req, res) => {
  console.log('✅ /db-test route hit');
  res.json({ message: 'Minimal route working!' });
});

module.exports = serverless(app);

