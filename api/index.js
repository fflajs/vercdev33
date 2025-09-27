// api/index.js

// Force runtime to Node.js 22
export const config = {
  runtime: 'nodejs22.x',
};

// Simple handler, no Express, no serverless-http
export default function handler(req, res) {
  const flaValue = process.env.FLA;
  const flaExists = typeof flaValue !== 'undefined';

  console.log("🔍 FLA exists:", flaExists);
  console.log("📦 FLA value:", flaValue);

  res.status(200).json({
    message: 'Hello from Vercel!',
    flaExists,
    flaValue,
  });
}
// api/index.js

// Force runtime to Node.js 22
export const config = {
  runtime: 'nodejs22.x',
};

// Simple handler, no Express, no serverless-http
export default function handler(req, res) {
  const flaValue = process.env.FLA;
  const flaExists = typeof flaValue !== 'undefined';

  console.log("🔍 FLA exists:", flaExists);
  console.log("📦 FLA value:", flaValue);

  res.status(200).json({
    message: 'Hello from Vercel!',
    flaExists,
    flaValue,
  });
}

