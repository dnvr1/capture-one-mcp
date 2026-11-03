import { runJxa } from "../jxa/bridge.js";

/** IPTC fields exposed for writing, mapped to their Capture One property names. */
export const METADATA_FIELDS = {
  headline: "contentHeadline",
  description: "contentDescription",
  creator: "contactCreator",
  copyrightNotice: "statusCopyrightNotice",
  rightsUsageTerms: "statusRightsUsageTerms",
  title: "statusTitle",
  instructions: "statusInstructions",
  city: "imageCity",
  state: "imageState",
  country: "imageCountry",
} as const;

export type MetadataField = keyof typeof METADATA_FIELDS;

export interface Target {
  variantIds?: string[];
  useCurrentSelection?: boolean;
  /** Refuse (never truncate) a target set larger than this; see resolveTargets. */
  maxTargets?: number;
}

export interface EditResult {
  /** "incomplete" when a variant threw partway: see `error`, `unattemptedIds`. */
  status: "complete" | "incomplete";
  affected: { id: string; name: string; extension: string; changes?: Record<string, unknown>; error?: string }[];
  notFound: string[];
  count: number;
  unattemptedIds?: string[];
  guidance?: string;
}

/** Rating, color tag and pick flag. */
export async function setFlags(
  target: Target,
  flags: { rating?: number; colorTag?: number; pick?: boolean },
): Promise<EditResult> {
  return runJxa<EditResult>(
    `
    const resolved = resolveTargets(args.target);
    const d = resolved.doc;
    const targets = resolved.targets;
    const notFound = resolved.notFound;
    const affected = [];
    const specs = [["rating", "rating"], ["colorTag", "colorTag"], ["pick", "pick"]];
    let stopped = null;
    for (let t = 0; t < targets.length; t++) {
      try {
        const v = targets[t];
        const changes = {};
        for (let f = 0; f < specs.length; f++) {
          const key = specs[f][0];
          if (args.flags[key] === undefined) continue;
          // Read the old value first: the tool documents that it reports what the
          // value was, which is the only record a caller has for reverting.
          let previous = null;
          try { previous = v[key](); } catch (e) {}
          let err = null;
          try { v[key] = args.flags[key]; } catch (e) { err = String(e).replace(/^Error:\\s*/, ""); }
          let actual = null;
          let readOk = false;
          try { actual = v[key](); readOk = true; } catch (e) { err = err || "read-back failed: " + String(e); }
          const entry = {
            previous: previous,
            requested: args.flags[key],
            actual: actual,
            matched: readOk && actual === args.flags[key],
          };
          if (err) entry.note = err;
          changes[key] = entry;
        }
        const info = describeVariant(v);
        info.changes = changes;
        affected.push(info);
      } catch (e) {
        stopped = stopBatch(targets, t, e);
        affected.push(stopped.entry);
        break;
      }
    }
    const out = { status: stopped ? "incomplete" : "complete", affected: affected, notFound: notFound, count: affected.length };
    if (stopped) { out.unattemptedIds = stopped.unattemptedIds; out.guidance = stopped.guidance; }
    return out;
    `,
    { args: { target, flags }, timeoutMs: 120_000, mutating: true },
  );
}

