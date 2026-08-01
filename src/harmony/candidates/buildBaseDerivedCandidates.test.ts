import { describe, expect, it } from "vitest";
import { buildNamedChord } from "../../music/chords";
import type {
  KeyContext,
  PlacedNote,
  ScoredChord,
} from "../../music/types";
import { candidateHash } from "./candidateHash";
import { buildBaseDerivedCandidates } from "./buildBaseDerivedCandidates";

const aMinor: KeyContext = {
  signature: "C",
  label: "A minor",
  tonicName: "a",
  tonicPc: 9,
  mode: "minor",
};

const emptyMeasures: PlacedNote[][] = [[], [], [], []];
const noPitch = () => "";

function outsideGrammarBase(): ScoredChord[] {
  return ["Dm7", "E7", "Am7", "Fmaj7"].map((symbol) => ({
    chord: buildNamedChord(aMinor, symbol)!,
    score: 0,
    reasons: [],
  }));
}

describe("buildBaseDerivedCandidates", () => {
  it("rescored a committed path that begins outside generator start degrees", () => {
    const base = outsideGrammarBase();
    const candidates = buildBaseDerivedCandidates(
      base,
      {
        key: aMinor,
        measures: emptyMeasures,
        getRenderedPitchFn: noPitch,
        style: "jazzy",
      },
      { maxCandidates: 6 },
    );

    expect(candidates[0]).toMatchObject({
      source: "base_rescored",
      symbolicHash: candidateHash(base),
    });
    expect(candidates[0].progression.map(({ chord }) => chord.degree)).toEqual([
      4, 5, 1, 6,
    ]);
    expect(Number.isFinite(candidates[0].totalScore)).toBe(true);
  });

  it("creates distinct quality alternatives on the same roots", () => {
    const base = outsideGrammarBase();
    const candidates = buildBaseDerivedCandidates(
      base,
      {
        key: aMinor,
        measures: emptyMeasures,
        getRenderedPitchFn: noPitch,
        style: "simple",
      },
      { maxCandidates: 10 },
    );
    const alternatives = candidates.filter(
      ({ source }) => source === "base_quality_alternative",
    );
    const baseRoots = base.map(({ chord }) => chord.rootPc);

    expect(alternatives.length).toBeGreaterThan(0);
    expect(
      alternatives.every(({ progression }) =>
        progression.every(
          ({ chord }, index) => chord.rootPc === baseRoots[index],
        ),
      ),
    ).toBe(true);
    expect(
      alternatives.every(
        ({ progression }) =>
          progression.filter(
            ({ chord }, index) =>
              chord.quality !== base[index].chord.quality ||
              chord.bassPc !== base[index].chord.bassPc ||
              (chord.inversion ?? 0) !==
                (base[index].chord.inversion ?? 0),
          ).length >= 1,
      ),
    ).toBe(true);
    expect(
      alternatives.some(
        ({ progression }) =>
          progression.filter(
            ({ chord }, index) =>
              chord.quality !== base[index].chord.quality,
          ).length > 1,
      ),
    ).toBe(true);
    expect(new Set(candidates.map(({ symbolicHash }) => symbolicHash)).size).toBe(
      candidates.length,
    );
  });

  it("honors its configurable limit without duplicating candidates", () => {
    const candidates = buildBaseDerivedCandidates(
      outsideGrammarBase(),
      {
        key: aMinor,
        measures: emptyMeasures,
        getRenderedPitchFn: noPitch,
        style: "jazzy",
      },
      { maxCandidates: 2 },
    );

    expect(candidates).toHaveLength(2);
    expect(new Set(candidates.map(({ symbolicHash }) => symbolicHash)).size).toBe(
      2,
    );
  });
});
