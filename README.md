# capture-one-mcp

[![gate](https://github.com/byjustinjones/capture-one-mcp/actions/workflows/gate.yml/badge.svg)](https://github.com/byjustinjones/capture-one-mcp/actions/workflows/gate.yml)

An MCP server that drives **Capture One Pro** on macOS through its
AppleScript/JXA scripting interface — sessions and catalogs, collections,
variants, adjustments, layers, recipes and output.

Status: **complete through Phase 5** — 43 tools. Reading and navigation, ratings
and metadata, the full adjustment surface, layers and masks including AI people
masking, and output: recipes, processing with queue polling, import and batch
rename, plus a non-destructive candidate/preview/compare workflow. Tethered
capture is deliberately out of scope — see
[docs/TOOL-SURFACE.md](docs/TOOL-SURFACE.md).

Findings from verifying against the live app:
[adjustments](docs/ADJUSTMENTS.md) · [layers and masks](docs/LAYERS.md) ·
[output, import and rename](docs/OUTPUT.md)

## Target

Built against the dictionary of the installed app:

| | |
| --- | --- |
| App | Capture One 16.8.5.30 |
| Bundle id | `com.captureone.captureone16` |
| Dictionary | [`reference/CaptureOne-16.8.5.sdef`](reference/CaptureOne-16.8.5.sdef) |
| Digest | [`docs/DICTIONARY.md`](docs/DICTIONARY.md) |

Regenerate the digest against whatever build is installed:

```sh
python3 scripts/gen-dictionary.py > docs/DICTIONARY.md
```

## Install

```sh
npm install && npm run build
```

Register it with an MCP client, e.g. Claude Code:

```sh
claude mcp add capture-one -- node /absolute/path/to/capture-one-mcp/dist/index.js
```

Verify it end to end against whatever Capture One has open:

```sh
npm test             # build + mocked regression tests; never controls Capture One
npm run verify       # typecheck + validate every embedded JXA block parses
npm run verify:live  # resolve every generated property name against the running app
npm run smoke        # drive the built server over stdio as a real MCP client
```

`verify:live` needs Capture One running with a document open. It exists because
a wrong JXA property name fails as `"Can't convert types."`, which this
codebase's defensive wrappers turn into a silent `null` — see
[docs/OUTPUT.md](docs/OUTPUT.md).

## Tools

These tools are always available; none of them modifies image data.

| Tool | What it does |
| --- | --- |
| `co_status` | Running state, whether Apple Events are actually getting through, version/tier, open document, and `busy`. Call this first if anything times out; it is also what clears `busy`. |
| `co_list_documents` | Open sessions and catalogs, and which is frontmost |
| `co_get_document` | Paths, session folders, naming tokens, counters, queue depth |
| `co_list_collections` | Albums, projects, groups, smart albums, folders, favorites |
| `co_set_current_collection` | Focus a collection in the browser |
| `co_list_variants` | Find images — filter by rating, color tag, pick, filename, extension; paginated. `scope: "document"` is the *current collection* (Capture One has no document-wide variant list), so make All Images or the session folder current first |
| `co_get_variant` | Full detail for one variant: EXIF, adjustments, crop, metadata, keywords, layers, outputs |
| `co_list_recipes` / `co_get_recipe` | Output recipes and their full settings |
| `co_get_import_settings` | The document's import destination and naming, read without importing |
| `co_list_styles` | Available style and preset names |
| `co_list_keywords` | Keywords in the current document |
| `co_list_adjustments` | The 83 adjustment properties with types and measured ranges |
| `co_list_layers` | Layers on variants, with luma-range settings and all registered scalar adjustments |
| `co_list_recipe_properties` | The 40 writable recipe properties |
| `co_process_queue_status` | Depth of the processing queue |
| `co_variant_output_files` | Files previously written, and whether they still exist |
| `co_compare_variants` | Readable differences between a source variant and a candidate clone |
| `co_select_variants` | Change the Capture One selection (view state only) |

`co_open_document` is in the write tier rather than the read tier: opening an
older document can trigger an irreversible format migration, and it changes
which document later variant ids resolve against. With document binding on (see
[Binding to a document](#binding-to-a-document)), an unbound `auto` server binds
to the document it opens — never to whatever was frontmost before — and a bound
server (auto or a fixed id) refuses to open any other document, with
`WRONG_DOCUMENT`.

`co_get_variant` reads all registered scalar adjustments on the variant and its
layers; `co_list_layers` reads those same settings on each layer. Adjustment keys
remain camelCase (for example, `levelMidtoneRgb`); map these through
`co_list_adjustments` to the snake_case parameters accepted by the write tools.
Unavailable values are `null`, with details in the adjacent `adjustmentReadErrors`
object. Check these errors before treating a snapshot as complete, and never
restore null values. These reads cover the scalar registry, not masks or structured
adjustments such as curves/color-editor settings; they cannot establish full style
or image equivalence. Reads are sequential, so avoid editing during a snapshot.

Editing tools, hidden unless `CAPTURE_ONE_MCP_ALLOW_WRITE=1`:

| Tool | What it does |
| --- | --- |
| `co_set_flags` | Rating (0–5), color tag, pick flag |
| `co_set_metadata` | IPTC fields — headline, description, creator, copyright, rights, title, instructions, city/state/country |
| `co_apply_keyword` | Apply an **existing** keyword (see limitation below) |
| `co_remove_keyword` | Remove a keyword from variants (**unverified** — see below) |
| `co_adjust_variants` | Any of the 83 adjustment properties, range-validated and read back |
| `co_adjust_layer` | The same, applied to a single layer |
| `co_create_layer` | Create adjustment layers |
| `co_set_layer` | Name, enabled, opacity |
| `co_mask_edit` | Invert, fill, feather, refine — **not verifiable**, see below |
| `co_copy_mask` | Copy a mask between layers |
| `co_set_luma_range` / `co_clear_luma_range` | Layer mask luma range |
| `co_apply_style_to_layer` | Apply a named style to a layer |
| `co_create_people_mask` | AI people masking |
| `co_configure_recipe` | Recipe settings, validated and read back |
| `co_process_variants` | Render to disk, polling the queue and reporting the files written |
| `co_export_originals` | Copy originals out |
| `co_import_images` | Import image files (paths validated; `require_destination_type` refuses before importing if the destination differs) |
| `co_create_candidates` | Clone variants into editable candidates, preserving existing edits |
| `co_render_preview` | Render one variant to a bounded sRGB JPEG returned as an MCP image; optionally also saved to `output_path` (`return_image: false` for metadata only) |
| `co_open_document` | Open a session or catalog by path |

`co_process_variants` checks the effective recipe before submitting work. Recipes
with `existing_files: overwrite` require `CAPTURE_ONE_MCP_ALLOW_DESTRUCTIVE=1`
as well, regardless of destination: custom paths and folder aliases can also
reach originals. `add suffix` and `skip` recipes need ordinary write access only.
Unreadable or unknown existing-files behavior is refused. When the recipe is
omitted, the current recipe is resolved and explicitly submitted so another
enabled recipe cannot bypass the check.

Requiring `CAPTURE_ONE_MCP_ALLOW_DESTRUCTIVE=1` as well:

| Tool | What it does |
| --- | --- |
| `co_mask_replace` | Clear, fill or rasterize a mask — not undoable |
| `co_delete_layer` | Delete a layer (never the background layer) |
| `co_batch_rename` | Rename original files on disk — not undoable |

Editing tools never apply to the whole document implicitly: each requires either
explicit `variant_ids` or `use_current_selection: true`, reports every id it
could not resolve rather than silently doing less, and returns exactly what it
changed.

Each call touches at most `CAPTURE_ONE_MCP_MAX_TARGETS` variants (default 500),
counting the current selection too; a larger request is refused before anything
is written. Tools that write variant by variant (`co_set_flags`,
`co_set_metadata`, `co_remove_keyword`, `co_adjust_variants`, `co_create_layer`,
`co_create_people_mask`) return `status: "complete"` or, when one variant throws
partway, `status: "incomplete"` with the entries already written, the failed
variant's `error`, and `unattemptedIds` — rather than an error that loses the
record of what changed.

### Keywords cannot be created via AppleScript

Capture One 16.8.5 exposes no way to create a keyword. The `keyword` class
declares no `make` responder, all three of its properties are read-only, and
`apply keyword` documents its parameter as "an existing keyword object". Every
construction form was tried against the live app — `make` at the document, at a
variant, at a keywords element, `with properties` and `with data` — and all fail
with *"You cannot set or change this property of this object"* or *"AppleEvent
handler failed"*. Keywords must be added in the Capture One UI, or imported into
a keyword library from a file.

Consequently `co_remove_keyword` is implemented but **has not been verified
against a real keyword** — the standing test session has none and none can be
created, so its blast radius (whether deleting a variant's keyword also removes
it from the document) is unconfirmed. Until it is, the tool guards it rather than trusting it:

- After the first variant that actually loses the keyword, it re-reads the
  document's keyword list. If the keyword has gone from there too, it stops with
  `status: "incomplete"`, `stoppedBecause: "document_keyword_removed"` and the
  rest of the targets in `unattemptedIds`, so a wrong guess costs one variant,
  not the whole selection.
- Each removal is read back per variant (`readBack.keywordStillPresent`).
- It reports `documentKeywordBefore` next to `documentKeywordSurvives`, so a
  keyword that was never in the document's list doesn't look destroyed.

To settle the question on a Mac, add one keyword to two images in a disposable
session through the UI and run `npm run verify:keywords -- "<keyword>"` with
`CAPTURE_ONE_MCP_TESTBED_DOCUMENT` set (see
[scripts/verify-keyword-removal.mjs](scripts/verify-keyword-removal.mjs)). It
removes the keyword from one image, checks the other image and the document
kept it, and puts it back.

## Candidate editing workflow

Non-destructive trial edits: clone a variant, edit the clone, look at it, and
keep whichever one you prefer. Nothing is overwritten and nothing is deleted.

| Step | Tool |
| --- | --- |
| Clone the originals | `co_create_candidates` — native Capture One clones, so existing edits carry over |
| Edit the candidates | `co_adjust_variants` / `co_adjust_layer`, targeting **candidate** ids |
| Look at the result | `co_render_preview` — bounded sRGB JPEG, returned as an MCP image |
| See what changed | `co_compare_variants` — readable differences, with its own coverage limits |
| Choose | Keep the candidate id, or go back to the source id. Both variants remain. |

All three require the expected `document_id` and re-check it, so they stay safe
even with document binding off. `co_create_candidates` is additive and **not**
idempotent: an incomplete result must be inspected before any retry, or you get
duplicate copies. `co_render_preview` needs write access — it creates a private
temporary recipe and submits processing — though it never changes image
adjustments.

Comparison is deliberately conservative. It covers the scalar adjustment
registry, crop, lens correction, flags, metadata, engine, processing mode, style
names and keywords; it cannot see masks, curves, luma ranges or colour-editor
structures, and layers are paired by position because they have no id. **No
differences does not mean identical edits or identical appearance**, and the
tool says so in its own result.

See [the workflow guide](docs/EDIT-PREVIEW-WORKFLOW.md),
[candidate details](docs/CANDIDATES.md) and [preview limits](docs/PREVIEWS.md).
The workflow passed automated and live tests on Capture One Pro 16.8.5 using
five copied RAWs — [validation evidence and limits](docs/WORKFLOW-VALIDATION.md).

## Testing

All live testing runs against one disposable session that you nominate, and
client sessions and catalogs are never touched. The harnesses will not choose a
document on their own: set `CAPTURE_ONE_MCP_TESTBED_DOCUMENT` to the document id
of a session you are willing to have modified, and both `scripts/testbed.mjs` and
`scripts/verify-adjustments.mjs` refuse to run against anything else — including
refusing outright when the variable is unset.

```sh
export CAPTURE_ONE_MCP_TESTBED_DOCUMENT="/path/to/a scratch session"
```

The reference figures below come from a 138-variant session (69 RAW + 69 JPEG).

Because Phase 2 writes to real variant state, `scripts/testbed.mjs` records and
restores it. It talks to Capture One directly rather than through the MCP
server, so it keeps working when the server is read-only and cannot be broken by
the code under test, and it is **hard-locked to that one session path** — it
refuses to run against any other document rather than trusting the caller.

```sh
node scripts/testbed.mjs snapshot   # ratings, tags, picks, IPTC, keywords, selection,
                                    # all 83 adjustments, layers, and all 9 recipes
node scripts/testbed.mjs diff       # what has changed since
node scripts/testbed.mjs restore    # put it all back, then re-verify
```

Snapshots land in `.testbed/` (gitignored — it contains real image metadata).

## Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `CAPTURE_ONE_MCP_ALLOW_WRITE` | unset | Enables the editing tools. Read-only until set. |
| `CAPTURE_ONE_MCP_ALLOW_DESTRUCTIVE` | unset | Additionally enables irreversible verbs. Requires the above. |
| `CAPTURE_ONE_MCP_MAX_VARIANTS` | `500` | Cap on variants returned in one call |
| `CAPTURE_ONE_MCP_MAX_TARGETS` | `500` | Cap on variants one editing call may touch, via `variant_ids` or the current selection. Over it is refused before any write, never truncated |
| `CAPTURE_ONE_MCP_TIMEOUT_MS` | `20000` | Fallback Apple Event budget for calls that set none |
| `CAPTURE_ONE_MCP_DOCUMENT` | unset | `auto` binds through a shared read-only probe before operations run; a document id binds to that one; unset disables the check |

### Binding to a document

Variant ids are small per-document integers (`641`, `3480`), and nothing in the
scripting interface ties an id to the document it came from. If the frontmost
document changes between two calls — clicking another Capture One window is
enough — an id read from one document can resolve to a completely different
variant in another, and a write lands there silently.

Three modes:

| `CAPTURE_ONE_MCP_DOCUMENT` | Behaviour |
| --- | --- |
| unset | No check. Only safe when exactly one document is ever open. |
| `auto` | **Recommended.** Binds to the first document the server actually touches, then refuses any other for the life of the process. |
| a document id | Binds to that specific document, whatever is open. |

`auto` needs no path up front and follows whatever you are working on, while
still converting "silently edited the wrong catalog" into a refusal. The binding
lasts for the life of the process, so **reconnect the server when you switch to a
different session or catalog** — in Claude Code, `/mcp` → reconnect.

A document id is the document's own folder path, e.g.
`/Volumes/Photos/a session folder`. `co_status` reports the current
binding and warns when it does not match the front document. Note that
`co_status` itself does not bind — a health check should not claim the server —
and neither do `co_list_documents` and `co_list_styles`, which are about the app
rather than one document. `co_open_document` binds to the document it opened.

Tools above their permitted risk level are not registered at all, so a blocked
tool is invisible to the model rather than present-and-failing.

## Requirements

- macOS with Capture One installed and **running**
- Node 20+
- Automation permission: the process hosting this server must be allowed to
  control Capture One (System Settings → Privacy & Security → Automation)

Some verbs are gated by Capture One's licence tier — the dictionary marks
`process` as **PRO only** and `autocrop` as **Cultural Heritage only**.

## Notes on the Apple Event layer

Two behaviours worth knowing, both verified against the installed app rather
than assumed:

- `Application("Capture One").version()` and `.running()` are answered by JXA
  from the app bundle **without sending an Apple Event**. They stay responsive
  even when the event pipe is completely blocked, so they are useless as a
  liveness check. `app version` is served by Capture One's own handler and is
  the honest probe — that is what `co_status` uses.
- A pending macOS automation-consent dialog blocks **every** Apple Event on the
  machine until someone clicks it. Nothing fails fast; calls just sit until the
  Apple Event timeout (`-1712`). `src/jxa/bridge.ts` imposes its own wall-clock
  budget and translates this into an actionable message.
- **Errors carry a code**: `NOT_RUNNING`, `NOT_AUTHORIZED`, `TIMEOUT`,
  `NO_DOCUMENT`, `WRONG_DOCUMENT`, `BUSY` or `SCRIPT_ERROR` (`co_status`
  additionally reports `EVENTS_BLOCKED` when the app runs but its probe times
  out). osascript failures are classified only by the error number ending the
  error line (`-1712`, `-1743`, `-600`/`-609`), after the server's own markers,
  so a collection or path that merely contains such a number is not
  misclassified. Any failure of a state-changing call — not only a timeout —
  says it may have partially applied.
- **One Apple Event at a time.** The bridge runs a single osascript child at a
  time, in FIFO order, across the whole process, so concurrent tool calls queue
  rather than race inside Capture One. A call's timeout starts when its child is
  spawned, not while it waits its turn.
- **`BUSY` after a state-changing timeout.** When a call that changes state (or
  a read inside an operation that already submitted work) times out, Capture One
  may still be carrying it out. The server then refuses every further
  state-changing call with error `BUSY`; reads still work. `co_status` probes
  the app with a fixed 8-second `app version` call and, if it answers, clears
  `busy` and reports what it cleared in `busyCleared`. That only proves the app
  responds again — inspect the affected variants, queue or output files before
  retrying the call that timed out.

## Notes on the variant model

Verified against a real 138-variant session (69 NEF + 69 JPG), not assumed:

- **`variant.name` has no file extension and is not unique.** A RAW+JPEG pair
  produces two variants both named `DSC_1950`. Extension is what makes a row
  identifiable, so `co_list_variants` always returns it. An early version
  filtered on a suffix of `name` and matched nothing at all.
- **`variant.position` is the position within a clone stack, not an index in
  the collection** -- it is `1` for every unstacked variant. Exposed as
  `positionInStack` so it cannot be mistaken for a browser index.
- **`document.path` is the folder *containing* the document**, not the document
  itself. `co_get_document` also returns `documentPath` and `folder`.
- **`image.dimensions` is a point record `{x, y}`**, not a string; it stringifies
  to `[object Object]` if treated as one. Returned as `{width, height}`.

### Why bulk reads

Each property access is one Apple Event, so the access pattern dominates
everything. Measured on the 138-variant session:

| Access pattern | Cost |
| --- | --- |
| `variants.parentImage.extension()` — chained, one event | **24ms** for all 138 |
| fetch images then `.map(i => i.extension())` | 2313ms for the same data |
| per-variant hydration | ~215ms **each** |

So the filter pass reads whole-specifier properties, chaining through
relationships where needed, and stays flat regardless of collection size.
Page hydration uses the same trick while the scope is modest and falls back to
per-variant reads past `BULK_HYDRATE_MAX` (2000) or when the scope is a plain
array (`scope: "selection"`).

End-to-end result on that session:

| Call | Time |
| --- | --- |
| all 138 rows, no extra fields | 280ms |
| 20 rows + EXIF | 585ms (was 4295ms) |
| all 138 rows + EXIF, crop, adjustments, metadata | 3968ms |

## Layout

```
src/index.ts        stdio entry point
src/server.ts       tool registration + risk gating
src/config.ts       risk levels and the env-var gate
src/jxa/bridge.ts   osascript transport, timeouts, error translation
src/jxa/health.ts   liveness probe that separates "not running" from "blocked"
src/co/             domain layer:
                      documents, collections, variants  — reading and navigation
                      edit, adjust, layers, process      — writing
                      candidates, preview, comparison    — candidate workflow
                      *-properties.ts, *-ranges.ts       — GENERATED registries
scripts/            gen-dictionary.py, gen-adjustments.py, gen-recipes.py,
                      gen-adjustment-ranges.mjs         — generators
                    check-jxa.mjs, verify-property-names.mjs, smoke.mjs
                                                       — guards and smoke test
                    testbed.mjs, verify-adjustments.mjs — live test harnesses
docs/               DICTIONARY.md (generated digest), ADJUSTMENTS.md, LAYERS.md,
                    OUTPUT.md, CANDIDATES.md, PREVIEWS.md,
                    EDIT-PREVIEW-WORKFLOW.md, WORKFLOW-VALIDATION.md,
                    TOOL-SURFACE.md (historical design doc)
reference/          vendored .sdef from the installed app
CLAUDE.md           guidance for agents working on this repo (AGENTS.md points to it)
```

## Licence

MIT

