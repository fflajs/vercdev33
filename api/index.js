import express from 'express';

const app = express();

app.get('/', (req, res) => {
  console.log("✅ Express route hit"); // This WILL show in Vercel logs
  res.send(`
    <!DOCTYPE html>
    <html>
      <head><title>Vercel Express</title></head>
      <body>
        <h1>Hello from Express on Vercel!</h1>
        <script>
          console.log("👋 Hello from browser console");
        </script>
      </body>
    </html>
  `);
});

export default function handler(req, res) {
  app(req, res);
}

