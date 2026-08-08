import { describe, expect, it } from "vitest";
import {
  rankProgressions,
  scoreFullProgression,
} from "./chordGeneration";
import { buildNamedChord } from "./chords";
import type { KeyContext, PlacedNote } from "./types";

const cMajor: KeyContext = {
  signature: "C",
  label: "C major",
  tonicName: "c",
  tonicPc: 0,
  mode: "major",
};

const emptyMeasures: PlacedNote[][] = [[], [], [], []];
const noPitch = () => "";

function note(pitch: string): PlacedNote {
  return {
    pitch,
    slot: 0,
    duration: "h",
    durationSlots: 4,
    kind: "note",
    accidental: null,
  };
}

describe("scoreFullProgression", () => {
  it("reproduces the existing ranked winner score without changing identity", () => {
    const winner = rankProgressions(
      cMajor,
      emptyMeasures,
      noPitch,
      "simple",
    )[0];
    const rescored = scoreFullProgression(
      winner.progression.map(({ chord }) => chord),
      cMajor,
      emptyMeasures,
      noPitch,
      "simple",
    );

    expect(rescored.totalScore).toBeCloseTo(68);
    expect(rescored.totalScore).toBe(winner.totalScore);
    expect(
      rescored.progression.map(({ chord }) => chord.absoluteSymbol),
    ).toEqual(["Am", "F", "G", "C"]);
  });

  it("prefers a final tonic over a weak ending degree", () => {
    const chord = (name: string) => {
      const candidate = buildNamedChord(cMajor, name);
      if (!candidate) throw new Error(`Could not build ${name}`);
      return candidate;
    };
    const tonicEnding = [chord("C"), chord("F"), chord("G"), chord("C")];
    const weakEnding = [chord("C"), chord("F"), chord("G"), chord("B")];

    expect(
      scoreFullProgression(
        tonicEnding,
        cMajor,
        emptyMeasures,
        noPitch,
        "simple",
      ).totalScore,
    ).toBeGreaterThan(
      scoreFullProgression(
        weakEnding,
        cMajor,
        emptyMeasures,
        noPitch,
        "simple",
      ).totalScore,
    );
  });

  it("does not apply the melody weight again to final per-chord scores", () => {
    const chord = (name: string) => {
      const candidate = buildNamedChord(cMajor, name);
      if (!candidate) throw new Error(`Could not build ${name}`);
      return candidate;
    };
    const progression = [chord("C"), chord("F"), chord("G"), chord("C")];
    const scored = scoreFullProgression(
      progression,
      cMajor,
      [[note("c/5")], [], [], []],
      (placedNote) => placedNote.pitch,
      "simple",
    );
    const perChordTotal = scored.progression.reduce(
      (total, scoredChord) => total + scoredChord.score,
      0,
    );

    // C-F, F-G, G-C transitions = 1 + 4 + 6; final tonic = 8;
    // opening tonic = 2. The per-chord subtotal is already fully weighted.
    expect(scored.totalScore).toBeCloseTo(perChordTotal + 21);
  });
});
