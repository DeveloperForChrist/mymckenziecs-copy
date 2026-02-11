try {
  require('../.next/server/pages/_document.js');
  console.log('required _document successfully');
} catch (err) {
  console.error('require _document failed:');
  console.error(err && err.stack ? err.stack : err);
  if (err && err.stack) {
    // print first 40 lines
    console.error(err.stack.split('\n').slice(0,40).join('\n'));
  }
  process.exit(1);
}
