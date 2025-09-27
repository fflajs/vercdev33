// api/index.js
import express from 'express';
import serverless from 'serverless-http';

const app = express();

app.get('/', (req, res) => {
  const flaValue = process.env.FLA;
  const flaExists = typeof flaValue !== 'undefined';

  console.log("🔍 FLA exists:", flaExists);
  console.log("📦 FLA value:", flaValue);

  res.json({
    message: 'Hello from Express on Vercel!',
    flaExists,
    flaValue
  });
});

export default serverless(app);

