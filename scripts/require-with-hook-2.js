const Module = require('module');
const fs = require('fs');
const path = require('path');

const origLoader = Module._extensions['.js'];
Module._extensions['.js'] = function(module, filename) {
  try {
    if (filename.endsWith(path.join('.next','server','webpack-runtime.js'))) {
      let content = fs.readFileSync(filename, 'utf8');
      const target = 'for(var f=0;f<n.length;f++)e[n[f]]=1';
      if (content.includes(target)) {
        const replacement = "if(!Array.isArray(n)){console.error('patched installChunk: chunk.ids is not an array:',n);}else{for(var f=0;f<n.length;f++)e[n[f]]=1}";
        content = content.replace(target, replacement);
        console.log('patched webpack-runtime.js in-memory');
      }
      return module._compile(content, filename);
    }
  } catch (err) {
    console.error('hook error', err && err.stack);
  }
  return origLoader(module, filename);
};

// Wrap Module._load to capture chunk requires
const origLoad = Module._load;
Module._load = function(request, parent, isMain) {
  try {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (resolved && resolved.includes(path.join('.next','server','chunks'))) {
      console.log('Requiring chunk file:', resolved);
      const exp = origLoad.apply(this, arguments);
      try {
        console.log(' -> chunk exports keys:', exp && Object.keys(exp));
      } catch (e) {
        console.log(' -> chunk export introspect failed', e && e.message);
      }
      return exp;
    }
  } catch (e) {
    // ignore resolution errors
  }
  return origLoad.apply(this, arguments);
};

// Now require the compiled document page
try {
  require('../.next/server/pages/_document.js');
  console.log('required _document successfully');
} catch (err) {
  console.error('require _document failed:');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
