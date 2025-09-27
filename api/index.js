import express from 'express';
import { createServer } from 'http';
import { parse } from 'url';

const app = express();

// app.get('/', (req, res) => {
  // // console.log("✅ Express route hit"); // Vercel logs
  // // res.sendFile('index.html', { root: 'public' });
// // });

export default function handler(req, res) {
  console.log("✅ Express route hit"); // This WILL show in Vercel logs
  res.sendFile('index.html', { root: 'public' });
}


export default async function handler(req, res) {
  const parsedUrl = parse(req.url, true);
  await app(req, res);
}
