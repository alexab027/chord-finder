import { describe, expect, it } from "vitest";
import { buildKeyChords } from "./chords";
import {
  buildExplanationIdentityItems,
  buildProgressionIdentityItems,
  formatProgressionSummary,
} from "./progressionPresentation";
import type { KeyContext, ScoredChord } from "./types";

const cMajor: KeyContext = {
  signature: "C",
  label: "C major",
  tonicName: "c",
  tonicPc: 0,
  mode: "major",
};

function scored(romanNumeral: string): ScoredChord {
  const chord = buildKeyChords(cMajor).find(
    (candidate) =>
      candidate.romanNumeral === romanNumeral && candidate.inversion === 0,
  );
  if (!chord) throw new Error(`Missing test chord ${romanNumeral}`);
  return { chord, score: 0, reasons: [] };
}

const progression = [scored("Imaj7"), scored("Vadd9"), scored("Imaj7"), scored("viadd9")];

describe("progression identity presentation", () => {
  it("includes both identities in the interpretation payload", () => {
    expect(buildProgressionIdentityItems(progression)[0]).toEqual({
      measure: 1,
      absoluteSymbol: "Cmaj7",
      romanNumeral: "Imaj7",
    });
  });

  it("keeps explanation symbols distinct from Roman numerals", () => {
    expect(buildExplanationIdentityItems(progression)[0]).toEqual({
      measure: 1,
      symbol: "Cmaj7",
      romanNumeral: "Imaj7",
    });
  });

  it("formats absolute chords and Roman numerals on separate lines", () => {
    expect(formatProgressionSummary("Generated in C major", progression)).toBe(
      [
        "Generated in C major",
        "Chords: Cmaj7 – Gadd9 – Cmaj7 – Am(add9)",
        "Roman numerals: Imaj7 – Vadd9 – Imaj7 – viadd9",
      ].join("\n"),
    );
  });
});
