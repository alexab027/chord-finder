import { describe, expect, it } from "vitest";
import { buildNamedChord } from "../../music/chords";
import type { KeyContext, PlacedNote, ScoredChord } from "../../music/types";
import { buildCandidatePool } from "./buildCandidatePool";
import { calculateCandidateDistance } from "./candidateDistance";
import { candidateHash } from "./candidateHash";
import { selectCandidateRoles } from "./selectCandidateRoles";
import type { CandidatePoolEntry } from "./types";

const cMajor: KeyContext = {
  signature: "C",
  label: "C major",
  tonicName: "c",
  tonicPc: 0,
  mode: "major",
};
const emptyMeasures: PlacedNote[][] = [[], [], [], []];
const noPitch = () => "";

function progression(symbols: string[]): ScoredChord[] {
  return symbols.map((symbol) => ({
    chord: buildNamedChord(cMajor, symbol)!,
    score: 0,
    reasons: [],
  }));
}

function candidate(symbols: string[], totalScore: number): CandidatePoolEntry {
  const symbolicProgression = progression(symbols);

  return {
    symbolicHash: candidateHash(symbolicProgression),
    progression: symbolicProgression,
    totalScore,
    source: "ranked_engine",
  };
}

describe("selectCandidateRoles generate-new", () => {
  it("selects three earned roles from the real ranked pool", () => {
    const pool = buildCandidatePool({
      mode: "generate_new",
      key: cMajor,
      measures: emptyMeasures,
      getRenderedPitchFn: noPitch,
      style: "simple",
    });
    const selected = selectCandidateRoles({
      mode: "generate_new",
      candidates: pool,
    });

    expect(selected.map(({ role }) => role)).toEqual([
      "closest",
      "moderate",
      "distinct",
    ]);
    expect(new Set(selected.map(({ symbolicHash }) => symbolicHash)).size).toBe(
      3,
    );
  });

  it("excludes the current hash and assigns Best Fit semantics by quality", () => {
    const current = progression(["C", "G", "Am", "F"]);
    const currentCandidate = candidate(["C", "G", "Am", "F"], 110);
    const bestFit = candidate(["Am", "F", "G", "C"], 100);
    const moderate = candidate(["Dm", "F", "G", "C"], 95);
    const distinct = candidate(["F", "Dm", "Em", "G"], 90);

    const selected = selectCandidateRoles({
      mode: "generate_new",
      candidates: [currentCandidate, bestFit, moderate, distinct],
      currentProgression: current,
      excludeCurrentProgression: true,
    });

    expect(selected.map(({ role }) => role)).toEqual([
      "closest",
      "moderate",
      "distinct",
    ]);
    expect(selected[0].symbolicHash).toBe(bestFit.symbolicHash);
    expect(selected.some(({ symbolicHash }) => symbolicHash === currentCandidate.symbolicHash)).toBe(
      false,
    );
    expect(selected[1].distanceFromBestFit).toBeGreaterThanOrEqual(3);
    expect(selected[2].distanceFromBestFit).toBeGreaterThanOrEqual(8);
  });

  it("keeps every visible candidate pairwise diverse", () => {
    const selected = selectCandidateRoles({
      mode: "generate_new",
      candidates: [
        candidate(["Am", "F", "G", "C"], 100),
        candidate(["Dm", "F", "G", "C"], 95),
        candidate(["F", "Dm", "Em", "G"], 90),
      ],
    });

    for (let left = 0; left < selected.length; left += 1) {
      for (let right = left + 1; right < selected.length; right += 1) {
        expect(
          calculateCandidateDistance(
            selected[left].progression,
            selected[right].progression,
          ).total,
        ).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("returns fewer roles instead of relaxing quality or distance floors", () => {
    const selected = selectCandidateRoles({
      mode: "generate_new",
      candidates: [
        candidate(["Am", "F", "G", "C"], 100),
        candidate(["Am7", "F", "G", "C"], 99),
        candidate(["F", "Dm", "Em", "G"], 70),
      ],
    });

    expect(selected.map(({ role }) => role)).toEqual(["closest"]);
  });
});

describe("selectCandidateRoles revision", () => {
  it("earns closest, moderate, and distinct roles from base distance", () => {
    const base = progression(["C", "G", "Am", "F"]);
    const unchanged = candidate(["C", "G", "Am", "F"], 120);
    const closest = candidate(["Cmaj7", "G", "Am", "F"], 100);
    const moderate = candidate(["Dm", "Em", "Am", "F"], 95);
    const lessDistinct = candidate(["F", "G", "Em", "C"], 92);
    const distinct = candidate(["F", "Dm", "Em", "G"], 90);

    const selected = selectCandidateRoles({
      mode: "revise_existing",
      candidates: [unchanged, lessDistinct, distinct, moderate, closest],
      baseProgression: base,
    });

    expect(selected.map(({ role }) => role)).toEqual([
      "closest",
      "moderate",
      "distinct",
    ]);
    expect(selected[0].symbolicHash).toBe(closest.symbolicHash);
    expect(selected[0].distanceFromBase).toBe(1);
    expect(selected[1].exactPositionMatches).toBeLessThanOrEqual(2);
    expect(selected[2].distanceFromBase).toBeGreaterThanOrEqual(8);
    expect(selected[2].symbolicHash).toBe(distinct.symbolicHash);
    expect(
      selected.some(({ symbolicHash }) => symbolicHash === unchanged.symbolicHash),
    ).toBe(false);
  });

  it("does not label a three-position-preserving candidate as moderate", () => {
    const base = progression(["C", "G", "Am", "F"]);
    const selected = selectCandidateRoles({
      mode: "revise_existing",
      candidates: [
        candidate(["Cmaj7", "G", "Am", "F"], 100),
        candidate(["Dm", "G", "Am", "F"], 99),
      ],
      baseProgression: base,
    });

    expect(selected.map(({ role }) => role)).toEqual(["closest"]);
  });

  it("does not earn a role by only reordering the closest candidate", () => {
    const base = progression(["C", "G", "Am", "F"]);
    const selected = selectCandidateRoles({
      mode: "revise_existing",
      candidates: [
        candidate(["Cmaj7", "G", "Am", "F"], 100),
        candidate(["G", "Cmaj7", "F", "Am"], 99),
      ],
      baseProgression: base,
    });

    expect(selected.map(({ role }) => role)).toEqual(["closest"]);
  });

  it("keeps the quality floor and returns an honest smaller set", () => {
    const base = progression(["C", "G", "Am", "F"]);
    const selected = selectCandidateRoles({
      mode: "revise_existing",
      candidates: [
        candidate(["Cmaj7", "G", "Am", "F"], 100),
        candidate(["Dm", "Em", "Am", "F"], 95),
        candidate(["F", "Dm", "Em", "G"], 70),
      ],
      baseProgression: base,
    });

    expect(selected.map(({ role }) => role)).toEqual([
      "closest",
      "moderate",
    ]);
  });
});
