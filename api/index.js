// api/index.js
import express from 'express';
import serverless from 'serverless-http';

const app = express();

app.get('/', (req, res) => {
  console.log("✅ Express route hit"); // This will show in Vercel logs
  res.json({ message: 'Hello from Express on Vercel!' });
});

export default serverless(app); // ✅ Vercel expects this