/** IPTC metadata fields. Only the fields supplied are written. */
export async function setMetadata(
  target: Target,
  fields: Partial<Record<MetadataField, string>>,
): Promise<EditResult> {
  const mapped: Record<string, string> = {};
  const fieldFor: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    const prop = METADATA_FIELDS[key as MetadataField];
    if (prop && value !== undefined) {
      mapped[prop] = value;
      // Report under the name the caller passed in, not the Capture One property
      // name, so the result reads back against the same vocabulary as the schema.
      fieldFor[prop] = key;
    }
  }
  if (!Object.keys(mapped).length) {
    throw new Error("No metadata fields supplied.");
  }

  return runJxa<EditResult>(
    `
    const resolved = resolveTargets(args.target);
    const d = resolved.doc;
    const targets = resolved.targets;
    const notFound = resolved.notFound;
    const affected = [];
    const props = Object.keys(args.fields);
    let stopped = null;
    for (let t = 0; t < targets.length; t++) {
      try {
        const v = targets[t];
        const changes = {};
        for (let p = 0; p < props.length; p++) {
          const key = props[p];
          const want = args.fields[key];
          // Read the old value first: an empty string CLEARS a field, overwriting
          // whatever was there, and this is the caller's only record of it.
          let previous = null;
          try { previous = String(v[key]()); } catch (e) {}
          // Per-field, so one rejected write does not abandon the call with earlier
          // fields already written and nothing reported about what landed.
          let err = null;
          try { v[key] = want; } catch (e) { err = String(e).replace(/^Error:\\s*/, ""); }
          // Read back rather than echoing the request. Echoing reported a write as
          // applied even when Capture One had stored something else or nothing.
          let actual = null;
          let readOk = false;
          try { actual = String(v[key]()); readOk = true; } catch (e) { err = err || "read-back failed: " + String(e); }
          const entry = {
            previous: previous,
            requested: want,
            actual: actual,
            matched: readOk && actual === want,
          };
          if (err) entry.note = err;
          changes[args.fieldFor[key]] = entry;
        }
        const info = describeVariant(v);
        info.changes = changes;
        affected.push(info);
      } catch (e) {
        stopped = stopBatch(targets, t, e);
        affected.push(stopped.entry);
        break;
      }
    }
    const out = { status: stopped ? "incomplete" : "complete", affected: affected, notFound: notFound, count: affected.length };
    if (stopped) { out.unattemptedIds = stopped.unattemptedIds; out.guidance = stopped.guidance; }
    return out;
    `,
    { args: { target, fields: mapped, fieldFor }, timeoutMs: 120_000, mutating: true },
  );
}

/**
 * Applies an existing keyword to the targets.
 *
 * Capture One 16.8.5 provides NO scriptable way to create a keyword: the
 * `keyword` class declares no `make` responder, all three of its properties are
 * read-only, and `apply keyword` documents its direct parameter as "an existing
 * keyword object". Every construction form was tried against the live app --
 * `make` at the document, at a variant, at a keywords element, with properties
 * and with data -- and all fail ("You cannot set or change this property of
 * this object" / "AppleEvent handler failed").
 *
 * The keyword must therefore already exist in the document, added through the
 * Capture One UI or imported into a keyword library from a file. The error path
 * says so and lists what is available, rather than offering a flag that cannot
 * work.
 */
export async function applyKeyword(target: Target, keyword: string): Promise<EditResult> {
  return runJxa<EditResult>(
    `
    const resolved = resolveTargets(args.target);
    const d = resolved.doc;
    const targets = resolved.targets;
    const notFound = resolved.notFound;

    const wantedName = String(args.keyword).toLowerCase();
    const existing = d.keywords();
    let kw = null;
    for (let i = 0; i < existing.length; i++) {
      if (String(existing[i].name()).toLowerCase() === wantedName) { kw = existing[i]; break; }
    }

    if (!kw) {
      const names = [];
      for (let i = 0; i < existing.length && i < 30; i++) names.push(String(existing[i].name()));
      throw new Error(
        "No keyword named '" + args.keyword + "' in this document. Capture One's scripting " +
        "interface cannot create keywords -- add it in the Capture One UI first, or import a " +
        "keyword list. Existing keywords: " + (names.length ? names.join(", ") : "(none)")
      );
    }

    kw.applyKeyword({ to: targets });

    const affected = [];
    for (let t = 0; t < targets.length; t++) {
      const info = describeVariant(targets[t]);
      info.changes = { keywordApplied: args.keyword };
      affected.push(info);
    }
    // One Apple Event applies to every target at once, so there is no
    // per-variant partial state to report: it either threw or it ran.
    return { status: "complete", affected: affected, notFound: notFound, count: affected.length };
    `,
    { args: { target, keyword }, timeoutMs: 120_000, mutating: true },
  );
}

/**
 * Removes a keyword from the target variants.
 *
 * Deletes the keyword element belonging to each VARIANT, not the document's
 * keyword object, so the keyword should survive in the document's keyword list
 * and other variants should keep it.
 *
 * UNVERIFIED against a real keyword: the standing test session has none, and
 * keywords cannot be created through the scripting interface (see
 * applyKeyword). Until scripts/verify-keyword-removal.mjs has been run on a
 * document with a keyword added through the UI, the blast radius is unknown,
 * so this guards it instead of trusting it:
 *
 *  - The document's keyword list is re-read straight after the FIRST variant
 *    that actually loses the keyword. If the keyword has gone from the document
 *    too, the delete reached further than one variant, and the batch stops
 *    there with status "incomplete" and the rest listed as unattempted. One
 *    variant is the most a wrong guess about the app can cost, rather than the
 *    whole selection. Checking once is enough to catch that behaviour (the
 *    first delete would show it) without an extra document read per variant.
 *  - Each variant's keywords are read back after the delete, and the entry
 *    reports keywordStillPresent, because a delete that returns without error
 *    proves nothing in this app (invariant 4).
 *  - documentKeywordBefore is reported next to documentKeywordSurvives, so a
 *    keyword that was never in the document's list does not read as one this
 *    call destroyed.
 */
