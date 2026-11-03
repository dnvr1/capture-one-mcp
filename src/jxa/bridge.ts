import { execFile } from "node:child_process";

/**
 * Every Capture One call is an Apple Event. Two failure modes dominate in
 * practice and both look like a hang unless they are handled explicitly:
 *
 *  1. A pending TCC "wants access to control" consent dialog blocks *every*
 *     Apple Event on the machine until a human clicks it. Apple Events do not
 *     fail fast here -- they sit until the AE timeout (-1712).
 *  2. Capture One's own handler blocks while the app is modal or busy
 *     (processing, importing, Live View), which also surfaces as -1712.
 *
 * So the bridge owns a wall-clock timeout of its own, always kills the
 * osascript child, and translates the osascript error vocabulary into
 * actionable messages rather than leaking "-1712" to the model.
 */

export const CAPTURE_ONE_APP = "Capture One";

/**
 * Optional guard against writing to the wrong document.
 *
 * Variant ids are small per-document integers ("641", "3480"), so an id read
 * from one document will very likely resolve to a DIFFERENT variant in another.
 * Nothing in the scripting interface ties an id to its document, and the
 * frontmost document can change between two tool calls -- the user clicking
 * another window is enough. Setting CAPTURE_ONE_MCP_DOCUMENT to a document id
 * (its folder path) makes every call fail loudly instead of silently editing
 * someone else's catalog.
 */
export function pinnedDocumentId(): string | null {
  const v = process.env["CAPTURE_ONE_MCP_DOCUMENT"]?.trim();
  if (!v) return null;
  if (v.toLowerCase() === "auto") return latchedDocumentId;
  return v;
}

/**
 * First-touch pinning.
 *
 * A hardcoded pin is safe but has to be rewritten for every project. With
 * CAPTURE_ONE_MCP_DOCUMENT=auto the server instead latches onto the first
 * document it actually touches and refuses everything else for the rest of the
 * process. That turns "silently edited the wrong catalog" into "refused after
 * you switched documents", which is the failure worth having, without naming a
 * path in advance. Reconnect the server to work on a different document.
 */
let latchedDocumentId: string | null = null;
let documentBinding: Promise<string | null> | null = null;

/** The binding probe's own budget. It is one cheap read; inheriting the
 *  caller's timeout meant a 300 s import could sit 300 s on a stuck probe
 *  before its body even started. */
const BINDING_PROBE_MS = 8_000;

/** Bind using a read-only probe before any caller's body can run. Concurrent
 * first calls share the probe; failed/empty probes may be retried safely. A
 * successful binding survives errors in the subsequent operation. */
async function ensureDocumentBinding(): Promise<string | null> {
  if (!isAutoPin() || latchedDocumentId) return pinnedDocumentId();
  if (!documentBinding) {
    documentBinding = (async () => {
      const raw = await execOsascript(`function run() {
        const co = Application(${JSON.stringify(CAPTURE_ONE_APP)});
        const d = co.currentDocument();
        return JSON.stringify(d ? String(d.id()) : null);
      }`, BINDING_PROBE_MS);
      let id: unknown;
      try { id = JSON.parse(raw.trim()); } catch {
        throw new CaptureOneError("Could not decode the document binding response.", "SCRIPT_ERROR");
      }
      if (id !== null && (typeof id !== "string" || !id)) {
        throw new CaptureOneError("Invalid document binding response.", "SCRIPT_ERROR");
      }
      latchedDocumentId = id;
      return latchedDocumentId;
    })().finally(() => { documentBinding = null; });
  }
  return documentBinding;
}

/**
 * Called by co_open_document with the id of the document it just opened.
 *
 * Opening is the one call where "the document this call touches" is not the
 * frontmost one at the start, so the usual bind-before-the-body probe would
 * latch the PREVIOUS document and then refuse every call against the one the
 * caller asked to open. openDocument therefore runs without binding and hands
 * the opened id here: an unbound `auto` server latches to it; a server already
 * bound (auto or fixed) to a different document refuses.
 */
