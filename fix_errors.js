const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'app/packages/server/src/routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts'));

for (const file of files) {
  const filePath = path.join(routesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  let changed = false;

  // 1. Zod validation errors
  const before1 = content;
  content = content.replace(/\.send\(\{\s*error:\s*parsed\.error\.flatten\(\)\s*\}\)/g, 
    `.send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() })`);
  if (before1 !== content) changed = true;

  // 2. Simple string errors
  // .send({ error: 'something' }) or .send({ error: someVar })
  const before2 = content;
  content = content.replace(/\.send\(\{\s*error:\s*([^,}]+)\s*\}\)/g, (match, p1) => {
    // If it's already got success: false, skip
    if (match.includes('success:')) return match;
    return `.send({ success: false, error: ${p1} })`;
  });
  if (before2 !== content) changed = true;

  // 3. Multi-line or complex object with error at start
  const before3 = content;
  content = content.replace(/\.send\(\{\s*error:\s*([^,]+),/g, (match, p1) => {
    if (match.includes('success:')) return match;
    return `.send({ success: false, error: ${p1},`;
  });
  if (before3 !== content) changed = true;

  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
}
