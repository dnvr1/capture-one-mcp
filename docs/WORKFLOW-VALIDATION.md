# Candidate workflow validation — 2026-09-09

Implemented tools: `co_create_candidates`, `co_render_preview`, and `co_compare_variants`.

## Automated evidence

- 116 tests pass, including candidate partial failure handling, expected-document checks, comparison coverage, preview bounds and cleanup, MCP write gating, schema rejection, and image response formatting.
- TypeScript compilation passes.
- All 42 embedded JXA bodies parse.
- Review corrected expected-document handling in comparison and preview target resolution. Preview file reads are bounded even if file size changes, and accommodate short reads.

These checks use simulated Capture One objects. They do not establish runtime compatibility with the installed application's scripting implementation.

## Live validation: passed on Capture One Pro 16.8.5

After the user restarted the app, desktop inspection and the MCP health probe worked immediately. No blocking dialog was visible. The precise cause of the earlier timeout was not established.

A disposable session at `/private/tmp/capture-one-workflow/MCP Workflow Validation` used copies of five RAWs. Results:

- Five native candidates created (source IDs 1–5, candidate IDs 6–10). A named adjustment layer survived cloning; comparison confirmed the first pair shared its parent image.
- Candidate 6 accepted +0.75 exposure and candidate 7 accepted 5200 K. The five originals retained their adjustment snapshots after the exposure edit, and original 2 also retained its snapshot after the white balance edit.
- Comparison reported the exposure difference. Native clones also differ in the `pick` flag; identical adjustments do not imply identical flags.
- Source 1 and candidate 6 rendered valid 800×1200 JPEGs. Independent `sips` inspection confirmed the embedded `sRGB IEC61966-2.1` profile. Successful previews removed their private recipes/folders and preserved the previous current recipe.
- Wrong-document clone, preview and comparison calls rejected; an invalid clone ID rejected. The final count remained ten variants and the processing queue was empty.
- Selecting the candidate and then its original succeeded. The two recipes retained after initial failed probes were removed once the queue was confirmed idle.
- SHA-256 checks confirmed all five source RAWs and their copied RAWs were unchanged.

Live testing caught and fixed two recipe setup requirements: Capture One accepts the profile name `sRGB Color Space Profile`, and a new recipe must receive its folder location before selecting `custom location`. Regression tests model both requirements. Early failed attempts stopped before processing.

This validates the basic workflow on this installation. Pixel-level mask preservation, curves, luma ranges, other Capture One versions, and queue-contention recovery were not live-tested. Comparison explicitly reports its coverage limitations.

## Live validation: Capture One Pro 16.9.0.10, 2026-11-03

Disposable session under a temp folder, holding copies of four RAWs (CR3, ARW, IIQ, DNG). The server was bound to it with `CAPTURE_ONE_MCP_DOCUMENT`, and the source catalog's originals were checksummed unchanged afterwards.

- `verify-adjustments.mjs`: no silent no-ops and no read failures across 83 properties. Regenerated ranges match `adjustment-ranges.ts` except for the four color balance hues losing `modular: true`, which comes from probing a variant whose hues read 0, not from a change in the app. The committed round-trip file was kept.
- `testbed.mjs` snapshot, diff and restore: restore removed the test layers and put flags, metadata and adjustments back. What remained was hue 0 reading 360 and saturation 0 reading 0.00003, both the probe's own writes.
- Every editing tool ran, and refused where it should: an out-of-range value, an unknown variant id, no target at all, the background layer, a wrong document id, and opening another document on a bound server.
- Previews rendered at the requested bound with an embedded `sRGB IEC61966-2.1` profile (checked with `sips`). People masks created layers on the two images with people and reported "No people detected" on the others.

Not validated: `co_remove_keyword` against a real keyword, because keywords cannot be created by script, so `verify-keyword-removal.mjs` still needs one added in the UI. `co_export_originals` was only seen refusing an unset destination, not copying files. Mask contents remain unreadable, so mask tools confirm only that the command was accepted.

## Repeatable disposable-session procedure

1. Confirm `co_status` can read the running app and document. Resolve any visible application or automation dialog before making writes.
2. Copy five RAW files into a new temporary test directory. Create a disposable Capture One session there; never point the write test at the source photo directory or a working session.
3. Record the disposable document ID, original variant IDs, and complete readable snapshots. Select this document explicitly and retain its ID for every workflow call.
4. Clone those five variants with `co_create_candidates`. Verify five unique candidate IDs, each referring to its original's parent image. Include an original with a layer/mask to inspect native clone preservation.
5. Change exposure on one candidate and white balance on another. Confirm originals' readable snapshots remain unchanged. Verify source/candidate comparison reports the expected changes and its coverage limitations.
6. Render source and candidate previews through `co_render_preview`. Verify visible images, requested dimensions, sRGB output, returned image content, and temporary recipe/folder cleanup. Check the previous recipe selection is restored.
7. Keep a candidate by retaining/selecting its ID; return to an original by selecting its original ID. This workflow does not delete rejected candidates or merge edits automatically.
8. Exercise a wrong document ID and an invalid variant ID; neither should clone or submit processing. Inspect incomplete results or retained preview resources before retrying.

Repeat these checks after changing Capture One versions. Native mask contents require separate visual validation.