export function bindOpenedDocument(id: string): void {
  if (!id) throw new CaptureOneError("Capture One did not report the opened document's id.", "SCRIPT_ERROR");
  const lock = documentLock();
  if (lock.mode === "auto" && !lock.documentId) {
    latchedDocumentId = id;
    return;
  }
  if (lock.documentId && lock.documentId !== id) {
    throw new CaptureOneError(
      `Opened '${id}', but this server is bound to '${lock.documentId}', so every call against ` +
        "the newly opened document will be refused. Reconnect the server to work on it.",
      "WRONG_DOCUMENT",
    );
  }
}

function isAutoPin(): boolean {
  return process.env["CAPTURE_ONE_MCP_DOCUMENT"]?.trim().toLowerCase() === "auto";
}

/** The document this process is bound to, and how it got bound. */
export function documentLock(): { mode: "off" | "auto" | "fixed"; documentId: string | null } {
  const v = process.env["CAPTURE_ONE_MCP_DOCUMENT"]?.trim();
  if (!v) return { mode: "off", documentId: null };
  if (v.toLowerCase() === "auto") return { mode: "auto", documentId: latchedDocumentId };
  return { mode: "fixed", documentId: v };
}

export class CaptureOneError extends Error {
  constructor(
    message: string,
    readonly code: CaptureOneErrorCode,
    readonly detail?: string, // raw osascript output; omitted when the message is already self-explanatory
  ) {
    super(message);
    this.name = "CaptureOneError";
  }
}

export type CaptureOneErrorCode =
  | "NOT_RUNNING"
  /** co_status only: the process is running but the probe's Apple Event timed out. */
  | "EVENTS_BLOCKED"
  | "NOT_AUTHORIZED"
  | "TIMEOUT"
  | "NO_DOCUMENT"
  | "WRONG_DOCUMENT"
  | "BUSY"
  | "SCRIPT_ERROR"
  /** A refusal before anything was written; also what the server reports for a failed argument check. */
  | "UNEXPECTED";

export interface RunOptions {
  /** Wall-clock budget in ms. Long operations (process, import) need more. */
  timeoutMs?: number;
  /** Values injected as `args` in the script scope, JSON-encoded. */
  args?: unknown;
  /**
   * True when the script mutates state. The timeout kills our osascript child,
   * NOT the Apple Event -- Capture One carries on importing/processing/renaming
   * regardless -- so a mutating call must never be described as safe to retry.
   */
  mutating?: boolean;
  /**
   * True when this call is itself a READ, but an earlier call in the same
   * operation already changed state -- the post-submit queue poll and output
   * diff in processVariants, for example.
   *
   * Such a call must not claim `mutating` (it changes nothing), but a timeout
   * here still must never advise a blind retry: the batch is already queued
   * inside Capture One, and re-running the operation would process it twice.
   */
  mutationInFlight?: boolean;
  /**
   * True for a call that must NOT latch the auto-pin.
   *
   * `co_status` is the tool a client reaches for when something times out, and
   * its description says to call it first -- so binding here claimed the server
   * for whatever document happened to be frontmost during a health check, and
   * every later call was refused once the user focused the one they meant to
   * work on. A diagnostic must observe without claiming.
   *
   * An already-established binding is still honoured; this only stops a new one
   * being created.
   */
  observeOnly?: boolean;
}

/** Retry advice appended to a timeout message. The bridge, not the caller,
 *  owns this wording so every timeout tells the same story about what is safe. */
const RETRY_SAFE = "Check the Capture One window, then retry.";
const RETRY_MUTATING =
  "IMPORTANT: this operation MUTATES state and the timeout stops only this " +
  "client, not Capture One -- the work may still be running or already done. " +
  "Inspect the current state before retrying; retrying blindly can apply it twice.";
const RETRY_IN_FLIGHT =
  "IMPORTANT: work was ALREADY SUBMITTED to Capture One before this timeout. " +
  "The timeout stops only this client, not the submitted batch, which may still " +
  "be running or already finished. Inspect the batch queue and the output files " +
  "before retrying; retrying blindly can process everything a second time.";

/**
 * One Apple Event at a time, process-wide.
 *
 * MCP clients may issue tool calls concurrently, and every call used to spawn
 * its own osascript immediately. Capture One services Apple Events on one
 * thread, so two in flight at once only queue inside the app, where our
 * wall-clock timeouts keep running: a read queued behind a slow write timed out
 * having done nothing, and two writes to the same variant could interleave
 * their read-backs. A FIFO chain here makes ordering explicit. Each timeout
 * starts when the child is spawned, not when the call is queued, so waiting
 * for the lock never eats into a call's own budget.
 */
