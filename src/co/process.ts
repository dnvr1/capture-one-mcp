import { CaptureOneError, readDocumentSettings, runJxa } from "../jxa/bridge.js";
import { drainTracker, type DrainedBy } from "./queue-drain.js";
import { RECIPE_PROPERTIES } from "./recipe-properties.js";
import type { Target } from "./edit.js";

const BY_PARAM = new Map(RECIPE_PROPERTIES.map((p) => [p.param, p]));

/** The dictionary declares no bounds for these, and absurd values are accepted
 *  happily -- a 200000px long edge at 16-bit TIFF is multi-gigabyte per image.
 *  These are sanity ceilings, not Capture One limits. */
const RECIPE_SANITY_MAX: Readonly<Record<string, number>> = {
  jpeg_quality: 100,
  bits: 32,
  pixels_per_inch: 10_000,
  primary_scaling_value: 60_000,
  secondary_scaling_value: 60_000,
  tiff_tile_dimension: 8_192,
};
const ALLOW_NEGATIVE = new Set(["sharpening_threshold"]);

/** Validates a recipe patch up front so a bad value cannot half-configure a recipe. */
function validateRecipePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const jxa: Record<string, unknown> = {};
  for (const [param, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    const prop = BY_PARAM.get(param);
    if (!prop) {
      const near = RECIPE_PROPERTIES.map((x) => x.param)
        .filter((x) => x.includes(param) || param.includes(x))
        .slice(0, 5);
      throw new Error(
        `Unknown recipe property '${param}'.` + (near.length ? ` Did you mean: ${near.join(", ")}?` : "") +
          ` Use co_list_recipe_properties to see all ${RECIPE_PROPERTIES.length}.`,
      );
    }
    if (prop.kind === "enum" && !prop.values?.includes(String(value))) {
      throw new Error(`'${param}' must be one of: ${prop.values?.join(", ")}. Got ${JSON.stringify(value)}.`);
    }
    if (prop.kind === "boolean" && typeof value !== "boolean") {
      throw new Error(`'${param}' must be a boolean.`);
    }
    if (prop.kind === "real" || prop.kind === "integer") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`'${param}' must be a finite number. Got ${JSON.stringify(value)}.`);
      }
      if (value < 0 && !ALLOW_NEGATIVE.has(param)) {
        throw new Error(`'${param}' cannot be negative. Got ${value}.`);
      }
      const cap = RECIPE_SANITY_MAX[param];
      if (cap !== undefined && value > cap) {
        throw new Error(
          `'${param}' is capped at ${cap} to avoid producing unusable output. Got ${value}.`,
        );
      }
    }
    if (prop.kind === "text" && typeof value !== "string") {
      throw new Error(`'${param}' must be a string.`);
    }
    jxa[prop.jxa] = value;
  }
  if (!Object.keys(jxa).length) throw new Error("No recipe properties supplied.");
  return jxa;
}

