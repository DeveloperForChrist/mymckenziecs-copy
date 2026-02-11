const Module = require('module');
const fs = require('fs');
const path = require('path');

const origLoader = Module._extensions['.js'];
Module._extensions['.js'] = function(module, filename) {
  try {
    if (filename.endsWith(path.join('.next','server','webpack-runtime.js'))) {
      let content = fs.readFileSync(filename, 'utf8');
      const target1 = 'for(var f=0;f<n.length;f++)e[n[f]]=1';
      if (content.includes(target1)) {
        const replacement1 = "if(!Array.isArray(n)){console.error('patched installChunk: chunk.ids is not an array:',n);}else{for(var f=0;f<n.length;f++)e[n[f]]=1}";
        content = content.replace(target1, replacement1);
        console.log('patched webpack-runtime.js (installChunk) in-memory');
      }
      const target2 = 'e[o].call(a.exports,a,a.exports,t)';
      if (content.includes(target2)) {
        const replacement2 = "if(!e[o]){console.error('module not found in runtime modules for id:',o);throw new Error('module_missing:'+o);}e[o].call(a.exports,a,a.exports,t)";
        content = content.replace(target2, replacement2);
        console.log('patched webpack-runtime.js (module call) in-memory');
      }
      return module._compile(content, filename);
    }
  } catch (err) {
    console.error('hook error', err && err.stack);
  }
  return origLoader(module, filename);
};

// Wrap Module._load to capture requires under .next/server
const origLoad = Module._load;
Module._load = function(request, parent, isMain) {
  try {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (resolved && resolved.includes(path.join('.next','server'))) {
      console.log('Requiring server file:', resolved);
      const exp = origLoad.apply(this, arguments);
      try { console.log(' -> exports keys:', exp && Object.keys(exp)); } catch (e) { console.log(' -> exports introspect failed'); }
      return exp;
    }
  } catch (e) {}
  return origLoad.apply(this, arguments);
};

try {
  require('../.next/server/pages/_document.js');
  console.log('required _document successfully');
} catch (err) {
  console.error('require _document failed:');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