let appleEventTail: Promise<unknown> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const run = appleEventTail.then(work, work);
  appleEventTail = run.catch(() => undefined);
  return run;
}

/**
 * Set when a state-changing call (or a read inside an operation that already
 * submitted work) times out. The timeout killed only our child; Capture One may
 * still be applying that write, so a follow-up write sent now can land on top
 * of it -- or be the blind retry the timeout message warns against. While
 * busy, every mutating or in-flight call is refused with BUSY; reads still run,
 * because reading is how the caller finds out what happened. Only a successful
 * liveness probe (co_status) clears it.
 */
let busyState: { reason: string; since: string } | null = null;

export function busyStatus(): { busy: boolean; reason?: string; since?: string } {
  return busyState ? { busy: true, ...busyState } : { busy: false };
}

/** Clears the busy flag. Only a liveness probe that round-tripped an Apple
 *  Event within its fixed budget may call this -- see healthCheck. Returns the
 *  state that was cleared, if any, so the caller can report it. */
export function clearBusy(): { reason: string; since: string } | null {
  const was = busyState;
  busyState = null;
  return was;
}

function busyError(): CaptureOneError {
  return new CaptureOneError(
    "Refusing a state-changing call: an earlier one timed out and Capture One may still be " +
      `working on it (${busyState?.reason ?? "unknown"}, since ${busyState?.since ?? "unknown"}). ` +
      "Call co_status first -- it probes whether Capture One is responding and clears this " +
      "state when it is -- then inspect the document (the affected variants, the processing " +
      "queue, output files) to see whether that earlier call took effect before retrying anything.",
    "BUSY",
  );
}

/** The same warnings for a mutating call that failed without timing out. */
const PARTIAL_MUTATING =
  "IMPORTANT: this operation MUTATES state and may have partially applied before it " +
  "failed. Inspect the current state before retrying; retrying blindly can apply it twice.";
const PARTIAL_IN_FLIGHT =
  "IMPORTANT: work was ALREADY SUBMITTED to Capture One before this error, and may still " +
  "be running or already finished. Inspect the batch queue and the output files before " +
  "retrying; retrying blindly can process everything a second time.";

/** Fallback budget for calls that do not specify one. CAPTURE_ONE_MCP_TIMEOUT_MS
 *  was previously loaded into config and never read by anything; the bridge is
 *  where it has to apply, so it is read here. */
function defaultTimeoutMs(): number {
  const raw = process.env["CAPTURE_ONE_MCP_TIMEOUT_MS"];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 20_000;
}

/**
 * Runs a JXA expression and returns its parsed JSON result.
 *
 * `body` is the source of a function body evaluated with `co` (the Capture One
 * application object), `app` (StandardAdditions), and `args` in scope. It must
 * `return` a JSON-serialisable value.
 */