export async function configureRecipe(
  recipeName: string,
  patch: Record<string, unknown>,
  acknowledgeOverwritesOriginals = false,
  allowDestructive = false,
): Promise<unknown> {
  const jxa = validateRecipePatch(patch);
  return runJxa(
    `
    const d = requireDoc();
    const rs = d.recipes();
    let r = null;
    for (let i = 0; i < rs.length; i++) {
      if (String(rs[i].name()).toLowerCase() === String(args.recipeName).toLowerCase()) { r = rs[i]; break; }
    }
    if (!r) {
      const names = rs.map(function (x) { return String(x.name()); });
      throw new Error("No recipe named '" + args.recipeName + "'. Available: " + names.join(", "));
    }

    // A recipe that overwrites AND roots itself at the image folder writes next
    // to the originals under their own names, so processing a .jpg -- or the RAW
    // half of a RAW+JPEG pair -- replaces the camera original.
    //
    // The check is on the RESULTING state, not on the patch. Checking the patch
    // alone missed setting only existing_files on a recipe already rooted at the
    // image folder, and refused a faithful restore that merely replayed both
    // recorded values. Restoring a recipe that legitimately had this pairing is
    // legitimate, so it is an acknowledgement rather than a hard wall.
    var resultRoot = args.patch.rootFolderType !== undefined
      ? String(args.patch.rootFolderType) : String(r.rootFolderType());
    var resultExisting = args.patch.existingFiles !== undefined
      ? String(args.patch.existingFiles) : String(r.existingFiles());
    if (resultExisting === "overwrite") {
      // ANY overwrite needs the server's destructive opt-in, whatever the root
      // folder type. Destination tokens, custom paths and filesystem aliases all
      // prevent proving that an overwrite cannot reach originals -- which is
      // exactly why processVariants refuses on behaviour alone. Gating only the
      // "image folder" pairing left a recipe already rooted at a custom location
      // (commonly the capture folder) armable with no opt-in at all, and armed
      // recipes outlive this session: the next Process click in the UI uses them.
      if (!args.allowDestructive) {
        throw new Error(
          "Setting existing_files:'overwrite' on recipe '" + String(r.name()) + "' would let it " +
          "replace files already on disk, including originals depending on where it is rooted. " +
          "Nothing was changed. Use 'add suffix'/'skip', or enable " +
          "CAPTURE_ONE_MCP_ALLOW_DESTRUCTIVE=1 alongside CAPTURE_ONE_MCP_ALLOW_WRITE=1."
        );
      }
      // Rooted at the image folder it writes beside the originals under their own
      // names, so a second, in-band acknowledgement is required on top of the env
      // opt-in. Restoring a recipe that legitimately had this pairing is
      // legitimate, so it stays an acknowledgement rather than a hard wall.
      if (resultRoot === "image folder" && !args.acknowledged) {
        throw new Error(
          "This would leave recipe '" + String(r.name()) + "' writing output into the image " +
          "folder with existing_files:'overwrite', which can replace original files. " +
          "Use 'add suffix'/'skip', or root the recipe at the output location. If you are " +
          "deliberately restoring a recipe that was already configured this way, pass " +
          "acknowledge_overwrites_originals: true."
        );
      }
    }

    const props = Object.keys(args.patch);
    const applied = {};
    for (let p = 0; p < props.length; p++) {
      const key = props[p];
      const want = args.patch[key];
      let err = null;
      try { r[key] = want; } catch (e) { err = String(e).replace(/^Error:\\s*/, ""); }
      // Only coerce when the read SUCCEEDED. Coercing a failed read turned null
      // into false, so writing false reported matched:true even though nothing
      // had been read back at all.
      let actual = null;
      let readOk = false;
      try { actual = r[key](); readOk = true; } catch (e) { err = err || "read-back failed: " + String(e); }
      if (readOk) {
        if (typeof actual === "number") actual = Math.round(actual * 1e6) / 1e6;
        if (typeof want === "boolean") actual = Boolean(actual);
        else if (typeof want === "string") actual = String(actual);
      }
      const entry = { requested: want, actual: actual, matched: readOk && actual === want };
      if (err) entry.note = err;
      applied[args.paramFor[key]] = entry;
    }
    return { recipe: String(r.name()), applied: applied };
    `,
    {
      args: {
        recipeName,
        patch: jxa,
        acknowledged: acknowledgeOverwritesOriginals,
        allowDestructive,
        paramFor: Object.fromEntries(
          Object.keys(jxa).map((j) => [j, RECIPE_PROPERTIES.find((p) => p.jxa === j)?.param ?? j]),
        ),
      },
      timeoutMs: 60_000,
      mutating: true,
    },
  );
}

export interface ProcessResult {
  /** Identifier returned by Capture One when the processing request was accepted. */
  batchId: string;
  requested: number;
  recipe: string | null;
  existingFilesBehavior: string;
  overwriteWarning?: string;
  queueDrained: boolean;
  /** How the drain was established, when it was. See queue-drain.ts. */
  drainedBy?: DrainedBy;
  waitedMs: number;
  newFiles: { variant: string; path: string; date: string }[];
  variantsWithNoOutput: string[];
  /** Variants whose output history could not be read, so "new" is unknown. */
  outputHistoryUnreadable?: string[];
  /** Variants that resolved at submission but no longer resolve -- deleted or
   *  moved while the queue was draining. Their output cannot be accounted for. */
  variantsGoneDuringWait?: string[];
  notFound: string[];
}

