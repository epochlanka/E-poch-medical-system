// `tsc` only emits .ts -> .js. Anything else the compiled server reads from beside its own code
// (e.g. the blank letter template) has to be copied into dist/ explicitly, or it exists in
// development (ts-node runs from src/) and silently vanishes in the production build.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ASSET_DIRS = ['src/modules/letters/assets'];

for (const rel of ASSET_DIRS) {
  const from = path.join(root, rel);
  const to = path.join(root, rel.replace(/^src/, 'dist'));
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(`copied ${rel} -> ${path.relative(root, to)}`);
}
