const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', '.next', 'server');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
let patched = [];
for (const f of files) {
  const p = path.join(dir, f);
  let content = fs.readFileSync(p, 'utf8');
  if (content.includes('globalThis.webpackChunk_N_E') && !/module\.exports\s*=\s*/.test(content)) {
    const m = content.match(/\.push\(\s*\[\s*\[\s*(\d+)\s*\]/);
    if (m) {
      const id = Number(m[1]);
      const append = `\nif(typeof module!=="undefined"&&typeof module.exports!=="undefined"){try{module.exports={ids:[${id}]}}catch(e){}}\n`;
      fs.appendFileSync(p, append, 'utf8');
      patched.push({file: p, id});
    }
  }
}
console.log('patched files:', patched);
