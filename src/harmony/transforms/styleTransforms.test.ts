import { describe, expect, it } from "vitest";
import { DEFAULT_HARMONY_PROFILE } from "../preferences";
import { buildNamedChord } from "../../music/chords";
import type { KeyContext, PlacedNote, ScoredChord } from "../../music/types";
import { candidateHash } from "../candidates/candidateHash";
import type { CandidatePoolEntry } from "../candidates/types";
import {
  buildStyleTransformCandidates,
  jazzColorScore,
  progressionComplexity,
} from "./styleTransforms";

const aMinor: KeyContext = {
  signature: "C",
  label: "A minor",
  tonicName: "a",
  tonicPc: 9,
  mode: "minor",
};
const measures: PlacedNote[][] = [[], [], [], []];
const noPitch = () => "";

function seed(symbols: string[]): CandidatePoolEntry {
  const progression: ScoredChord[] = symbols.map((symbol) => ({
    chord: buildNamedChord(aMinor, symbol)!,
    score: 0,
    reasons: [],
  }));
  return {
    progression,
    symbolicHash: candidateHash(progression),
    totalScore: 0,
    source: "base_rescored",
  };
}

describe("style transforms", () => {
  it("simplifies qualities while preserving every root path position", () => {
    const base = seed(["Dm7", "E7", "Am7", "Fmaj7"]);
    const [simple] = buildStyleTransformCandidates(
      [base],
      {
        key: aMinor,
        measures,
        getRenderedPitchFn: noPitch,
        style: "simple",
        preferences: {
          ...DEFAULT_HARMONY_PROFILE,
          simplicityLevel: 3,
        },
      },
      4,
    );

    expect(simple.progression.map(({ chord }) => chord.rootPc)).toEqual(
      base.progression.map(({ chord }) => chord.rootPc),
    );
    expect(simple.progression.map(({ chord }) => chord.quality)).toEqual([
      "triad",
      "triad",
      "triad",
      "triad",
    ]);
    expect(progressionComplexity(simple.progression)).toBeLessThan(
      progressionComplexity(base.progression),
    );
  });

  it("uses discrete simplicity levels to increase visible changes", () => {
    const base = seed(["Dm7", "E7", "Am7", "Fmaj7"]);
    const transformedCounts = ([1, 2, 3] as const).map((level) => {
      const [candidate] = buildStyleTransformCandidates(
        [base],
        {
          key: aMinor,
          measures,
          getRenderedPitchFn: noPitch,
          style: "simple",
          preferences: {
            ...DEFAULT_HARMONY_PROFILE,
            simplicityLevel: level,
          },
        },
        4,
      );
      return candidate.progression.filter(
        ({ chord }, index) =>
          chord.quality !== base.progression[index].chord.quality,
      ).length;
    });

    expect(transformedCounts).toEqual([1, 2, 4]);
  });

  it("creates measurable seventh and add9 jazz color on the same roots", () => {
    const base = seed(["Dm", "E", "Am", "F"]);
    const candidates = buildStyleTransformCandidates(
      [base],
      {
        key: aMinor,
        measures,
        getRenderedPitchFn: noPitch,
        style: "jazzy",
        preferences: {
          ...DEFAULT_HARMONY_PROFILE,
          style: "jazzy",
          simplicityLevel: 0,
          jazzLevel: 3,
        },
      },
      4,
    );

    expect(candidates.some(({ progression }) =>
      progression.some(({ chord }) => chord.quality === "add9"),
    )).toBe(true);
    expect(candidates.some(({ progression }) =>
      progression.some(({ chord }) =>
        ["maj7", "min7", "dom7"].includes(chord.quality),
      ),
    )).toBe(true);
    expect(
      candidates.every(
        ({ progression }) =>
          jazzColorScore(progression) > jazzColorScore(base.progression) &&
          progression.every(
            ({ chord }, index) =>
              chord.rootPc === base.progression[index].chord.rootPc,
          ),
      ),
    ).toBe(true);
  });
});
