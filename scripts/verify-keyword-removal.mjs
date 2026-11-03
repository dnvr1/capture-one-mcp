#!/usr/bin/env node
/**
 * Live verification of co_remove_keyword's blast radius.
 *
 * Keywords cannot be created by script, so this has to start from a keyword
 * somebody added in the Capture One UI. Before running it, in the DISPOSABLE
 * test session, add one keyword to at least two images in the current
 * collection. Then:
 *
 *   export CAPTURE_ONE_MCP_TESTBED_DOCUMENT="/path/to/scratch session"
 *   npm run build
 *   node scripts/testbed.mjs snapshot
 *   node scripts/verify-keyword-removal.mjs "<keyword>"
 *
 * It removes the keyword from ONE variant through the shipped removeKeyword
 * (the same code the tool runs), then answers the three open questions:
 *
 *   1. Did that variant lose it?
 *   2. Did the other variant carrying it keep it?
 *   3. Is it still in the document's keyword list?
 *
 * and puts the keyword back on the first variant with applyKeyword if the
 * document still lists it. If the document lost it, nothing can put it back by
 * script; the script says so, and `testbed.mjs diff` against the snapshot
 * lists every variant whose keywords changed so you can re-add it in the UI.
 * (testbed restore does not restore keywords: it cannot create one.)
 *
 * Locked to CAPTURE_ONE_MCP_TESTBED_DOCUMENT exactly like scripts/testbed.mjs:
 * unset, or any other front document, and it refuses before writing anything.
 */
import { runJxa } from "../dist/jxa/bridge.js";
import { applyKeyword, removeKeyword } from "../dist/co/edit.js";

const ALLOWED_SESSION_ID = process.env["CAPTURE_ONE_MCP_TESTBED_DOCUMENT"]?.trim() ?? "";
if (!ALLOWED_SESSION_ID) {
  console.error(
    `REFUSING: CAPTURE_ONE_MCP_TESTBED_DOCUMENT is not set. This probe removes a real keyword\n` +
      `from a real variant, so it will not choose a document on its own. Point it at a\n` +
      `disposable session: export CAPTURE_ONE_MCP_TESTBED_DOCUMENT="/path/to/scratch session"`,
  );
  process.exit(2);
}
const KEYWORD = process.argv[2]?.trim();
if (!KEYWORD) {
  console.error(`Usage: node scripts/verify-keyword-removal.mjs "<keyword>"`);
  process.exit(2);
}

/** Who carries the keyword, read straight from the app, not through the code under test. */
async function census() {
  return runJxa(
    `
    const d = requireDoc();
    const wanted = String(args.keyword).toLowerCase();
    const has = (list) => list.some((k) => String(k.name()).toLowerCase() === wanted);
    const spec = d.variants;
    const ids = spec.id();
    const carriers = [];
    for (let i = 0; i < ids.length; i++) {
      try { if (has(spec[i].keywords())) carriers.push(String(ids[i])); } catch (e) {}
    }
    return {
      id: String(d.id()), name: String(d.name()),
      inDocument: has(d.keywords()),
      carriers: carriers,
    };
    `,
    { args: { keyword: KEYWORD }, timeoutMs: 120_000 },
  );
}

const before = await census();
if (before.id !== ALLOWED_SESSION_ID) {
  console.error(`REFUSING: front document is ${before.name} (${before.id}), not the test session.`);
  process.exit(2);
}
if (!before.inDocument || before.carriers.length < 2) {
  console.error(
    `REFUSING: need '${KEYWORD}' in the document's keyword list and on at least two variants in\n` +
      `the current collection. Found: in document = ${before.inDocument}, on variants = ` +
      `[${before.carriers.join(", ")}]. Add it to two images in the Capture One UI and rerun.`,
  );
  process.exit(2);
}

const [subject, witness] = before.carriers;
console.log(`Removing '${KEYWORD}' from variant ${subject}; watching variant ${witness} and the document.\n`);

const result = await removeKeyword({ variantIds: [subject] }, KEYWORD);
const after = await census();

const checks = [
  ["removed from the target variant", !after.carriers.includes(subject)],
  ["kept by the other variant", after.carriers.includes(witness)],
  ["kept in the document's keyword list", after.inDocument],
  ["tool's documentKeywordSurvives agrees with the app", result.documentKeywordSurvives === after.inDocument],
];
for (const [label, ok] of checks) console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
const lost = before.carriers.filter((id) => id !== subject && !after.carriers.includes(id));
if (lost.length) console.log(`\n  Non-target variants that lost the keyword: ${lost.join(", ")}`);

console.log(`\nTool result:\n${JSON.stringify(result, null, 2)}\n`);

if (after.inDocument) {
  await applyKeyword({ variantIds: [subject] }, KEYWORD);
  const restored = await census();
  console.log(
    restored.carriers.includes(subject)
      ? `Restored '${KEYWORD}' on variant ${subject}.`
      : `WARNING: re-applying '${KEYWORD}' to variant ${subject} did not take; restore the snapshot.`,
  );
} else {
  console.log(
    `'${KEYWORD}' is gone from the document, which no script can undo. Run\n` +
      `  node scripts/testbed.mjs diff\n` +
      `to list every variant whose keywords changed, and re-add it to them in the Capture One UI.`,
  );
}

const verified = checks.every(([, ok]) => ok);
console.log(
  verified
    ? `\nVERIFIED: co_remove_keyword removes from the targeted variant only. The UNVERIFIED notes in\n` +
        `README.md, CLAUDE.md, src/co/edit.ts and the tool description can be updated.`
    : `\nNOT VERIFIED: see the failures above. The tool's document-list guard is what limits the damage.`,
);
process.exit(verified ? 0 : 1);
