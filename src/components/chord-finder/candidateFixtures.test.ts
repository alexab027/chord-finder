import { describe, expect, it } from "vitest";
import { buildKeyChords } from "../../music/chords";
import type { KeyContext, ScoredChord } from "../../music/types";
import { buildCandidateFixtures } from "./candidateFixtures";

const cMajor: KeyContext = {
  signature: "C",
  label: "C major",
  tonicName: "c",
  tonicPc: 0,
  mode: "major",
};

function primaryProgression(): ScoredChord[] {
  return [1, 5, 6, 4].map((degree) => ({
    chord: buildKeyChords(cMajor).find(
      (candidate) =>
        candidate.degree === degree && candidate.quality === "triad",
    )!,
    score: 1,
    reasons: [],
  }));
}

describe("buildCandidateFixtures", () => {
  it("keeps the engine result first and adds two distinct preview fixtures", () => {
    const primary = primaryProgression();
    const fixtures = buildCandidateFixtures(cMajor, "simple", primary);

    expect(fixtures).toHaveLength(3);
    expect(fixtures[0].progression).toBe(primary);
    expect(fixtures.map((fixture) => fixture.role)).toEqual([
      "closest",
      "moderate",
      "distinct",
    ]);
    expect(
      new Set(
        fixtures.map((fixture) =>
          fixture.progression
            .map(({ chord }) => chord.absoluteSymbol)
            .join("|"),
        ),
      ).size,
    ).toBe(3);
  });

  it("uses simple triads for the fixture alternatives", () => {
    const fixtures = buildCandidateFixtures(
      cMajor,
      "simple",
      primaryProgression(),
    );

    expect(
      fixtures.slice(1).every((fixture) =>
        fixture.progression.every(({ chord }) => chord.quality === "triad"),
      ),
    ).toBe(true);
  });

  it("uses seventh qualities for jazzy fixture alternatives", () => {
    const fixtures = buildCandidateFixtures(
      cMajor,
      "jazzy",
      primaryProgression(),
    );

    expect(
      fixtures.slice(1).every((fixture) =>
        fixture.progression.every(({ chord }) =>
          ["maj7", "min7", "dom7"].includes(chord.quality),
        ),
      ),
    ).toBe(true);
  });
});
