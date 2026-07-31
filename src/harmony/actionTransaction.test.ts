import { describe, expect, it } from "vitest";
import { buildRequestedChord } from "../music/chords";
import type { KeyContext, ScoredChord } from "../music/types";
import { applyChordEditTransaction } from "./actionTransaction";

const cMajor: KeyContext = {
  signature: "C",
  label: "C major",
  tonicName: "c",
  tonicPc: 0,
  mode: "major",
};

function progression(): ScoredChord[] {
  return [1, 4, 5, 1].map((degree) => ({
    chord: buildRequestedChord(cMajor, degree, "major"),
    score: degree,
    reasons: [],
  }));
}

describe("applyChordEditTransaction", () => {
  it("applies every non-conflicting action to temporary state", () => {
    const base = progression();
    const result = applyChordEditTransaction(
      base,
      [
        { type: "replace_chord", measure: 2, chordName: "Dm7" },
        { type: "replace_chord", measure: 4, chordName: "Am" },
      ],
      { key: cMajor },
    );

    expect(result.map(({ chord }) => chord.absoluteSymbol)).toEqual([
      "C",
      "Dm7",
      "G",
      "Am",
    ]);
    expect(base.map(({ chord }) => chord.absoluteSymbol)).toEqual([
      "C",
      "F",
      "G",
      "C",
    ]);
  });

  it("rejects the whole transaction when two actions target one measure", () => {
    const base = progression();

    expect(() =>
      applyChordEditTransaction(
        base,
        [
          { type: "replace_chord", measure: 2, chordName: "Dm" },
          { type: "replace_chord", measure: 2, chordName: "Am" },
        ],
        { key: cMajor },
      ),
    ).toThrow(/conflicting exact edits/i);
    expect(base[1].chord.absoluteSymbol).toBe("F");
  });

  it("rejects malformed actions before committing any edit", () => {
    const base = progression();
    expect(() =>
      applyChordEditTransaction(
        base,
        [
          { type: "replace_chord", measure: 2, chordName: "Dm" },
          { type: "replace_chord", measure: 9, chordName: "Am" },
        ],
        { key: cMajor },
      ),
    ).toThrow(/out of range/i);
    expect(base[1].chord.absoluteSymbol).toBe("F");
  });
});