/**
 * Processes variants and waits for the queue to drain.
 *
 * `process` returns immediately -- the work goes to a background queue -- so
 * completion is established by polling `document.jobs` until it empties, then
 * diffing each variant's `output events` against a snapshot taken beforehand.
 * That diff is what makes the reported file list exactly the files THIS call
 * produced, rather than everything the variant has ever written.
 *
 * The dictionary's `processing done` / `batch done` hooks are AppleScript-file
 * callbacks, which cannot be wired to an MCP server, so polling is the only
 * usable completion signal.
 */
export async function processVariants(
  target: Target,
  recipeName: string | null,
  waitSeconds: number,
  allowOverwrite = false,
): Promise<ProcessResult> {
  const started = await runJxa<{
    batchId: string;
    documentId: string;
    requested: number;
    resolvedIds: string[];
    notFound: string[];
    recipe: string | null;
    existingFilesBehavior: string;
    before: Record<string, string[] | null>;
    variantNames: Record<string, string>;
  }>(
    `
    const resolved = resolveTargets(args.target);
    const d = resolved.doc;
    const targets = resolved.targets;
    if (!targets.length) throw new Error("No variants resolved to process.");

    // Resolve and validate the actual recipe before submitting any work. Always
    // pass this resolved name to process: an implicit call could use enabled
    // recipes other than the current recipe we inspected.
    let recipeName = args.recipeName;
    let behavior = "unknown";
    const rs = d.recipes();
    let chosen = null;
    if (recipeName) {
      for (let i = 0; i < rs.length; i++) {
        if (String(rs[i].name()).toLowerCase() === String(recipeName).toLowerCase()) { chosen = rs[i]; break; }
      }
      if (!chosen) {
        throw new Error("No recipe named '" + recipeName + "'. Available: " +
          rs.map(function (x) { return String(x.name()); }).join(", "));
      }
    } else {
      try { chosen = d.currentRecipe(); } catch (e) {}
    }
    if (!chosen) throw new Error("Cannot resolve the current recipe. Specify a recipe name; no processing was submitted.");
    recipeName = String(chosen.name());
    if (!recipeName || recipeName === "undefined" || recipeName === "null") {
      throw new Error("Cannot read the recipe name; no processing was submitted.");
    }
    try { behavior = String(chosen.existingFiles()); } catch (e) {}
    if (["add suffix", "skip", "overwrite"].indexOf(behavior) === -1) {
      throw new Error("Cannot verify existing-files behavior for recipe '" + recipeName + "'; no processing was submitted.");
    }
    // Destination tokens, custom paths and filesystem aliases prevent proving
    // that an overwrite cannot reach originals. Any overwrite therefore needs
    // the server's existing destructive opt-in, even outside the image folder.
    if (behavior === "overwrite" && !args.allowOverwrite) {
      throw new Error("Recipe '" + recipeName + "' can overwrite existing files, including originals. " +
        "No processing was submitted. Use existing_files:'add suffix'/'skip', or enable " +
        "CAPTURE_ONE_MCP_ALLOW_DESTRUCTIVE=1 alongside CAPTURE_ONE_MCP_ALLOW_WRITE=1.");
    }

    // Snapshot existing output events so the post-run diff yields only new files.
    // Each event is keyed by path AND date: under existing_files:"overwrite" a
    // rewrite reuses the path, and keying on path alone would filter the new
    // file out as "already seen" and report the variant as having produced
    // nothing.
    //
    // The key is JSON rather than a delimiter-joined string. A separator has to
    // be a character that cannot occur in a path or a date, which pushes towards
    // control characters -- and a control character written into script source
    // is a trap: a NUL here made execFile reject the whole script before
    // osascript ran. JSON.stringify is unambiguous for any content, identical on
    // both sides, and keeps the source plain ASCII.
    const before = {};
    const variantNames = {};
    const resolvedIds = [];
    for (let t = 0; t < targets.length; t++) {
      const v = targets[t];
      const id = String(v.id());
      const info = describeVariant(v);
      variantNames[id] = info.name + "." + info.extension;
      resolvedIds.push(id);
      const keys = [];
      try {
        const evs = v.outputEvents();
        for (let e = 0; e < evs.length; e++) keys.push(JSON.stringify([String(evs[e].path()), String(evs[e].date())]));
      } catch (e) { before[id] = null; continue; }
      before[id] = keys;
    }

    const processResult = co.process(targets, { recipe: recipeName });
    // The scripting dictionary returns errors as text, not necessarily as
    // exceptions. Validate acceptance before an empty queue can imply success.
    if (typeof processResult !== "string" || !processResult.trim()) {
      throw new Error("Capture One returned no valid batch identifier. Processing may have been submitted; " +
        "inspect the batch queue and output files before retrying to avoid duplicate exports.");
    }
    if (/^ERROR/i.test(processResult.trim())) {
      throw new Error("Capture One rejected the processing request: " + processResult.trim() +
        ". Inspect the batch queue and output files before retrying; some work may already have been submitted.");
    }
    const batchId = processResult.trim();

    return {
      batchId: batchId,
      // Captured so the wait and the diff can prove they are still looking at
      // the document the work was submitted to.
      documentId: String(d.id()),
      requested: targets.length,
      resolvedIds: resolvedIds,
      notFound: resolved.notFound,
      recipe: recipeName,
      existingFilesBehavior: behavior,
      before: before,
      variantNames: variantNames,
    };
    `,
    { args: { target, recipeName, allowOverwrite }, timeoutMs: 180_000, mutating: true },
  );

  // Poll from Node rather than holding one long Apple Event open, so a stuck
  // queue times out here instead of wedging the event.
  const deadline = Date.now() + waitSeconds * 1000;
  let queueDrained = false;
  const t0 = Date.now();
  // Everything from here on runs AFTER the batch is queued inside Capture One.
  // A failure in the wait or the diff is not a failure to process, so it must
  // never surface as a bare error: it has to carry the batch id and say plainly
  // that the work is already running. Rethrown as the same CaptureOneError code
  // so a client can still branch on WRONG_DOCUMENT or TIMEOUT.
  const afterSubmission = <T>(err: unknown): T => {
    const e = err as CaptureOneError;
    throw new CaptureOneError(
      `Processing WAS submitted as batch '${started.batchId}' (${started.requested} variant(s) ` +
        `through recipe '${started.recipe}'), but the wait could not be completed: ${e?.message ?? String(err)} ` +
        "The batch may still be running or already finished. Inspect the processing queue and the " +
        "output files for these variants before retrying; retrying blindly can process them twice.",
      e instanceof CaptureOneError ? e.code : "SCRIPT_ERROR",
      ...(e instanceof CaptureOneError && e.detail !== undefined ? ([e.detail] as const) : ([] as const)),
    );
  };
  // Output-event counts from before submission, for the variants whose history
  // was readable. "Every one of these gained an event" is completion evidence
  // that does not depend on ever catching the job in the queue.
  const beforeCounts: Record<string, number> = {};
  for (const [id, keys] of Object.entries(started.before)) if (keys) beforeCounts[id] = keys.length;
  const drain = drainTracker();
  let drainedBy: DrainedBy | null = null;
  // do/while so wait_seconds:0 still checks once -- the previous `while` never
  // ran its body at 0 and always reported queueDrained:false.
  do {
    // Re-check the document every poll. requireDoc compares documents only when
    // a pin is configured, and the pin is unset by default -- so without this a
    // user clicking another window mid-wait made the poll read THAT document's
    // (empty) queue and report the batch drained while it was still rendering.
    const poll = await runJxa<{ pending: number; allHaveNewOutput: boolean }>(
      `
      const d = requireDoc();
      if (String(d.id()) !== args.documentId) {
        throw new Error("CO_MCP_WRONG_DOCUMENT: the front document changed to '" + String(d.id()) +
          "' while waiting for processing submitted to '" + args.documentId + "' to finish.");
      }
      const pending = d.jobs().length;
      // An empty queue right after submission can mean "not started yet", so
      // look for output evidence -- but only while it can still matter.
      if (pending || !args.checkOutputs) return { pending: pending, allHaveNewOutput: false };
      const ids = Object.keys(args.beforeCounts);
      if (!ids.length) return { pending: 0, allHaveNewOutput: false };
      const resolved = resolveTargets({ variantIds: ids });
      if (resolved.notFound.length || !resolved.targets.length) return { pending: 0, allHaveNewOutput: false };
      for (let t = 0; t < resolved.targets.length; t++) {
        const v = resolved.targets[t];
        let count;
        try { count = v.outputEvents().length; } catch (e) { return { pending: 0, allHaveNewOutput: false }; }
        if (!(count > args.beforeCounts[String(v.id())])) return { pending: 0, allHaveNewOutput: false };
      }
      return { pending: 0, allHaveNewOutput: true };
      `,
      {
        args: { documentId: started.documentId, beforeCounts, checkOutputs: !drain.sawJobs },
        timeoutMs: 20_000,
        mutationInFlight: true,
      },
    ).catch(afterSubmission<{ pending: number; allHaveNewOutput: boolean }>);
    drainedBy = drain.observe(poll.pending, poll.allHaveNewOutput);
    if (drainedBy) {
      queueDrained = true;
      break;
    }
    if (Date.now() < deadline) await new Promise((r) => setTimeout(r, Math.min(1000, deadline - Date.now())));
  } while (Date.now() < deadline);

  // Re-resolve by the ids captured before the wait, never by the original
  // target. With use_current_selection the user can change the selection during
  // a wait of up to ten minutes, which would diff two different variant sets.
  const after = await runJxa<{
    outputs: Record<string, { path: string; date: string }[]>;
    notFound: string[];
  }>(
    `
    const d = requireDoc();
    if (String(d.id()) !== args.documentId) {
      throw new Error("CO_MCP_WRONG_DOCUMENT: the front document changed to '" + String(d.id()) +
        "' before the output diff; ids from '" + args.documentId + "' would resolve to other images.");
    }
    const resolved = resolveTargets({ variantIds: args.variantIds });
    const out = {};
    for (let t = 0; t < resolved.targets.length; t++) {
      const v = resolved.targets[t];
      const rows = [];
      try {
        const evs = v.outputEvents();
        for (let e = 0; e < evs.length; e++) {
          rows.push({ path: String(evs[e].path()), date: String(evs[e].date()) });
        }
      } catch (e) {}
      out[String(v.id())] = rows;
    }
    // notFound here is not the caller's typo -- these ids resolved at submission
    // and no longer resolve, so they were deleted or moved during the wait.
    // Returning it stops them vanishing from every bucket in the result.
    return { outputs: out, notFound: resolved.notFound };
    `,
    {
      args: { variantIds: started.resolvedIds, documentId: started.documentId },
      timeoutMs: 120_000,
      mutationInFlight: true,
    },
  ).catch(afterSubmission<{ outputs: Record<string, { path: string; date: string }[]>; notFound: string[] }>);

  const newFiles: ProcessResult["newFiles"] = [];
  const variantsWithNoOutput: string[] = [];
  const unreadable: string[] = [];
  for (const [id, rows] of Object.entries(after.outputs)) {
    const prior = started.before[id];
    if (prior === null) {
      // Output history could not be read, so "new" cannot be determined --
      // saying nothing was produced would be a guess presented as a fact.
      unreadable.push(started.variantNames[id] ?? id);
      continue;
    }
    const seen = new Set(prior ?? []);
    const fresh = rows.filter((r) => !seen.has(JSON.stringify([r.path, r.date])));
    if (!fresh.length) variantsWithNoOutput.push(started.variantNames[id] ?? id);
    for (const r of fresh) {
      newFiles.push({ variant: started.variantNames[id] ?? id, path: r.path, date: r.date });
    }
  }

  return {
    batchId: started.batchId,
    requested: started.requested,
    recipe: started.recipe,
    existingFilesBehavior: started.existingFilesBehavior,
    ...(started.existingFilesBehavior === "overwrite"
      ? {
          overwriteWarning:
            "This recipe is set to OVERWRITE existing files. Any output file with a colliding " +
            "name may have been replaced. Set existing_files to 'add suffix' or 'skip' to avoid that.",
        }
      : {}),
    queueDrained,
    ...(drainedBy ? { drainedBy } : {}),
    waitedMs: Date.now() - t0,
    newFiles,
    variantsWithNoOutput,
    ...(unreadable.length ? { outputHistoryUnreadable: unreadable } : {}),
    notFound: started.notFound,
    ...(after.notFound.length
      ? { variantsGoneDuringWait: after.notFound.map((id) => started.variantNames[id] ?? id) }
      : {}),
  };
}