export async function runJxa<T>(body: string, options: RunOptions = {}): Promise<T> {
  const {
    timeoutMs = defaultTimeoutMs(), args = null,
    mutating = false, mutationInFlight = false, observeOnly = false,
  } = options;
  const retryAdvice = mutating ? RETRY_MUTATING : mutationInFlight ? RETRY_IN_FLIGHT : RETRY_SAFE;
  const mutation = mutating || mutationInFlight;
  // Refuse before the binding probe as well as under the lock (below): there is
  // no point sending even a read on behalf of a call that will be refused.
  if (mutation && busyState) throw busyError();

  // An observing call reads whatever binding already exists but never creates
  // one, so a health check cannot latch the server to a document.
  const pin = observeOnly ? pinnedDocumentId() : await ensureDocumentBinding();
  const autoUnbound = !observeOnly && isAutoPin() && !pin;

  const source = `
    function run() {
      const co = Application(${JSON.stringify(CAPTURE_ONE_APP)});
      co.includeStandardAdditions = true;
      const app = Application.currentApplication();
      app.includeStandardAdditions = true;
      const args = ${JSON.stringify(args)};
      const __pinnedDocumentId = ${JSON.stringify(pin)};

      // Capture One returns *null* from \`current document\` when nothing is
      // open -- it does not raise. Without this guard the failure surfaces as a
      // JXA "null is not an object" TypeError, which is opaque to callers.
      var __documentIdSeen = null;
      function requireDoc() {
        // If the probe saw no document, never let a document opened afterwards
        // become an unguarded target. A later call can safely retry binding.
        if (${JSON.stringify(autoUnbound)}) throw new Error("CO_MCP_NO_DOCUMENT");
        const d = co.currentDocument();
        if (!d) throw new Error("CO_MCP_NO_DOCUMENT");
        __documentIdSeen = String(d.id());
        if (__pinnedDocumentId && __documentIdSeen !== __pinnedDocumentId) {
          throw new Error(
            "CO_MCP_WRONG_DOCUMENT: front document is '" + String(d.id()) +
            "' but this server is pinned to '" + __pinnedDocumentId + "'."
          );
        }
        return d;
      }

      function describeVariant(v) {
        var ext = "";
        try { ext = String(v.parentImage().extension()); } catch (e) {}
        return { id: String(v.id()), name: String(v.name()), extension: ext };
      }

      // Resolves an edit target -- explicit variant ids, or the app's current
      // selection -- to variant specifiers. Ids are read in one bulk event and
      // indexed, so resolving a few variants in a large catalog does not cost a
      // round trip each. Unmatched ids are reported rather than silently
      // dropped, so a caller always learns it affected fewer rows than it asked.
      function resolveTargets(target) {
        var d = requireDoc();
        var spec = d.variants;
        var targets = [];
        var notFound = [];

        // A cap on how many variants one editing call may touch. Checked here,
        // before the caller's body writes anything, and refused rather than
        // truncated: silently editing the first N of a larger selection is the
        // "did less than asked without saying so" failure.
        var cap = target && target.maxTargets;
        function refuseOverCap(n, what) {
          throw new Error("CO_MCP_REFUSED: " + what + " has " + n + " variants, over the limit of " + cap +
            " per editing call (CAPTURE_ONE_MCP_MAX_TARGETS). Nothing was changed. Split the work into " +
            "smaller batches of explicit variant_ids.");
        }
        if (target && target.useCurrentSelection) {
          var sel = co.selectedVariants();
          if (cap && sel.length > cap) refuseOverCap(sel.length, "The current selection");
          for (var s = 0; s < sel.length; s++) targets.push(sel[s]);
          if (!targets.length) throw new Error("Nothing is selected in Capture One.");
        } else {
          var wanted = (target && target.variantIds) || [];
          if (!wanted.length) throw new Error("Provide variant_ids, or set use_current_selection.");
          if (cap && wanted.length > cap) refuseOverCap(wanted.length, "variant_ids");
          var ids = spec.id();
          // A bare object would resolve "__proto__"/"constructor"/"toString" to
          // inherited members and push undefined as a target.
          var index = Object.create(null);
          for (var i = 0; i < ids.length; i++) index[String(ids[i])] = i;
          // Resolve each distinct id once. A repeated id previously pushed the
          // same variant twice, so co.process exported it twice (a spurious
          // "_1" file under existing_files:"add suffix") and the result claimed
          // two variants where there was one.
          var seen = Object.create(null);
          for (var w = 0; w < wanted.length; w++) {
            var wantedId = String(wanted[w]);
            if (seen[wantedId]) continue;
            seen[wantedId] = true;
            var at = index[wantedId];
            if (at === undefined) { notFound.push(wantedId); continue; }
            targets.push(spec[at]);
          }
        }
        return { doc: d, spec: spec, targets: targets, notFound: notFound };
      }

      // A throw partway through a per-variant batch write. Earlier variants are
      // already written, so failing the whole call would lose the only report
      // of what changed. The caller records this entry, stops, and returns
      // status "incomplete" -- the model createCandidates established.
      function stopBatch(targets, t, e) {
        var entry;
        try { entry = describeVariant(targets[t]); } catch (e2) {
          entry = { id: null };
          try { entry.id = String(targets[t].id()); } catch (e3) {}
        }
        entry.error = String(e).replace(/^Error:\\s*/, "");
        var rest = [];
        for (var r = t + 1; r < targets.length; r++) {
          try { rest.push(String(targets[r].id())); } catch (e3) { rest.push(null); }
        }
        return {
          entry: entry,
          unattemptedIds: rest,
          guidance: "Stopped at variant " + entry.id + ": " + entry.error + ". Earlier entries were " +
            "written as reported; the failed variant may be partially changed; unattemptedIds were not " +
            "touched. Inspect the failed variant before retrying, and retry only it and the unattempted ids.",
        };
      }

      // Layers have no id, so they are addressed by position within a variant.
      // Index 0 is the background layer.
      function resolveLayer(ref) {
        var r = resolveTargets({ variantIds: [ref.variantId] });
        if (!r.targets.length) throw new Error("No variant with id '" + ref.variantId + "' in the current collection. Capture One resolves variants only within the current collection; if the id exists, make All Images or the session folder current and retry.");
        var v = r.targets[0];
        var layers = v.layers();
        if (ref.layerIndex < 0 || ref.layerIndex >= layers.length) {
          throw new Error(
            "Layer index " + ref.layerIndex + " is out of range; variant " + ref.variantId +
            " has " + layers.length + " layer(s) (0 is the background layer)."
          );
        }
        return { variant: v, layers: layers, layer: layers[ref.layerIndex] };
      }

      const __result = (function () {
    ${body}
      })();
      return JSON.stringify({
        ok: true,
        value: __result === undefined ? null : __result,
        documentId: __documentIdSeen,
      });
    }
  `;

  const stdout = await execOsascript(source, timeoutMs, "JavaScript", retryAdvice, mutation);

  let parsed: { ok: true; value: T; documentId?: string | null };
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    const e = new CaptureOneError(
      "Capture One returned a value that could not be decoded as JSON.",
      "SCRIPT_ERROR",
      stdout.slice(0, 2000),
    );
    // The script ran to completion, so a mutating one has done its writes.
    throw mutation ? withPartialAdvice(e, retryAdvice) : e;
  }
  return parsed.value;
}

