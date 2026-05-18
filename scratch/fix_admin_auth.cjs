const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

const replacement = `let adminApp: App;
if (getApps().length === 0) {
  const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  let credentialObj;
  
  if (serviceAccountEnv) {
    try {
      const parsed = serviceAccountEnv.trim().startsWith('{') 
        ? JSON.parse(serviceAccountEnv) 
        : JSON.parse(Buffer.from(serviceAccountEnv, 'base64').toString('utf8'));
      credentialObj = cert(parsed);
    } catch (e) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT:", e);
    }
  }

  adminApp = initializeApp({
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
    ...(credentialObj ? { credential: credentialObj } : {})
  });
} else {
  adminApp = getApps()[0];
}`;

// Match everything from `let adminApp: App;` up to the closing `}` of the else block.
content = content.replace(/let adminApp: App;[\s\S]*?adminApp = getApps\(\)\[0\];\s*}/, replacement);

fs.writeFileSync('server.ts', content, 'utf8');
console.log('Successfully updated server.ts for Vercel Auth');