export async function queueStatus(): Promise<unknown> {
  return runJxa(
    `
    const d = requireDoc();
    const jobs = d.jobs();
    const rows = [];
    for (let i = 0; i < jobs.length && i < 50; i++) {
      rows.push({ id: String(jobs[i].id()), imageName: String(jobs[i].imageName()), imagePath: String(jobs[i].imagePath()) });
    }
    return { pending: jobs.length, processingQueueEnabled: Boolean(d.processingQueueEnabled()), jobs: rows };
    `,
    { timeoutMs: 60_000 },
  );
}

export async function outputFiles(target: Target): Promise<unknown> {
  return runJxa(
    `
    const resolved = resolveTargets(args.target);
    const out = [];
    for (let t = 0; t < resolved.targets.length; t++) {
      const v = resolved.targets[t];
      const info = describeVariant(v);
      info.outputs = [];
      try {
        const evs = v.outputEvents();
        for (let e = 0; e < evs.length; e++) {
          info.outputs.push({
            path: String(evs[e].path()),
            date: String(evs[e].date()),
            stillExists: Boolean(evs[e].exists()),
          });
        }
      } catch (e) { info.outputsError = String(e); }
      out.push(info);
    }
    return { variants: out, notFound: resolved.notFound };
    `,
    { args: { target }, timeoutMs: 120_000 },
  );
}