export async function removeKeyword(target: Target, keyword: string): Promise<
  EditResult & {
    documentKeywordBefore: boolean;
    documentKeywordSurvives: boolean;
    stoppedBecause?: "document_keyword_removed";
  }
> {
  return runJxa(
    `
    const resolved = resolveTargets(args.target);
    const d = resolved.doc;
    const targets = resolved.targets;
    const notFound = resolved.notFound;

    const wantedName = String(args.keyword).toLowerCase();
    function hasKeyword(list) {
      for (let i = 0; i < list.length; i++) {
        if (String(list[i].name()).toLowerCase() === wantedName) return true;
      }
      return false;
    }

    const before = hasKeyword(d.keywords());
    // Nothing to guard when the document never listed the keyword.
    let documentChecked = !before;
    let leaked = false;
    const affected = [];

    let stopped = null;
    for (let t = 0; t < targets.length; t++) {
      try {
        const v = targets[t];
        const kws = v.keywords();
        let removed = false;
        for (let k = kws.length - 1; k >= 0; k--) {
          if (String(kws[k].name()).toLowerCase() === wantedName) {
            co.delete(kws[k]);
            removed = true;
          }
        }
        const info = describeVariant(v);
        info.changes = { keywordRemoved: removed ? args.keyword : null };
        if (removed) {
          // A failed read is null with its reason, never coerced to false:
          // false would claim the removal was confirmed.
          try {
            info.readBack = { keywordStillPresent: hasKeyword(v.keywords()) };
          } catch (e) {
            info.readBack = { keywordStillPresent: null, error: String(e).replace(/^Error:\\s*/, "") };
          }
        }
        affected.push(info);

        if (removed && !documentChecked) {
          documentChecked = true;
          if (!hasKeyword(d.keywords())) {
            leaked = true;
            const rest = [];
            for (let r = t + 1; r < targets.length; r++) {
              try { rest.push(String(targets[r].id())); } catch (e3) { rest.push(null); }
            }
            stopped = {
              unattemptedIds: rest,
              guidance: "Removing '" + args.keyword + "' from variant " + info.id + " also removed it " +
                "from the document's keyword list, so the delete reached beyond that one variant. " +
                "Stopped before touching any other target; unattemptedIds were not touched. Other " +
                "variants in the document may have lost the keyword too: check them, and re-add the " +
                "keyword in the Capture One UI if it is needed (it cannot be created by script).",
            };
            break;
          }
        }
      } catch (e) {
        stopped = stopBatch(targets, t, e);
        affected.push(stopped.entry);
        break;
      }
    }

    const out = {
      status: stopped ? "incomplete" : "complete",
      affected: affected, notFound: notFound, count: affected.length,
      documentKeywordBefore: before,
      documentKeywordSurvives: hasKeyword(d.keywords()),
    };
    if (leaked) out.stoppedBecause = "document_keyword_removed";
    if (stopped) { out.unattemptedIds = stopped.unattemptedIds; out.guidance = stopped.guidance; }
    return out;
    `,
    { args: { target, keyword }, timeoutMs: 120_000, mutating: true },
  );
}

/** Selection is app view state: no image data, metadata or structure changes. */
export async function setSelection(
  variantIds: string[],
  mode: "replace" | "add" | "remove",
): Promise<{ selected: { id: string; name: string }[]; notFound: string[] }> {
  return runJxa(
    `
    const resolved = resolveTargets({ variantIds: args.variantIds });
    const d = resolved.doc;
    const targets = resolved.targets;
    const notFound = resolved.notFound;

    if (args.mode === "replace") {
      const current = co.selectedVariants();
      if (current.length) d.deselect({ variants: current });
    }
    if (targets.length) {
      if (args.mode === "remove") d.deselect({ variants: targets });
      else d.select({ variants: targets });
    }

    const sel = co.selectedVariants();
    const out = [];
    for (let i = 0; i < sel.length; i++) out.push({ id: String(sel[i].id()), name: String(sel[i].name()) });
    return { selected: out, notFound: notFound };
    `,
    { args: { variantIds, mode }, timeoutMs: 60_000, mutating: true },
  );
}
