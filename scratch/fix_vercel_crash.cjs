const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// Remove top-level Vite import
content = content.replace(/import\s+{\s*createServer\s+as\s+createViteServer\s*}\s+from\s+["']vite["'];?\n?/, '');

// Dynamically import Vite inside startLocalServer
const target = `    async function startLocalServer() {
      const vite = await createViteServer({`;

const replacement = `    async function startLocalServer() {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({`;

content = content.replace(target, replacement);

fs.writeFileSync('server.ts', content, 'utf8');

let apiIndex = fs.readFileSync('api/index.ts', 'utf8');
apiIndex = apiIndex.replace(/import app from '\.\.\/server';/, "import app from '../server.js';");
fs.writeFileSync('api/index.ts', apiIndex, 'utf8');

console.log('Fixed Vercel crash issues');
