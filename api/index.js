// api/index.js
import express from 'express';
import serverless from 'serverless-http';

const app = express();

app.get('/', (req, res) => {
  console.log("✅ Express route hit"); // This should show in Vercel logs
  res.json({ message: 'Hello from Express on Vercel!' });
});

export const handler = serverless(app);

