import type { ChordEditAction } from "./actions";
import { CHORD_SYMBOL } from "./chordSymbol";

// Client-side "total-parse" gate for the direct-edit fast path.
//
// The single guarantee this module provides: it returns a non-empty action list
// ONLY when the ENTIRE prompt is nothing but one supported exact chord edit.
// That total-consumption guarantee is enforced structurally — every pattern is
// anchored with ^...$, so any leftover text (e.g. a style clause like
// "...and make it jazzier") fails to match and the caller falls through to Groq.
//
// This is purely an optimization: over-rejecting is safe (you pay one Groq call
// you could have skipped); over-accepting is NOT (you would silently drop a
// clause). So every check here is conservative — when in doubt, return null.
//
// Scope of this first pass (see implementation1.md):
//  - one edit per prompt only (no "and"-joined multi-edits);
//  - emits replace_chord / copy_chord actions, which the existing deterministic
//    engine (harmony/actions.applyChordEdits) validates and applies.

// The shared chord-name vocabulary (see chordSymbol.ts). Aliased to CHORD so the
// patterns below read the same.
const CHORD = CHORD_SYMBOL;

// Measure references: digits, number words, or ordinal words (+ optional
// st/nd/rd/th suffix so "2nd" and "second" both work).
const NUM = "\\d+|one|two|three|four|five|six|seven|eight|nine";
const ORD = "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth";
const TARGET = `(?:${NUM}|${ORD})`;

const CHORD_NAME_RE = new RegExp(`^(?:${CHORD})$`, "i");

function isValidChordName(value: string): boolean {
  return CHORD_NAME_RE.test(value.trim());
}

function tokenToMeasure(token: string): number | null {
  const normalized = token.trim().toLowerCase();
  const words: Record<string, number> = {
    one: 1,
    first: 1,
    two: 2,
    second: 2,
    three: 3,
    third: 3,
    four: 4,
    fourth: 4,
    five: 5,
    fifth: 5,
    six: 6,
    sixth: 6,
    seven: 7,
    seventh: 7,
    eight: 8,
    eighth: 8,
    nine: 9,
    ninth: 9,
  };
  const parsed = words[normalized] ?? Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}

function inRange(measure: number, measureCount: number): boolean {
  return measure >= 1 && measure <= measureCount;
}

// "set/change/replace measure N to X" and the ordinal-first "change the Nth
// chord to X". One measure, one chord. Emitted as replace_chord so the literal
// name is resolved by buildNamedChord in the shared engine.
const SINGLE_KEYWORD_FIRST = new RegExp(
  `^\\s*(?:change|set|make|replace|update)\\s+(?:the\\s+)?(?:measure|chord|bar)\\s+(${TARGET})(?:st|nd|rd|th)?\\s+(?:to|with|=)\\s+(${CHORD})\\s*[.!?]?\\s*$`,
  "i",
);
const SINGLE_ORDINAL_FIRST = new RegExp(
  `^\\s*(?:change|set|make|replace|update)\\s+(?:the\\s+)?(${TARGET})(?:st|nd|rd|th)?\\s+(?:measure|chord|bar)\\s+(?:to|with|=)\\s+(${CHORD})\\s*[.!?]?\\s*$`,
  "i",
);

// "copy measure N to measure M" (and ordinal-first "copy the first chord to the
// fourth chord").
const COPY_KEYWORD_FIRST = new RegExp(
  `^\\s*copy\\s+(?:the\\s+)?(?:measure|chord|bar)\\s+(${TARGET})(?:st|nd|rd|th)?\\s+to\\s+(?:the\\s+)?(?:measure|chord|bar)\\s+(${TARGET})(?:st|nd|rd|th)?\\s*[.!?]?\\s*$`,
  "i",
);
const COPY_ORDINAL_FIRST = new RegExp(
  `^\\s*copy\\s+(?:the\\s+)?(${TARGET})(?:st|nd|rd|th)?\\s+(?:measure|chord|bar)\\s+to\\s+(?:the\\s+)?(${TARGET})(?:st|nd|rd|th)?\\s+(?:measure|chord|bar)\\s*[.!?]?\\s*$`,
  "i",
);

// "set the progression to F-G-C-G" (also "F, G, C, G" or "F G C G").
const SET_PROGRESSION = new RegExp(
  `^\\s*(?:set|change|use|make)\\s+(?:the\\s+)?progression\\s+(?:(?:to|=|as)\\s+)?(.+?)\\s*[.!?]?\\s*$`,
  "i",
);

function parseSingleEdit(
  prompt: string,
  measureCount: number,
): ChordEditAction[] | null {
  const match =
    SINGLE_KEYWORD_FIRST.exec(prompt) ?? SINGLE_ORDINAL_FIRST.exec(prompt);
  if (!match) return null;

  const measure = tokenToMeasure(match[1]);
  const chordName = match[2];
  if (measure === null || !inRange(measure, measureCount)) return null;
  if (!isValidChordName(chordName)) return null;

  return [{ type: "replace_chord", measure, chordName }];
}

function parseCopyEdit(
  prompt: string,
  measureCount: number,
): ChordEditAction[] | null {
  const match =
    COPY_KEYWORD_FIRST.exec(prompt) ?? COPY_ORDINAL_FIRST.exec(prompt);
  if (!match) return null;

  const fromMeasure = tokenToMeasure(match[1]);
  const toMeasure = tokenToMeasure(match[2]);
  if (fromMeasure === null || toMeasure === null) return null;
  if (!inRange(fromMeasure, measureCount) || !inRange(toMeasure, measureCount)) {
    return null;
  }
  if (fromMeasure === toMeasure) return null;

  return [{ type: "copy_chord", fromMeasure, toMeasure }];
}

function parseSetProgression(
  prompt: string,
  measureCount: number,
): ChordEditAction[] | null {
  const match = SET_PROGRESSION.exec(prompt);
  if (!match) return null;

  const chordNames = match[1]
    .split(/\s*[-–—,]\s*|\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  // Must name exactly one chord per measure, each valid; otherwise defer to Groq.
  if (chordNames.length !== measureCount) return null;
  if (!chordNames.every(isValidChordName)) return null;

  return chordNames.map((chordName, index) => ({
    type: "replace_chord" as const,
    measure: index + 1,
    chordName,
  }));
}

/**
 * Returns a non-empty ChordEditAction[] when `prompt` is, in full, a single
 * supported exact chord edit; otherwise null (meaning: not a pure direct edit,
 * let Groq classify it). `measureCount` is the length of the current
 * progression — measures outside 1..measureCount are rejected.
 */
export function parsePureDirectEdits(
  prompt: string,
  measureCount: number,
): ChordEditAction[] | null {
  if (measureCount < 1) return null;
  const trimmed = prompt.trim();
  if (trimmed.length === 0) return null;

  return (
    parseSingleEdit(trimmed, measureCount) ??
    parseCopyEdit(trimmed, measureCount) ??
    parseSetProgression(trimmed, measureCount)
  );
}
