const express = require('express');
const serverless = require('serverless-http');

const app = express();

app.use((req, res, next) => {
  console.log(`✅ Received request: ${req.method} ${req.originalUrl}`);
  next();
});

app.get('/', (req, res) => {
  console.log('✅ Root route hit');
  res.json({ message: 'Minimal route working!' });
});

module.exports = serverless(app);

