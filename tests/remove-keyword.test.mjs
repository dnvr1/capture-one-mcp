import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// co_remove_keyword has never run against a real keyword (none can be created by
// script), so whether deleting a variant's keyword also deletes the document's is
// unknown. The body guards that instead of trusting it: after the first variant
// that actually loses the keyword it re-reads the document's list, and stops the
// batch if the keyword has gone. These tests run the shipped JXA against a fake
// application that behaves either way. No osascript, no Capture One, no photos.

function bodyOf(file, fnName) {
  const source = ts.createSourceFile(file, readFileSync(new URL(`../src/co/${file}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === fnName);
  assert.ok(fn, `${fnName} not found in ${file}`);
  let body;
  const walk = node => {
    if (!body && ts.isCallExpression(node) && node.expression.getText(source).startsWith('runJxa')) body = node.arguments[0].text;
    ts.forEachChild(node, walk);
  };
  walk(fn);
  assert.ok(body, `no runJxa body in ${fnName}`);
  return body;
}

const BODY = bodyOf('edit.ts', 'removeKeyword');

/**
 * A document with `docKeywords` in its list and variants carrying the named
 * keywords. `leaky` makes deleting a variant's keyword also delete the
 * document's -- the outcome the guard exists for. `ignoreDeletes` makes delete
 * a silent no-op, the way this app ignores some writes.
 */
function fakeApp({ docKeywords, variants, leaky = false, ignoreDeletes = false, unreadableAfterDelete = false }) {
  const doc = { list: docKeywords.map(name => ({ name: () => name })) };
  const vs = variants.map(([id, names]) => {
    const v = { id: () => id, deleted: false };
    v.list = names.map(name => ({ name: () => name, owner: v }));
    v.keywords = () => {
      if (unreadableAfterDelete && v.deleted) throw new Error("Can't convert types.");
      return v.list.slice();
    };
    return v;
  });
  const co = {
    deleted: [],
    delete(kw) {
      co.deleted.push(String(kw.owner.id()));
      if (ignoreDeletes) return;
      kw.owner.deleted = true;
      kw.owner.list = kw.owner.list.filter(k => k !== kw);
      if (leaky) {
        const n = kw.name().toLowerCase();
        doc.list = doc.list.filter(k => k.name().toLowerCase() !== n);
        // The real blast radius would reach every variant; model that too.
        for (const other of vs) other.list = other.list.filter(k => k.name().toLowerCase() !== n);
      }
    },
  };
  const d = { keywords: () => doc.list.slice() };
  return { co, d, vs };
}

function run(app, keyword, targetIds) {
  const targets = targetIds ? app.vs.filter(v => targetIds.includes(v.id())) : app.vs;
  const stopBatch = (ts_, t, e) => ({ entry: { id: ts_[t].id(), error: String(e) }, unattemptedIds: ts_.slice(t + 1).map(v => v.id()), guidance: 'stopped' });
  return new Function('args', 'co', 'resolveTargets', 'describeVariant', 'stopBatch', BODY)(
    { target: {}, keyword },
    app.co,
    () => ({ doc: app.d, targets, notFound: [] }),
    v => ({ id: String(v.id()) }),
    stopBatch,
  );
}

test('co_remove_keyword: the expected case removes from targets only and confirms it', () => {
  const app = fakeApp({ docKeywords: ['Beach'], variants: [['1', ['Beach']], ['2', ['Beach']], ['3', ['Beach']]] });
  const out = run(app, 'beach', ['1', '2']);
  assert.equal(out.status, 'complete');
  assert.equal(out.documentKeywordBefore, true);
  assert.equal(out.documentKeywordSurvives, true);
  assert.equal(out.stoppedBecause, undefined);
  assert.deepEqual(out.affected.map(a => a.readBack), [{ keywordStillPresent: false }, { keywordStillPresent: false }]);
  assert.deepEqual(app.vs[2].list.map(k => k.name()), ['Beach'], 'a non-target keeps the keyword');
});

test('co_remove_keyword: stops after one variant when the delete also empties the document list', () => {
  const app = fakeApp({ docKeywords: ['Beach'], variants: [['1', ['Beach']], ['2', ['Beach']], ['3', ['Beach']]], leaky: true });
  const out = run(app, 'Beach');
  assert.equal(out.status, 'incomplete');
  assert.equal(out.stoppedBecause, 'document_keyword_removed');
  assert.equal(out.documentKeywordBefore, true);
  assert.equal(out.documentKeywordSurvives, false);
  assert.deepEqual(app.co.deleted, ['1'], 'no further deletes after the leak is seen');
  assert.equal(out.affected.length, 1);
  assert.deepEqual(out.unattemptedIds, ['2', '3']);
  assert.match(out.guidance, /document's keyword list/);
});

test('co_remove_keyword: variants without the keyword do not trigger or consume the document check', () => {
  const app = fakeApp({ docKeywords: ['Beach'], variants: [['1', []], ['2', ['Beach']], ['3', ['Beach']]], leaky: true });
  const out = run(app, 'Beach');
  assert.equal(out.affected[0].changes.keywordRemoved, null);
  assert.equal(out.affected[0].readBack, undefined, 'nothing deleted, nothing to read back');
  assert.deepEqual(app.co.deleted, ['2'], 'the check runs after the first ACTUAL removal');
  assert.deepEqual(out.unattemptedIds, ['3']);
});

test('co_remove_keyword: a delete the app ignores is reported, not claimed', () => {
  const app = fakeApp({ docKeywords: ['Beach'], variants: [['1', ['Beach']]], ignoreDeletes: true });
  const out = run(app, 'Beach');
  assert.deepEqual(out.affected[0].readBack, { keywordStillPresent: true });
});

test('co_remove_keyword: an unreadable read-back is null with its reason, never false', () => {
  const app = fakeApp({ docKeywords: ['Beach'], variants: [['1', ['Beach']]], unreadableAfterDelete: true });
  const out = run(app, 'Beach');
  assert.equal(out.affected[0].readBack.keywordStillPresent, null);
  assert.match(out.affected[0].readBack.error, /Can't convert types/);
});

test('co_remove_keyword: a keyword the document never listed is not reported as destroyed', () => {
  const app = fakeApp({ docKeywords: [], variants: [['1', ['Beach']], ['2', ['Beach']]] });
  const out = run(app, 'Beach');
  assert.equal(out.status, 'complete');
  assert.equal(out.documentKeywordBefore, false);
  assert.equal(out.documentKeywordSurvives, false);
  assert.equal(out.stoppedBecause, undefined, 'no document entry, so nothing to have leaked');
  assert.deepEqual(app.co.deleted, ['1', '2']);
});
