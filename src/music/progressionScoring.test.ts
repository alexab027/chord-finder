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

    expect(rescored.totalScore).toBeCloseTo(81.8);
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
});
