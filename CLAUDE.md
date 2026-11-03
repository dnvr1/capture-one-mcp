# CLAUDE.md

Guidance for Claude Code (and any other agent — see [AGENTS.md](AGENTS.md),
which points here) when working in this repository.

## What this is

An MCP server that drives **Capture One Pro on macOS** over its AppleScript/JXA
scripting interface. It is not a wrapper around a stable API: every call is an
Apple Event to a live desktop app that is editing someone's real photo library.
Most of the complexity in this repo exists because of that, not because of MCP.

- Built against **Capture One 16.9.0.10** (`com.captureone.captureone16`).
  The vendored dictionary is `reference/CaptureOne-16.9.sdef`. Write paths were
  last validated live on 16.8.5; see the README's Target section.
- **43 tools**: 17 `read`, 2 `view`, 21 `data`, 3 `destructive`.
- TypeScript, ESM, Node 20+, no runtime deps beyond `@modelcontextprotocol/sdk`
  and `zod`.

User-facing documentation lives in [README.md](README.md). This file is for
whoever is *changing* the code.

## Commands

```sh
npm run build        # tsc -> dist/ (gitignored)
npm run typecheck    # tsc --noEmit
npm run verify       # typecheck + parse every embedded JXA block (43 currently)
npm test             # build + node --test tests/*.test.mjs (204 currently)
```

`npm run verify && npm test` is the gate for any change. Both are hermetic:
**the test suite never launches Capture One and never touches real photos.** It
replaces `child_process.execFile` with an in-memory application and runs the
generated JXA source through `vm`/`new Function`, so it validates the script
text you actually ship without an Apple Event.

These need the live app, with a document open, and are **not** part of the gate:

```sh
npm run verify:live  # resolve every generated property name against the app
npm run smoke        # drive the built server over stdio as a real MCP client
npm run verify:keywords -- "<keyword>"  # co_remove_keyword blast radius (testbed-locked)
```

Run `verify:live` after touching anything generated. A wrong JXA property name
fails as `"Can't convert types."`, which this codebase's defensive wrappers turn
into a silent `null` — that is exactly how `co_get_recipe` shipped reporting
`jpegQuality: null` for every recipe and nobody noticed for two phases.

## Layout

```
src/index.ts           stdio entry point
src/server.ts          all 43 tool registrations + risk gating (the one big file)
src/config.ts          risk tiers and the env-var gate
src/jxa/bridge.ts      osascript transport, document binding, error translation
src/jxa/health.ts      liveness probe: "not running" vs "events blocked"
src/co/                domain layer
  documents, collections, variants        reading and navigation
  edit, adjust, layers, process           writing
  candidates, preview, comparison         the candidate-editing workflow
  adjustment-properties.ts                GENERATED — do not hand-edit
  adjustment-ranges.ts                    GENERATED — do not hand-edit
  recipe-properties.ts                    GENERATED — do not hand-edit
scripts/               generators, guards, and live harnesses
tests/                 mocked regression suites (node:test)
docs/                  findings from probing the live app
reference/             vendored .sdef
```

`dist/` and `.testbed/` are gitignored. `.testbed/` holds real image metadata —
never commit it.

### Generated files

Regenerate, do not edit by hand:

```sh
python3 scripts/gen-dictionary.py     > docs/DICTIONARY.md
python3 scripts/gen-adjustments.py    > src/co/adjustment-properties.ts
python3 scripts/gen-recipes.py        > src/co/recipe-properties.ts
node scripts/verify-adjustments.mjs                        # probes the live app
node scripts/gen-adjustment-ranges.mjs > src/co/adjustment-ranges.ts
```

The Python generators read the vendored `.sdef`. `gen-adjustment-ranges.mjs`
reads `docs/adjustment-round-trip.json`, which comes from probing the running
app — the dictionary declares **no ranges at all**.

## Architecture and its invariants

These are not style preferences. Each one is here because the alternative
failed against the live app.

### 1. The bridge owns every Apple Event

All Capture One access goes through `runJxa` (or `runAppleScript` /
`readDocumentSettings`) in `src/jxa/bridge.ts`. Do not call `osascript` from a
domain module.

- **Script source goes in on stdin, never as an `-e` argv element.** argv cannot
  carry a NUL byte, so a script containing one died inside `execFile` with
  `ERR_INVALID_ARG_VALUE`, naming Node internals and never mentioning Capture
  One. stdin also removes the argv length ceiling on how many variant ids one
  call can carry.