/**
 * Copies original files out, per the document's `export original settings`.
 *
 * Those settings are read over AppleScript: JXA cannot reach the document's
 * nested settings objects (see readDocumentSettings). If no destination has
 * ever been chosen the export is refused rather than fired blind, since where
 * the files would land is then unknown.
 */
export async function exportOriginals(target: Target): Promise<unknown> {
  const settings = await readDocumentSettings("export original settings", [
    "destination folder", "sub folder", "naming method", "naming format", "include adjustments",
  ]);
  if (!settings["destination folder"]) {
    throw new Error(
      "The session's export-originals destination folder is not set, so there is no way to know " +
        "where files would be written. Set it in Capture One's Export Originals dialog first.",
    );
  }

  const fired = await runJxa<{ requested: number; notFound: string[] }>(
    `
    const resolved = resolveTargets(args.target);
    if (!resolved.targets.length) throw new Error("No variants resolved to export.");
    resolved.doc.exportOriginals({ variants: resolved.targets });
    return { requested: resolved.targets.length, notFound: resolved.notFound };
    `,
    { args: { target }, timeoutMs: 300_000, mutating: true },
  );

  return {
    ...fired,
    settings,
    note:
      "export originals writes asynchronously and records no output events, so the resulting " +
      "files must be confirmed by listing the destination folder.",
  };
}

