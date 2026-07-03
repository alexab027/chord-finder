import type { KeyContext, ScoredChord } from "../music/types";
import {
  buildNamedChord,
  buildRequestedChord,
  type RequestedChordQuality,
} from "../music/chords";

// Quality vocabulary the model may request for a set_chord action.
export type HarmonyChordQuality = RequestedChordQuality;

// Deterministic, pure edits to the musical progression (ScoredChord[]).
//
// Measure numbers at this boundary are ONE-BASED (matching the UI, the API, and
// the progression summary). They are converted to zero-based indices only inside
// applyChordEdit. Voicing is intentionally NOT handled here: callers re-derive
// the PlacedChord[][] from the returned ScoredChord[] (see voiceProgression).
//
// `regenerate` remains the existing chooseProgression flow in Staff and is not a
// pure array transform, so it is not part of ChordEditAction.
export type ChordEditAction =
  | {
      type: "copy_chord";
      fromMeasure: number; // one-based source measure
      toMeasure: number; // one-based target measure
    }
  | {
      type: "set_chord";
      measure: number; // one-based target measure
      degree: number; // 1-7 scale degree
      quality: HarmonyChordQuality;
      extension?: 7;
    }
  | {
      type: "replace_chord";
      measure: number; // one-based target measure
      chordName: string;
    };

// Context the resolver needs. copy_chord ignores it; set_chord uses the key to
// build the requested chord deterministically.
export type HarmonyActionContext = {
  key: KeyContext;
};

// Thrown for invalid actions (bad measure numbers, same source/target, bad
// degree/quality/extension). Staff catches this and surfaces the message through
// its existing error state so a failure is never silent and never masquerades as
// a successful no-op.
export class HarmonyActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarmonyActionError";
  }
}

const ALLOWED_QUALITIES: HarmonyChordQuality[] = [
  "major",
  "minor",
  "dominant",
  "diminished",
];

// Deep-copies a chord's IDENTITY. Scalar fields are preserved as-is; the mutable
// arrays are cloned so the copy never aliases the source's arrays. The bass/
// inversion is encoded by the ORDER of pcs/noteNames (index 0 = bass), so order
// is preserved exactly — that is what lets re-voicing keep the inversion intact.
function cloneChordCandidate(source: ScoredChord["chord"]): ScoredChord["chord"] {
  return {
    ...source,
    pcs: [...source.pcs],
    noteNames: [...source.noteNames],
    pitches: [...source.pitches],
  };
}

function assertValidMeasure(
  progression: ScoredChord[],
  measureNumber: number,
  role: "source" | "target"
): void {
  if (
    !Number.isInteger(measureNumber) ||
    measureNumber < 1 ||
    measureNumber > progression.length
  ) {
    throw new HarmonyActionError(
      `${role} measure ${measureNumber} is out of range ` +
        `(expected 1-${progression.length}).`
    );
  }
}

// Returns a NEW ScoredChord[] with the action applied. The input array and its
// nested chords/arrays are never mutated.
export function applyChordEdit(
  progression: ScoredChord[],
  action: ChordEditAction,
  context: HarmonyActionContext
): ScoredChord[] {
  switch (action.type) {
    case "copy_chord": {
      const { fromMeasure, toMeasure } = action;

      assertValidMeasure(progression, fromMeasure, "source");
      assertValidMeasure(progression, toMeasure, "target");

      if (fromMeasure === toMeasure) {
        throw new HarmonyActionError(
          `copy_chord: source and target are the same measure (${fromMeasure}).`
        );
      }

      const from = fromMeasure - 1;
      const to = toMeasure - 1;
      const source = progression[from];

      const copied: ScoredChord = {
        chord: cloneChordCandidate(source.chord),
        // ScoredChord.score is required, so we cannot null it. `score` is
        // POSITIONAL metadata computed at the source measure; it is stale at the
        // target measure. We preserve the source value rather than weaken the
        // type. Nothing in re-voicing depends on it.
        score: source.score,
        reasons: [`Copied from measure ${fromMeasure}`],
      };

      const next = progression.slice();
      next[to] = copied;
      return next;
    }

    case "set_chord": {
      const { measure, degree, quality, extension } = action;

      assertValidMeasure(progression, measure, "target");

      // Defense in depth: these are validated at the API boundary, but re-guard
      // so the function is safe in isolation.
      if (!Number.isInteger(degree) || degree < 1 || degree > 7) {
        throw new HarmonyActionError(
          `set_chord: degree ${degree} is out of range (expected 1-7).`
        );
      }
      if (!ALLOWED_QUALITIES.includes(quality)) {
        throw new HarmonyActionError(
          `set_chord: unknown quality "${quality}".`
        );
      }
      if (extension !== undefined && extension !== 7) {
        throw new HarmonyActionError(
          `set_chord: extension must be omitted or 7 (got ${extension}).`
        );
      }

      const candidate = buildRequestedChord(
        context.key,
        degree,
        quality,
        extension
      );
      const at = measure - 1;

      const set: ScoredChord = {
        chord: candidate,
        // Preserve the displaced measure's score (stale positional metadata; the
        // set chord is not re-scored). reasons records the deterministic edit.
        score: progression[at].score,
        reasons: [`Set to ${candidate.name} by request`],
      };

      const next = progression.slice();
      next[at] = set;
      return next;
    }

    case "replace_chord": {
      const { measure, chordName } = action;

      assertValidMeasure(progression, measure, "target");

      const candidate = buildNamedChord(context.key, chordName);
      if (!candidate) {
        throw new HarmonyActionError(
          `replace_chord: could not parse chord "${chordName}".`
        );
      }

      const at = measure - 1;
      const replaced: ScoredChord = {
        chord: candidate,
        score: progression[at].score,
        reasons: [`Set to ${candidate.name} (${chordName}) by request`],
      };

      const next = progression.slice();
      next[at] = replaced;
      return next;
    }

    default: {
      // Exhaustiveness guard: any unhandled action type is a controlled error.
      const exhaustiveCheck: never = action;
      throw new HarmonyActionError(
        `Unsupported action: ${JSON.stringify(exhaustiveCheck)}`
      );
    }
  }
}

// Applies a sequence of edits in order, threading each result into the next, so
// later actions see the effects of earlier ones. Pure: returns a new array.
export function applyChordEdits(
  progression: ScoredChord[],
  actions: ChordEditAction[],
  context: HarmonyActionContext
): ScoredChord[] {
  return actions.reduce(
    (current, action) => applyChordEdit(current, action, context),
    progression
  );
}