function execOsascript(
  source: string,
  timeoutMs: number,
  language: "JavaScript" | "AppleScript" = "JavaScript",
  retryAdvice: string = RETRY_SAFE,
  mutation = false,
): Promise<string> {
  return serialized(() => new Promise<string>((resolve, reject) => {
    // Re-checked here, holding the lock: a write queued behind the one that
    // timed out must be refused when its turn comes, not when it was queued.
    if (mutation && busyState) return reject(busyError());
    // A state-changing script that fails for ANY reason may have failed after
    // some of its writes landed -- a batch that threw on its fifth variant has
    // edited four. Timeouts already say so; every other failure of a mutating
    // call has to as well, or the model reads "error" as "nothing happened".
    const fail = (e: CaptureOneError, nothingWritten = false) =>
      reject(mutation && !nothingWritten && e.code !== "TIMEOUT" ? withPartialAdvice(e, retryAdvice) : e);
    // The script goes in on STDIN ("-"), not as an -e argv element.
    //
    // argv cannot carry a NUL byte -- execFile throws ERR_INVALID_ARG_VALUE
    // before osascript is even spawned -- so any script whose source contained
    // one died with an error that named Node internals and never mentioned
    // Capture One. argv is also length-limited, which put a ceiling on how many
    // variant ids a single call could carry. stdin has neither limit.
    const child = execFile(
      "/usr/bin/osascript",
      language === "AppleScript" ? ["-"] : ["-l", "JavaScript", "-"],
      { timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout);
        const text = `${stderr}`.trim();
        const killed = Boolean((error as NodeJS.ErrnoException & { killed?: boolean }).killed);
        const e = classifyFailure(text, killed, timeoutMs, retryAdvice);
        if (e.code === "TIMEOUT" && mutation) {
          busyState = {
            reason: `a state-changing call did not respond within ${Math.round(timeoutMs / 1000)}s`,
            since: new Date().toISOString(),
          };
        }
        // CO_MCP_REFUSED is thrown only by checks that run before any write.
        return fail(e, text.includes("CO_MCP_REFUSED"));
      },
    );

    child.on("error", (err) => fail(new CaptureOneError(err.message, "SCRIPT_ERROR")));

    // A child that exits before the script is fully written (a spawn failure,
    // or the timeout kill) makes this write fail; the callback above already
    // reports the real cause, so an EPIPE here must not become an unhandled
    // error event that takes the process down.
    child.stdin?.on("error", () => {});
    child.stdin?.end(source);
  }));
}

