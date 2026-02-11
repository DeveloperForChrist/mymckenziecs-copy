const path = require('path');
const runtime = require(path.join(__dirname,'..','.next','server','webpack-runtime.js'));
console.log('runtime keys before:', Object.keys(runtime.m).slice(0,10).length, 'total');
console.log('has 68838 before?', !!runtime.m[68838]);
try{
  require(path.join(__dirname,'..','.next','server','vendors.js'));
  console.log('required vendors.js');
}catch(e){console.error('require vendors failed', e && e.message)}
console.log('runtime keys after:', Object.keys(runtime.m).length);
console.log('has 68838 after?', !!runtime.m[68838]);