- **No control characters in embedded script source.** `scripts/check-jxa.mjs`
  cooks each block and rejects them; a control character there is nearly always
  an escaping slip. Build separators with `JSON.stringify` on both sides rather
  than a literal `\0`.
- **Double every backslash in embedded JXA.** A body is a TS template literal,
  so `/^Error:\s*/` cooks to `/^Error:s*/` and `\/` to `/`. `check-jxa.mjs`
  parses the *cooked* text and rejects any lone backslash; write `\\s`.
- **Every state-changing call must pass `mutating: true`.** The timeout kills
  *our* osascript child, not the Apple Event — Capture One carries on
  processing/importing/renaming. `mutating` is what makes the timeout message
  say "inspect state before retrying" instead of "retry".
- **One osascript at a time.** `execOsascript` runs behind a process-wide FIFO
  lock; do not spawn a child any other way. After a `mutating` or
  `mutationInFlight` call times out the bridge is **busy**: every further
  mutating/in-flight call is refused with `BUSY` (reads still run) until
  `healthCheck`'s fixed-budget `app version` probe succeeds and calls
  `clearBusy`. Tests that provoke a mutating timeout on purpose must clear it.
- Timeouts translate to actionable text. A pending macOS automation-consent
  dialog blocks **every** Apple Event on the machine until a human clicks it,
  and nothing fails fast; that surfaces as `-1712` and must never leak raw.
- **Classify by marker, then by error number.** `classifyFailure` checks the
  server's own `CO_MCP_*` markers first (throw `CO_MCP_WRONG_DOCUMENT: ...` for
  any document mismatch), then only the `(-NNNN)` that ends osascript's error
  line. Never substring-search stderr: it contains user data (collection names,
  paths) and Capture One's own "not allowed" text.

### 2. Risk tiers gate registration, not execution

`src/config.ts` defines `read` / `view` / `data` / `destructive`. A tool above
the permitted tier is **not registered at all**, so it is invisible to the model
rather than present-and-failing.

| Tier | Gate |
| --- | --- |
| `read`, `view` | always available |
| `data` | `CAPTURE_ONE_MCP_ALLOW_WRITE=1` |
| `destructive` | the above **plus** `CAPTURE_ONE_MCP_ALLOW_DESTRUCTIVE=1` |

The same risk level derives the MCP `readOnlyHint` / `destructiveHint`
annotations, so clients see one consistent story. When adding a tool, pick the
tier by what it can touch, not by how likely it is to be used.

### 3. Document binding

Variant ids are small **per-document** integers (`641`, `3480`) and nothing ties
an id to its document. If the frontmost document changes between two calls — the
user clicking another window is enough — an id from one document resolves to a
different image in another and the write lands there silently.

`CAPTURE_ONE_MCP_DOCUMENT` is `unset` (no check), `auto` (latch onto the first
document actually touched, refuse every other one for the life of the process),
or a document id. `auto` is the recommendation. Binding happens through a shared
read-only probe *before* any operation body runs, survives a failure in the
operation that triggered it, and covers AppleScript settings reads too.

`co_status` deliberately does **not** bind — a health check must not claim the
server for a document. This is enforced by `observeOnly: true` in `RunOptions`,
which reads an existing binding but never creates one; `healthCheck` passes it.
Without that flag `runJxa` binds unconditionally, so the tool clients are told to
call first when anything times out latched the server onto whatever document
happened to be frontmost. `tests/document-pin.test.mjs` guards it.

The same flag goes on every **document-agnostic** call — `listDocuments`,
`listStyles` — and a structural test fails any `runJxa` body that never calls
`requireDoc`/`resolveTargets`/`resolveLayer` without it. `openDocument` also
runs `observeOnly` (binding first would latch the *previous* front document)
and then calls `bindOpenedDocument` with the id it opened; a bound server
refuses to open anything else. The binding probe has its own fixed 8 s budget.

The candidate-workflow tools (`co_create_candidates`, `co_render_preview`,
`co_compare_variants`) additionally require an explicit `document_id` argument
and re-check it, so they are safe even with binding off.

### 4. Writes are read back and reported honestly

Write tools return `{ requested, actual, matched }` per property. Two rules that
have already been broken once each:

- Only coerce `actual` when the read **succeeded**. Coercing a failed read turned
  `null` into `false`, so writing `false` reported `matched: true` having read
  nothing back.
