import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();

// Serve static files from /public
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, '../public')));

// Log and serve index.html
app.get('/', (req, res) => {
  console.log("✅ Express route hit"); // Vercel logs
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Export as Vercel handler
export default function handler(req, res) {
  app(req, res);
}

