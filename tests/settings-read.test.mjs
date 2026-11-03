// Run after npm run build. No real osascript process or Apple Events are used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';

const ERR = '«ERR»';
let sequence = 0;

async function read(stdout, keys) {
  const originalExecFile = childProcess.execFile;
  const previous = process.env.CAPTURE_ONE_MCP_DOCUMENT;
  delete process.env.CAPTURE_ONE_MCP_DOCUMENT;
  const sources = [];
  childProcess.execFile = (_file, _args, _options, callback) => {
    const child = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.end = source => {
      sources.push(source);
      setImmediate(() => callback(null, stdout, ''));
    };
    return child;
  };
  syncBuiltinESMExports();
  try {
    const bridge = await import(`../dist/jxa/bridge.js?settings-test=${sequence++}`);
    return { settings: await bridge.readDocumentSettings('import settings', keys), source: sources[0] };
  } finally {
    childProcess.execFile = originalExecFile;
    if (previous === undefined) delete process.env.CAPTURE_ONE_MCP_DOCUMENT;
    else process.env.CAPTURE_ONE_MCP_DOCUMENT = previous;
    syncBuiltinESMExports();
  }
}

// Seen live on 16.9: an unset naming format is the last key, so the final tab
// was trimmed away with the newline and the value came back null, as if the
// read had failed.
test('an empty value at the end of the list is empty, not unreadable', async () => {
  const { settings } = await read('current location\t\t\n', ['type', 'folder', 'naming']);
  assert.deepEqual(settings, { type: 'current location', folder: '', naming: '' });
});

test('an empty value in the middle of the list stays empty', async () => {
  const { settings } = await read('a\t\tc\n', ['first', 'second', 'third']);
  assert.deepEqual(settings, { first: 'a', second: '', third: 'c' });
});

test('a read that failed is null wherever it sits', async () => {
  const { settings } = await read(`${ERR}\tb\t${ERR}\n`, ['first', 'second', 'third']);
  assert.deepEqual(settings, { first: null, second: 'b', third: null });
});

// The string form is what `as text` produces, so the check has to run first.
// This reads the generated AppleScript because nothing here can execute it;
// npm run smoke and co_get_import_settings cover the real behaviour.
test('missing value is tested before the text coercion that would hide it', async () => {
  const { source } = await read('x\n', ['destination folder']);
  const check = source.indexOf('if settingValue is missing value then');
  const coercion = source.indexOf('(settingValue as text)');
  assert.ok(check !== -1, 'generated script checks for missing value');
  assert.ok(coercion !== -1, 'generated script coerces the value');
  assert.ok(check < coercion, 'the check runs before the coercion');
  assert.doesNotMatch(source, /\(destination folder of import settings\) as text/);
});