const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "tif", "tiff", "dng", "heic", "heif", "psd", "psb",
  "cr2", "cr3", "nef", "nrw", "arw", "srf", "sr2", "raf", "orf", "rw2", "pef",
  "iiq", "fff", "3fr", "mos", "erf", "mrw", "gpr", "eip",
]);

/** Import destination types in Capture One 16.8's dictionary ("import destination type"). */
export const IMPORT_DESTINATION_TYPES = [
  "capture folder", "session folder", "selected folder", "current location", "inside catalog", "custom",
] as const;

const IMPORT_SETTING_KEYS = [
  "destination type", "destination folder", "destination sub folder",
  "include subfolders", "exclude duplicates", "import naming format",
];

/** The document's import settings, read without importing anything. */
export async function getImportSettings(): Promise<unknown> {
  return {
    settings: await readDocumentSettings("import settings", IMPORT_SETTING_KEYS),
    note: "'current location' imports files where they are; every other destination type copies " +
      "them. Change these in Capture One's Import dialog.",
  };
}

export async function importImages(
  sources: string[],
  allowFolders: boolean,
  requireDestinationType?: string,
): Promise<unknown> {
  // Unvalidated, a single source of "/" or a home directory would pull every
  // image on the machine into the catalog, which is expensive to undo (delete
  // from the catalog AND from disk). Require absolute, existing paths, and make
  // folder imports an explicit choice rather than an accident.
  const { statSync } = await import("node:fs");
  const { isAbsolute, extname } = await import("node:path");
  const problems: string[] = [];
  for (const src of sources) {
    if (!isAbsolute(src)) { problems.push(`${src} — not an absolute path`); continue; }
    let st;
    try { st = statSync(src); } catch { problems.push(`${src} — does not exist`); continue; }
    if (st.isDirectory()) {
      if (!allowFolders) problems.push(`${src} — is a folder; pass allow_folders to import a whole tree`);
      continue;
    }
    const ext = extname(src).replace(".", "").toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) problems.push(`${src} — .${ext || "(none)"} is not a recognised image type`);
  }
  if (problems.length) {
    throw new Error(`Refusing to import:\n  ${problems.join("\n  ")}`);
  }

  const settings = await readDocumentSettings("import settings", IMPORT_SETTING_KEYS);
  // Read before importing, so a destination that would copy (or move) files
  // somewhere unexpected is refused while nothing has happened yet.
  if (requireDestinationType !== undefined && settings["destination type"] !== requireDestinationType) {
    throw new Error(
      `Refusing to import: the document's import destination type is ` +
        `'${settings["destination type"] ?? "unreadable"}', not '${requireDestinationType}'. ` +
        "Nothing was imported. Change it in Capture One's Import dialog, then retry.",
    );
  }

  // A session created by script has no current collection, and then d.variants()
  // is null rather than empty. The count is only a baseline for the caller, so
  // that must not stop the import: null says "unknown", where 0 would claim the
  // document was empty.
  const fired = await runJxa<{ variantsBefore: number | null }>(
    `
    const d = requireDoc();
    const variants = d.variants();
    const before = variants ? variants.length : null;
    d.import({ source: args.sources });
    return { variantsBefore: before };
    `,
    { args: { sources }, timeoutMs: 300_000, mutating: true },
  );

  // Seen live on 16.9: with no naming format, a copying import writes every file
  // as EmptyName.<ext>. The source is untouched and the import reports nothing,
  // so the only sign is here. Warned rather than refused, since the format can
  // only be changed in the Import dialog and the copies are still usable.
  const copies = settings["destination type"] !== "current location";
  const warnings = copies && settings["import naming format"] === ""
    ? ["The import naming format is empty, so Capture One names the copies 'EmptyName'. Set a format in Capture One's Import dialog to keep the original filenames."]
    : [];

  return {
    sources,
    ...fired,
    settings,
    ...(warnings.length ? { warnings } : {}),
    note: "Import runs asynchronously; poll co_list_variants for the resulting variants.",
  };
}

