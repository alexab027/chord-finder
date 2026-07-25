import { describe, expect, it } from "vitest";
import { chooseProgression } from "./chordGeneration";
import type { KeyContext, PlacedNote, StyleOption } from "./types";

const cMajor: KeyContext = {
  signature: "C",
  label: "C major",
  tonicName: "c",
  tonicPc: 0,
  mode: "major",
};

const aMinor: KeyContext = {
  signature: "C",
  label: "A minor",
  tonicName: "a",
  tonicPc: 9,
  mode: "minor",
};

const emptyMeasures: PlacedNote[][] = [[], [], [], []];
const noPitch = () => "";

function names(key: KeyContext, style: StyleOption) {
  return chooseProgression(key, emptyMeasures, noPitch, style).map(
    (scored) => scored.chord.name,
  );
}

describe("chooseProgression determinism", () => {
  it("returns the same progression across repeated identical calls", () => {
    const first = names(cMajor, "simple");

    // 20 repeats: if a random pick were still in play, over a top window this
    // would diverge with overwhelming probability.
    for (let i = 0; i < 20; i++) {
      expect(names(cMajor, "simple")).toEqual(first);
    }
  });

  it("is deterministic for the minor mode too", () => {
    const first = names(aMinor, "jazzy");
    for (let i = 0; i < 20; i++) {
      expect(names(aMinor, "jazzy")).toEqual(first);
    }
  });

  it("produces a full four-chord progression", () => {
    expect(names(cMajor, "simple")).toHaveLength(4);
  });
});
