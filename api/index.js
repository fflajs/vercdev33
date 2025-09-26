const express = require('express');
const serverless = require('serverless-http');

const app = express();

// ✅ Log incoming request
app.use((req, res, next) => {
  console.log(`✅ Received request: ${req.method} ${req.originalUrl}`);
  next();
});

// ✅ Minimal route
app.get('/db-test', (req, res) => {
  console.log('✅ /db-test route hit');
  res.json({ message: 'Minimal route working!' });
});

module.exports = serverless(app);

