const fs = require('fs');
const path = require('path');

const serverDir = path.join(__dirname, '..', '.next', 'server');
console.log('serverDir=', serverDir);

globalThis.webpackChunk_N_E = globalThis.webpackChunk_N_E || [];
const origPush = globalThis.webpackChunk_N_E.push.bind(globalThis.webpackChunk_N_E);
let found = false;

globalThis.webpackChunk_N_E.push = function(...args) {
  try {
    const data = args[0];
    // webpack push usually receives an array like [ids, modules, runtime]
    if (Array.isArray(data)) {
      // ok
    } else if (data && typeof data === 'object' && !Array.isArray(data)) {
      // sometimes runtime wrappers pass an object; inspect
      if (!('ids' in data) || !Array.isArray(data.ids)) {
        console.error('MALFORMED CHUNK PAYLOAD (object, missing ids array):', data);
        console.trace();
        found = true;
        process.exitCode = 3;
      }
    } else {
      console.error('MALFORMED CHUNK PAYLOAD (not array/object):', data);
      console.trace();
      found = true;
      process.exitCode = 3;
    }
  } catch (err) {
    console.error('Error inspecting chunk push:', err && err.stack || err);
  }
  return origPush(...args);
};

function requireIfExists(file) {
  try {
    require(file);
    console.log('required', file);
  } catch (err) {
    console.error('require failed', file, err && err.message);
  }
}

// Require top-level server files
const entries = fs.readdirSync(serverDir).filter(f => f.endsWith('.js'));
for (const e of entries) {
  requireIfExists(path.join(serverDir, e));
}

// Require chunks
const chunksDir = path.join(serverDir, 'chunks');
if (fs.existsSync(chunksDir)) {
  const chunks = fs.readdirSync(chunksDir).filter(f => f.endsWith('.js'));
  for (const c of chunks) {
    requireIfExists(path.join(chunksDir, c));
  }
}

if (!found) console.log('No malformed chunk pushes detected (no missing ids).');
else console.error('Detected malformed pushes.');

// keep exit code as set
process.on('exit', () => {
  if (process.exitCode && process.exitCode !== 0) console.error('Exiting with code', process.exitCode);
});
