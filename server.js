const express = require('express');
const path = require('path');

const app = express();
const port = 3000;

// Middleware to serve static files
app.use(express.static(path.join(__dirname, 'public')));

// HTML Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/about', (req, res) => {
  res.send('This is the About page!');
});

// API Route to get the current time
app.get('/api/time', (req, res) => {
  const data = {
    currentTime: new Date().toLocaleString(),
    location: 'Vienna, Austria'
  };
  res.json(data);
});

// Start the server
app.listen(port, () => {
  console.log(`Express server listening at http://localhost:${port}`);
});
