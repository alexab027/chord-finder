import { describe, expect, it } from "vitest";
import { buildNamedChord } from "../../music/chords";
import { rankProgressions } from "../../music/chordGeneration";
import type {
  KeyContext,
  PlacedNote,
  ScoredChord,
} from "../../music/types";
import { buildCandidatePool } from "./buildCandidatePool";
import { candidateHash } from "./candidateHash";
import { validateCandidate } from "./validateCandidate";
import { DEFAULT_HARMONY_PROFILE } from "../preferences";
import { progressionComplexity } from "../transforms/styleTransforms";

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

function revisionBase(): ScoredChord[] {
  return ["Dm7", "E7", "Am7", "Fmaj7"].map((symbol) => ({
    chord: buildNamedChord(aMinor, symbol)!,
    score: 0,
    reasons: [],
  }));
}

function generatePool(maxCandidates: number) {
  return buildCandidatePool({
    mode: "generate_new",
    key: cMajor,
    measures: emptyMeasures,
    getRenderedPitchFn: noPitch,
    style: "simple",
    options: {
      maxCandidates,
      maxRankedCandidates: 8,
    },
  });
}

describe("buildCandidatePool", () => {
  it("wraps deterministic ranked engine results as a valid symbolic pool", () => {
    const first = generatePool(5);
    const second = generatePool(5);
    const engineWinner = rankProgressions(
      cMajor,
      emptyMeasures,
      noPitch,
      "simple",
    )[0];

    expect(second).toEqual(first);
    expect(first).toHaveLength(5);
    expect(first[0].symbolicHash).toBe(candidateHash(engineWinner.progression));
    expect(first.every(({ source }) => source === "ranked_engine")).toBe(true);
    expect(first.every(({ totalScore }) => Number.isFinite(totalScore))).toBe(
      true,
    );
    expect(
      first.every(({ progression }) =>
        validateCandidate({ progression }).valid,
      ),
    ).toBe(true);
    expect(new Set(first.map(({ symbolicHash }) => symbolicHash)).size).toBe(
      first.length,
    );
    expect(
      first.every(
        (candidate) =>
          !("voicedProgression" in candidate) && !("role" in candidate),
      ),
    ).toBe(true);
  });

  it("adds a base-derived revision source outside the normal path grammar", () => {
    const pool = buildCandidatePool({
      mode: "revise_existing",
      key: aMinor,
      measures: emptyMeasures,
      getRenderedPitchFn: noPitch,
      style: "jazzy",
      baseProgression: revisionBase(),
      options: {
        maxCandidates: 4,
        maxRankedCandidates: 3,
        maxBaseCandidates: 4,
      },
    });
    const baseDerived = pool.filter(
      ({ source }) => source !== "ranked_engine",
    );

    expect(baseDerived.length).toBeGreaterThan(0);
    expect(
      baseDerived.every(({ progression }) =>
        progression.map(({ chord }) => chord.degree).every(
          (degree, index) => degree === [4, 5, 1, 6][index],
        ),
      ),
    ).toBe(true);
  });

  it("preserves higher-ranked order when the pool cap changes", () => {
    const small = generatePool(2);
    const large = generatePool(5);

    expect(small).toEqual(large.slice(0, 2));
  });

  it("reserves a revision slot for a valid base-derived candidate", () => {
    const pool = buildCandidatePool({
      mode: "revise_existing",
      key: aMinor,
      measures: emptyMeasures,
      getRenderedPitchFn: noPitch,
      style: "jazzy",
      baseProgression: revisionBase(),
      options: {
        maxCandidates: 1,
        maxRankedCandidates: 5,
        maxBaseCandidates: 3,
      },
    });

    expect(pool).toHaveLength(1);
    expect(pool[0].source).not.toBe("ranked_engine");
  });

  it("does not derive structural candidates from a base in generate-new mode", () => {
    const pool = buildCandidatePool({
      mode: "generate_new",
      key: aMinor,
      measures: emptyMeasures,
      getRenderedPitchFn: noPitch,
      style: "jazzy",
      baseProgression: revisionBase(),
      options: { maxCandidates: 4 },
    });

    expect(pool.every(({ source }) => source === "ranked_engine")).toBe(true);
  });

  it("connects the requested discrete simplicity target to the real pool", () => {
    const base = revisionBase();
    const pool = buildCandidatePool({
      mode: "revise_existing",
      key: aMinor,
      measures: emptyMeasures,
      getRenderedPitchFn: noPitch,
      style: "simple",
      preferences: {
        ...DEFAULT_HARMONY_PROFILE,
        simplicityLevel: 2,
        styleTransform: "simple",
      },
      baseProgression: base,
    });

    expect(pool.length).toBeGreaterThan(0);
    expect(pool.some(({ source }) => source === "style_transform")).toBe(true);
    expect(
      pool.every(
        ({ progression }) =>
          progressionComplexity(progression) <=
          progressionComplexity(base) - 4,
      ),
    ).toBe(true);
  });
});