/**
 * Translates a failed osascript run into a CaptureOneError.
 *
 * The server's own CO_MCP_* markers are checked FIRST: they carry text we
 * wrote (a pinned path, a document id) that can contain anything. After that,
 * osascript errors are classified only by the error NUMBER that ends the error
 * line -- `... execution error: <message> (-1712)`. Substring-searching all of
 * stderr misfired on user data: a collection named "Shoot-600" read as "not
 * running", a pin path containing "-1712" as a timeout, and Capture One's own
 * "operation not allowed" as a missing automation grant.
 */
function classifyFailure(text: string, killed: boolean, timeoutMs: number, retryAdvice: string): CaptureOneError {
  // execFile reports its own timeout via `killed`; nothing came back at all.
  if (killed) return timeoutError(text, timeoutMs, retryAdvice);

  const wrong = text.split("\n").find((l) => l.includes("CO_MCP_WRONG_DOCUMENT"));
  if (wrong !== undefined) {
    return new CaptureOneError(
      stripErrorNumber(wrong.replace(/^.*CO_MCP_WRONG_DOCUMENT:?\s*/, "")) +
        " Refusing to act: variant ids are only meaningful within the document they came " +
        "from, so this could edit the wrong catalog.",
      "WRONG_DOCUMENT",
    );
  }
  const refused = text.split("\n").find((l) => l.includes("CO_MCP_REFUSED"));
  if (refused !== undefined) {
    return new CaptureOneError(
      stripErrorNumber(refused.replace(/^.*CO_MCP_REFUSED:?\s*/, "")),
      // The same code as the server-side argument checks: both mean "refused
      // before anything was written", and a client should branch on that once.
      "UNEXPECTED",
    );
  }
  if (text.includes("CO_MCP_NO_DOCUMENT")) {
    return new CaptureOneError(
      "No Capture One document is open. Open a session or catalog first.",
      "NO_DOCUMENT",
    );
  }

  switch (errorNumber(text)) {
    // The Apple Event layer's own timeout: same meaning as a kill.
    case -1712:
      return timeoutError(text, timeoutMs, retryAdvice);
    // The user has denied automation access for this client.
    case -1743:
      return new CaptureOneError(
        "Not authorised to control Capture One. Grant access under System Settings > " +
          "Privacy & Security > Automation for the app hosting this MCP server.",
        "NOT_AUTHORIZED",
        text.slice(0, 2000),
      );
    // The target application is not running / the connection is invalid.
    case -600:
    case -609:
      return new CaptureOneError("Capture One is not running.", "NOT_RUNNING");
  }

  if (/no document is open/i.test(text)) {
    return new CaptureOneError(
      "No Capture One document is open. Open a session or catalog first.",
      "NO_DOCUMENT",
    );
  }

  return new CaptureOneError(
    firstLine(text) || "Capture One rejected the script.",
    "SCRIPT_ERROR",
    text.slice(0, 2000),
  );
}

function timeoutError(text: string, timeoutMs: number, retryAdvice: string): CaptureOneError {
  return new CaptureOneError(
    `Capture One did not respond within ${Math.round(timeoutMs / 1000)}s. ` +
      "This usually means one of: (a) a macOS automation-permission dialog is " +
      "waiting for a click, which blocks every Apple Event until dismissed; " +
      "(b) Capture One is showing a modal dialog; or (c) it is busy with a long " +
      "import/process. " +
      retryAdvice,
    "TIMEOUT",
    text.slice(0, 2000),
  );
}

/** The osascript error number, read only from the END of the error line. */
function errorNumber(text: string): number | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const line = [...lines].reverse().find((l) => /execution error/i.test(l)) ?? lines[lines.length - 1] ?? "";
  const m = /\((-?\d+)\)\s*$/.exec(line);
  return m ? Number(m[1]) : null;
}

function stripErrorNumber(line: string): string {
  return line.replace(/\s*\(-?\d+\)\s*$/, "").trim();
}

