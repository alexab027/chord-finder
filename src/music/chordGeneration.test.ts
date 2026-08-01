import { describe, expect, it } from "vitest";
import { chooseProgression, rankProgressions } from "./chordGeneration";
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

function symbols(key: KeyContext, style: StyleOption) {
  return chooseProgression(key, emptyMeasures, noPitch, style).map(
    (scored) => scored.chord.absoluteSymbol,
  );
}

describe("chooseProgression determinism", () => {
  it("preserves the current C-major winner", () => {
    expect(symbols(cMajor, "simple")).toEqual(["Am", "F", "G", "C"]);
  });

  it("preserves the current A-minor winner", () => {
    expect(symbols(aMinor, "jazzy")).toEqual([
      "Am7",
      "Dm7",
      "E7",
      "Am7",
    ]);
  });

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

describe("rankProgressions", () => {
  it("returns the same ordered pool for identical inputs", () => {
    const first = rankProgressions(
      cMajor,
      emptyMeasures,
      noPitch,
      "simple",
    );
    const second = rankProgressions(
      cMajor,
      emptyMeasures,
      noPitch,
      "simple",
    );

    expect(second).toEqual(first);
  });

  it("orders the pool by descending total score", () => {
    const pool = rankProgressions(
      cMajor,
      emptyMeasures,
      noPitch,
      "simple",
    );

    expect(pool.length).toBeGreaterThan(0);
    expect(
      pool.every(({ totalScore }) => Number.isFinite(totalScore)),
    ).toBe(true);
    for (let index = 1; index < pool.length; index += 1) {
      expect(pool[index - 1].totalScore).toBeGreaterThanOrEqual(
        pool[index].totalScore,
      );
    }
  });

  it("keeps the current winner as the first ranked progression", () => {
    const cMajorPool = rankProgressions(
      cMajor,
      emptyMeasures,
      noPitch,
      "simple",
    );
    const aMinorPool = rankProgressions(
      aMinor,
      emptyMeasures,
      noPitch,
      "jazzy",
    );

    expect(
      cMajorPool[0].progression.map(({ chord }) => chord.absoluteSymbol),
    ).toEqual(["Am", "F", "G", "C"]);
    expect(cMajorPool[0].totalScore).toBeCloseTo(81.8);
    expect(
      aMinorPool[0].progression.map(({ chord }) => chord.absoluteSymbol),
    ).toEqual(["Am7", "Dm7", "E7", "Am7"]);
  });

  it("backs chooseProgression with the first ranked result", () => {
    const pool = rankProgressions(
      cMajor,
      emptyMeasures,
      noPitch,
      "simple",
    );

    expect(
      chooseProgression(cMajor, emptyMeasures, noPitch, "simple"),
    ).toEqual(pool[0]?.progression ?? []);
  });
});
