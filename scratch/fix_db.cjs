const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// Add getDb function after adminApp initialization
const adminAppInit = `} else {
  adminApp = getApps()[0];
}`;

const getDbFunc = `
// Helper to get Firestore with correct Database ID
function getDb() {
  const dbId = process.env.VITE_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID;
  return dbId ? getFirestore(adminApp, dbId) : getFirestore(adminApp);
}
`;

if (!content.includes('function getDb()')) {
  content = content.replace(adminAppInit, adminAppInit + '\n' + getDbFunc);
}

// Replace all getFirestore(adminApp) with getDb()
content = content.replace(/getFirestore\(adminApp\)/g, 'getDb()');

fs.writeFileSync('server.ts', content, 'utf8');
console.log('Fixed getFirestore calls');