- Unreadable values are `null` with the reason attached — in the entry's `note`,
  or an adjacent `adjustmentReadErrors` object. Never let a failed read look like
  a value, and never let one look like a plain mismatch either.

Both rules are covered for every writer by `tests/write-readback.test.mjs`, which
runs each shipped JXA body against an application whose reads fail. Until it
existed, reintroducing either bug left the whole suite green.

### 5. Editing tools never apply to "everything"

Each takes either explicit `variant_ids` or `use_current_selection: true`
(`toTarget` in `src/server.ts` enforces this), reports every id it could not
resolve in `notFound` rather than silently doing less, and returns exactly what
it changed.

Writing tools use `toEditTarget`, which adds `maxTargets`; `resolveTargets`
refuses more than that (explicit ids or selection) with `CO_MCP_REFUSED:` before
the body writes anything — that marker also suppresses the "may have partially
applied" advice, so only use it for checks that precede every write. Per-variant
loops wrap each variant in `try` and call `stopBatch` on a throw: record the
entry with `error`, stop, and return `status: "incomplete"` plus
`unattemptedIds`, as `createCandidates` does.

### 6. Bulk reads, because access pattern dominates

Each property access is one Apple Event. On the 138-variant test session,
`variants.parentImage.extension()` chained as one event costs **24ms** for all
138; the same data fetched per-image costs 2313ms; per-variant hydration is
~215ms *each*. Filters therefore read whole-specifier properties and chain
through relationships. Page hydration does the same up to `BULK_HYDRATE_MAX`
(2000) and falls back to per-variant reads beyond it or when the scope is a
plain array (`scope: "selection"`).

If you add a read, check whether it can be expressed as one whole-collection
event before writing a loop.

## Live-app facts you cannot infer from the dictionary

Do not "fix" these — each was verified against the running app and is documented
in `docs/`.

- **JXA folds a leading acronym.** `JPEG quality` → `jpegQuality`, not
  `JPEGQuality`; later words keep their case (`include GPS` → `includeGPS`).
  Getting it wrong is silent. See [docs/OUTPUT.md](docs/OUTPUT.md).
