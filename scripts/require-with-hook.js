const Module = require('module');
const fs = require('fs');
const path = require('path');

const origLoader = Module._extensions['.js'];
Module._extensions['.js'] = function(module, filename) {
  try {
    if (filename.endsWith(path.join('.next','server','webpack-runtime.js'))) {
      let content = fs.readFileSync(filename, 'utf8');
      // Inject logging before the "for(var f=0;f<n.length;f++)e[n[f]]=1"
      const target = 'for(var f=0;f<n.length;f++)e[n[f]]=1';
      if (content.includes(target)) {
        const replacement = "if(!Array.isArray(n)){console.error('patched installChunk: chunk.ids is not an array:',n);}else{for(var f=0;f<n.length;f++)e[n[f]]=1}";
        content = content.replace(target, replacement);
        console.log('patched webpack-runtime.js in-memory');
      } else {
        console.log('target string not found in runtime, not patching');
      }
      return module._compile(content, filename);
    }
  } catch (err) {
    console.error('hook error', err && err.stack);
  }
  return origLoader(module, filename);
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
