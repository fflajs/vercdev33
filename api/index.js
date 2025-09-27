import express from 'express';
const app = express();

app.get('/', (req, res) => {
  console.log("✅ Express route hit"); // Vercel log
  res.json({ message: 'Hello from Express on Vercel!' });
});

export default app;

