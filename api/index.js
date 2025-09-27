// api/index.js

// ff
// Correct runtime declaration
export const config = {
  runtime: 'nodejs',
};

// Minimal serverless handler
export default function handler(req, res) {
  const flaValue = process.env.FLA;
  const flaExists = typeof flaValue !== 'undefined';

  console.log("🔍 FLA exists:", flaExists);
  console.log("📦 FLA value:", flaValue);

  res.status(200).json({
    message: 'Hello from Vercel!',
    flaExists,
    flaValue,
    vercelEnv: process.env.VERCEL_ENV // shows "production" or "preview"
  });
}