/**
 * Renames the ORIGINAL FILES ON DISK per the document's batch rename settings.
 *
 * Destructive and not undoable through scripting. Filenames are captured before
 * and after so the result reports the actual mapping rather than asserting
 * success -- which is also the only record of how to reverse it.
 */
export async function batchRename(target: Target): Promise<unknown> {
  const settings = await readDocumentSettings("batch rename settings", [
    "method", "token format", "job name", "counter", "find text", "replacement text",
    "include file extension",
  ]);
  const result = await runJxa<Record<string, unknown>>(
    `
    const resolved = resolveTargets(args.target);
    const d = resolved.doc;
    if (!resolved.targets.length) throw new Error("No variants resolved to rename.");

    const before = [];
    for (let t = 0; t < resolved.targets.length; t++) {
      const v = resolved.targets[t];
      before.push({ id: String(v.id()), path: (function () { try { return String(v.parentImage().path()); } catch (e) { return null; } })() });
    }

    d.batchRename({ variants: resolved.targets });

    const renames = [];
    for (let t = 0; t < resolved.targets.length; t++) {
      const v = resolved.targets[t];
      let after = null;
      try { after = String(v.parentImage().path()); } catch (e) {}
      renames.push({
        id: before[t].id,
        from: before[t].path,
        to: after,
        changed: before[t].path !== after,
      });
    }

    return {
      requested: resolved.targets.length,
      renamed: renames.filter(function (r) { return r.changed; }).length,
      unchanged: renames.filter(function (r) { return !r.changed; }).length,
      renames: renames,
      notFound: resolved.notFound,
    };
    `,
    { args: { target }, timeoutMs: 300_000, mutating: true },
  );
  return { ...result, settings };
}