/** Advice for a mutating call that failed WITHOUT timing out. */
function withPartialAdvice(e: CaptureOneError, retryAdvice: string): CaptureOneError {
  const advice = retryAdvice === RETRY_IN_FLIGHT ? PARTIAL_IN_FLIGHT : PARTIAL_MUTATING;
  return new CaptureOneError(`${e.message} ${advice}`, e.code, e.detail);
}

function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim().length > 0) ?? "";
  // Strip the "12:34: execution error: " prefix osascript prepends.
  return line.replace(/^\d+:\d+:\s*(execution error:\s*)?/, "").trim();
}

/**
 * Runs raw AppleScript and returns stdout.
 *
 * JXA cannot reach Capture One's nested settings objects at all: reading
 * `import settings`, `batch rename settings` or `export original settings`
 * fails with "Can't convert types.", and any property of them with "Invalid key
 * form." The identical reads succeed in AppleScript, so those parts of the
 * dictionary are only reachable this way.
 */
export async function runAppleScript(source: string, timeoutMs = 30_000): Promise<string> {
  return (await execOsascript(source, timeoutMs, "AppleScript")).trimEnd();
}

const AS_ERROR = "\u00abERR\u00bb";

/**
 * Reads properties of one of the document's settings objects.
 *
 * Values come back tab-delimited because AppleScript has no JSON; a property
 * that cannot be read yields a null rather than failing the whole read, since
 * some are simply unset (an export destination that has never been chosen).
 *
 * `missing value` is tested before the text coercion because `as text` turns it
 * into the string "missing value", which is truthy: it read as a real import
 * destination, and the "destination not set" guard in exportOriginals relies on
 * unset being null.
 */
export async function readDocumentSettings(
  settingsObject: string,
  properties: string[],
): Promise<Record<string, string | null>> {
  const pin = await ensureDocumentBinding();
  if (isAutoPin() && !pin) {
    throw new CaptureOneError("No Capture One document is open. Open a session or catalog first.", "NO_DOCUMENT");
  }
  // AppleScript string literals escape quotes and backslashes, not JSON's
  // control-character escapes (a document path can contain a newline).
  const asString = (value: string) => '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  const lines = properties
    .map(
      (p) =>
        `  try\n    set settingValue to (${p} of ${settingsObject})\n` +
        `    if settingValue is missing value then\n      set end of out to "${AS_ERROR}"\n` +
        `    else\n      set end of out to (settingValue as text)\n    end if\n` +
        `  on error\n    set end of out to "${AS_ERROR}"\n  end try`,
    )
    .join("\n");

  const source =
    `tell application "Capture One"\n` +
    `set targetDocument to current document\n` +
    `if targetDocument is missing value then error "CO_MCP_NO_DOCUMENT"\n` +
    (pin ? `if (id of targetDocument as text) is not ${asString(pin)} then error "CO_MCP_WRONG_DOCUMENT: document changed before reading settings."\n` : "") +
    `tell targetDocument\n` +
    `set out to {}\n${lines}\n` +
    `set AppleScript's text item delimiters to tab\n` +
    `set res to out as text\n` +
    `set AppleScript's text item delimiters to ""\n` +
    `return res\n` +
    `end tell\nend tell`;

  const raw = await runAppleScript(source);
  const parts = raw.split("\t");
  const out: Record<string, string | null> = {};
  properties.forEach((p, i) => {
    // Every property pushes one entry, so a missing part can only be an empty
    // value at the end that runAppleScript's trimEnd took with the final tab.
    // Empty is a real answer (no naming format set), not an unreadable one.
    const v = parts[i] ?? "";
    out[p] = v === AS_ERROR ? null : v;
  });
  return out;
}

/**
 * True if the Capture One process exists. Resolved locally by JXA -- it does
 * NOT prove Apple Events are getting through. Use `healthCheck` for that.
 */
export async function isRunning(): Promise<boolean> {
  try {
    const source = `function run() { return JSON.stringify(Application(${JSON.stringify(
      CAPTURE_ONE_APP,
    )}).running()); }`;
    return JSON.parse((await execOsascript(source, 5_000)).trim()) === true;
  } catch {
    return false;
  }
}
