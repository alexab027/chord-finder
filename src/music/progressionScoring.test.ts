import { describe, expect, it } from "vitest";
import {
  rankProgressions,
  scoreProgression,
} from "./chordGeneration";
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

describe("scoreProgression", () => {
  it("reproduces the existing ranked winner score without changing identity", () => {
    const winner = rankProgressions(
      cMajor,
      emptyMeasures,
      noPitch,
      "simple",
    )[0];
    const rescored = scoreProgression(
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
});
