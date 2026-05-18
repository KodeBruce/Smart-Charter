const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// Replace 1: Remove startServer wrapper
content = content.replace(
  'async function startServer() {\n  const app = express();\n  const PORT = 3000;',
  'const app = express();\n  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;'
);

content = content.replace(
  'async function startServer() {\r\n  const app = express();\r\n  const PORT = 3000;',
  'const app = express();\r\n  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;'
);

// Replace 2: Conditional Vite start & export
const searchBlock = `  // Vite Middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(\`Server running on http://localhost:\${PORT}\`);
  });
}

startServer();`;

const replaceBlock = `  // Server Start & Vite Middleware
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    async function startLocalServer() {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      app.listen(PORT, "0.0.0.0", () => {
        console.log(\`Server running on http://localhost:\${PORT}\`);
      });
    }
    startLocalServer();
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    app.listen(PORT, "0.0.0.0", () => {
      console.log(\`Server running on http://localhost:\${PORT}\`);
    });
  }

export default app;`;

// Try with both \r\n and \n
content = content.replace(searchBlock, replaceBlock);
content = content.replace(searchBlock.replace(/\n/g, '\r\n'), replaceBlock.replace(/\n/g, '\r\n'));

fs.writeFileSync('server.ts', content, 'utf8');
console.log('Refactoring complete');