- **JXA cannot reach the document's settings objects at all.** `import
  settings`, `batch rename settings`, `export original settings` and friends
  fail with `"Can't convert types."` in JXA and succeed in AppleScript. That is
  why `runAppleScript` / `readDocumentSettings` exist.
- **Out-of-range error messages lie.** `level_highlight_rgb = 256` is rejected
  with "Cannot set this value above 1." The real ceiling is 255. Ranges are
  found by bisecting against the app, never by trusting the message.
  See [docs/ADJUSTMENTS.md](docs/ADJUSTMENTS.md).
- **`Application(...).version()` and `.running()` are answered locally by JXA
  without sending an Apple Event**, so they stay responsive when the event pipe
  is fully blocked and are useless as a liveness check. `app version` is the
  honest probe; that is what `co_status` uses.
- **Masks cannot be read.** Every mask operation is unverifiable by read-back;
  the tools say so rather than claiming success.
- **Keywords cannot be created via AppleScript** — no `make` responder, all
  properties read-only, every construction form tried and rejected. Hence
  `co_apply_keyword` requires an existing keyword, and `co_remove_keyword`
  remains **unverified** because none can be created to test against. It stops
  after the first removal if the keyword leaves the document's list; settle it
  with `npm run verify:keywords -- "<keyword>"` on a UI-added keyword.
- **Layers have no id** and are addressed by index; 0 is always the background
  layer, which rejects both name and opacity changes.
  See [docs/LAYERS.md](docs/LAYERS.md).
- **`variant.name` has no extension and is not unique** (a RAW+JPEG pair yields
  two variants named `DSC_1950`); **`variant.position` is position within a
  clone stack**, not a browser index; **`document.path` is the containing
  folder**; **`image.dimensions` is a `{x, y}` record**, not a string.

## Safety rules when touching the live app

This server edits a real photo library. The standing rules:

1. **Never point a write test at a client session or catalog.** Automated live
   testing uses one disposable session, nominated by the operator through
   `CAPTURE_ONE_MCP_TESTBED_DOCUMENT` (the document id, i.e. its folder path).
   `scripts/testbed.mjs`, `scripts/verify-adjustments.mjs` and
   `scripts/verify-keyword-removal.mjs` are **locked** to
   that one document and refuse any other rather than trusting the caller. The
   lock has no default: with the variable unset they refuse to run at all, before
   sending a single Apple Event, so an unconfigured machine cannot write anywhere.
   Reference performance figures in these docs come from a 138-variant session
   (69 RAW + 69 JPEG).
2. Snapshot before writing, restore after:
   ```sh
   node scripts/testbed.mjs snapshot   # flags, IPTC, keywords, selection,
                                       # all 83 adjustments, layers, 9 recipes
   node scripts/testbed.mjs diff
   node scripts/testbed.mjs restore
   ```
   The testbed talks to Capture One directly, not through the MCP server, so it
   still works when the server is read-only and cannot be broken by the code
   under test.
3. For the candidate/preview/compare workflow, use a **disposable session over
   copied RAWs** — the repeatable procedure is in
   [docs/WORKFLOW-VALIDATION.md](docs/WORKFLOW-VALIDATION.md).
4. **Recipes that overwrite originals.** `co_configure_recipe` refuses to *set*
   `existing_files: overwrite` at all without `CAPTURE_ONE_MCP_ALLOW_DESTRUCTIVE=1`,
   whatever the recipe is rooted at, and needs `acknowledge_overwrites_originals`
   as a second confirmation when the result would also be rooted at the image
   folder. Gating only the image-folder pairing left a recipe already rooted at a
   custom location — commonly the capture folder — armable with no opt-in, and an
   armed recipe outlives the session: the next Process in the UI uses it.
   `co_process_variants` evaluates the
   *resulting* recipe state (patch merged over current values), not the patch
   alone, and refuses `existing_files: overwrite` without
   `CAPTURE_ONE_MCP_ALLOW_DESTRUCTIVE=1` regardless of destination — custom
   paths and folder aliases can also reach originals. Unreadable or unknown
   existing-files behaviour is refused outright. When the recipe is omitted the
   current one is resolved and explicitly submitted, so another enabled recipe
   cannot bypass the check.
5. **A mutating timeout is not a failure.** The work may have completed. Inspect
   the document before retrying; never replay a batch blindly. `co_create_candidates`
   is additive and non-idempotent by design and says so in its result.

## Adding a tool

1. Put the JXA in a `src/co/*.ts` module, not in `server.ts`.
2. Register it in `src/server.ts` via the local `tool()` helper with an explicit
   risk tier and a zod schema. Validate arguments in the schema where possible;
   validate the whole patch **before** writing anything, so a bad value fails
   cleanly instead of leaving a variant half-adjusted.
3. Read back what you wrote and report `requested`/`actual`/`matched`.
4. Pass `mutating: true` for anything that changes state.
5. Add a mocked test under `tests/` that runs the real script text.
6. Update the tool table in `README.md` and the count in its status line.
7. `npm run verify && npm test`, then `npm run smoke` against the live app.

## Style

- Comments explain *why*, especially where the code looks wrong until you know
  what the app does. Match the existing density — this codebase carries a lot of
  hard-won context in comments and that is deliberate.
- Report limits honestly in tool descriptions and results. Several tools exist
  whose whole value is saying "this cannot be verified".
- Commit messages here are prose that explains the failure and the reasoning,
  not one-liners. Match that.
- End commit messages with the attribution lines the session specifies.

## Doc map

| File | What it holds |
| --- | --- |
| [README.md](README.md) | User-facing: tools, config, install |
| [docs/DICTIONARY.md](docs/DICTIONARY.md) | Generated digest of the .sdef |
| [docs/ADJUSTMENTS.md](docs/ADJUSTMENTS.md) | The 83 scalars, ranges, round-trip findings |
| [docs/LAYERS.md](docs/LAYERS.md) | Layers, masks, what is unverifiable |
| [docs/OUTPUT.md](docs/OUTPUT.md) | Recipes, processing, import, rename, the JXA naming trap |
| [docs/CANDIDATES.md](docs/CANDIDATES.md) | Native clone semantics and failure modes |
| [docs/PREVIEWS.md](docs/PREVIEWS.md) | Private recipe, bounds, cleanup rules |
| [docs/EDIT-PREVIEW-WORKFLOW.md](docs/EDIT-PREVIEW-WORKFLOW.md) | The edit/preview/compare/choose loop |
| [docs/WORKFLOW-VALIDATION.md](docs/WORKFLOW-VALIDATION.md) | Live validation evidence and its limits |
| [docs/FIX-REVIEW.md](docs/FIX-REVIEW.md) | Review notes for the hardening pass |
| [docs/TOOL-SURFACE.md](docs/TOOL-SURFACE.md) | **Historical** design doc; does not describe what shipped |
