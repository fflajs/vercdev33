const express = require('express');
const app = express();

// Define a simple route
app.get('/', (req, res) => {
  res.send('Hello, Vercel!');
});

// Export the app as a serverless function
module.exports = app;

