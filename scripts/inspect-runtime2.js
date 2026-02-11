const path = require('path');
const runtime = require(path.join(__dirname,'..','.next','server','webpack-runtime.js'));
globalThis.webpackChunk_N_E = globalThis.webpackChunk_N_E || [];
globalThis.webpackChunk_N_E.push = function(data){
  try{
    const chunk = { ids: data[0], modules: data[1], runtime: data[2] };
    runtime.C(chunk);
  }catch(e){
    console.error('install chunk failed', e);
  }
};
console.log('before keys', Object.keys(runtime.m).length);
try{
  require(path.join(__dirname,'..','.next','server','vendors.js'));
  console.log('required vendors');
}catch(e){
  console.error('require vendors failed', e && e.message);
}
try{
  require(path.join(__dirname,'..','.next','server','ai-libs.js'));
  console.log('required ai-libs');
}catch(e){
  console.error('require ai-libs failed', e && e.message);
}
try{
  require(path.join(__dirname,'..','.next','server','supabase.js'));
  console.log('required supabase');
}catch(e){
  console.error('require supabase failed', e && e.message);
}
console.log('after keys', Object.keys(runtime.m).length);
const keys = Object.keys(runtime.m).map(k=>Number(k)).filter(k=>!Number.isNaN(k)).sort((a,b)=>a-b);
console.log('sample keys', keys.slice(0,40));
console.log('min key', keys[0], 'max key', keys[keys.length-1]);
console.log('has 68838?', !!runtime.m[68838]);
