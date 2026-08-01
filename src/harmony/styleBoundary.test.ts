import { describe, expect, it } from "vitest";
import { buildNamedChord } from "../music/chords";
import type { KeyContext, ScoredChord } from "../music/types";
import { candidateHash } from "./candidates/candidateHash";
import {
  buildStyleAlternativeSearch,
  evaluateStyleBoundary,
  satisfiesStyleConstraint,
  styleConstraintForBoundary,
} from "./styleBoundary";

const cMajor: KeyContext = {
  signature: "C",
  label: "C major",
  tonicName: "c",
  tonicPc: 0,
  mode: "major",
};

function progression(symbols: string[]): ScoredChord[] {
  return symbols.map((symbol) => ({
    chord: buildNamedChord(cMajor, symbol)!,
    score: 0,
    reasons: [],
  }));
}

describe("evaluateStyleBoundary", () => {
  it("does not count equal jazz color as an improvement", () => {
    const result = evaluateStyleBoundary({
      currentProgression: progression(["Cmaj7", "Dm7", "G7", "Cmaj7"]),
      candidates: [progression(["Am7", "Dm7", "G7", "Cmaj7"])],
      direction: "jazzy",
    });

    expect(result).toEqual({
      direction: "jazzy",
      baseMetric: 8,
      bestCandidateMetric: 8,
      improved: false,
      atAbsoluteBoundary: true,
      reason: "absolute_boundary",
    });
  });

  it("does not count equal complexity as simpler", () => {
    const result = evaluateStyleBoundary({
      currentProgression: progression(["Csus2", "F", "G", "C"]),
      candidates: [progression(["C", "Fsus2", "G", "C"])],
      direction: "simple",
    });

    expect(result).toMatchObject({
      baseMetric: 1,
      bestCandidateMetric: 1,
      improved: false,
      atAbsoluteBoundary: false,
      reason: "no_valid_improvement",
    });
  });

  it("recognizes a real directional improvement", () => {
    expect(
      evaluateStyleBoundary({
        currentProgression: progression(["C", "F", "G", "C"]),
        candidates: [progression(["Cmaj7", "Fmaj7", "G7", "Cmaj7"])],
        direction: "jazzy",
      }),
    ).toMatchObject({ improved: true, reason: null });
  });

  it("reports an empty candidate set honestly", () => {
    expect(
      evaluateStyleBoundary({
        currentProgression: progression(["Csus2", "F", "G", "C"]),
        candidates: [],
        direction: "simple",
      }),
    ).toMatchObject({
      bestCandidateMetric: null,
      improved: false,
      reason: "no_valid_improvement",
    });
  });
});

describe("same-level style constraints", () => {
  it("preserves a stored jazz floor", () => {
    const constraint = styleConstraintForBoundary({
      direction: "jazzy",
      metric: 8,
      progressionId: "current",
      originalRequest: "make it jazzier",
    });

    expect(
      satisfiesStyleConstraint(
        progression(["Am7", "Dm7", "G7", "Cmaj7"]),
        constraint,
      ),
    ).toBe(true);
    expect(
      satisfiesStyleConstraint(
        progression(["Am", "Dm7", "G7", "Cmaj7"]),
        constraint,
      ),
    ).toBe(false);
  });

  it("preserves a stored complexity ceiling", () => {
    const constraint = styleConstraintForBoundary({
      direction: "simple",
      metric: 0,
      progressionId: "current",
      originalRequest: "make it simpler",
    });

    expect(
      satisfiesStyleConstraint(progression(["C", "F", "G", "C"]), constraint),
    ).toBe(true);
    expect(
      satisfiesStyleConstraint(
        progression(["Csus2", "F", "G", "C"]),
        constraint,
      ),
    ).toBe(false);
  });

  it("turns a pending follow-up into a broad revision search", () => {
    const current = progression(["Cmaj7", "Dm7", "G7", "Cmaj7"]);
    const search = buildStyleAlternativeSearch(
      {
        direction: "jazzy",
        metric: 8,
        progressionId: candidateHash(current),
        originalRequest: "make it jazzier",
      },
      current,
    );

    expect(search).toMatchObject({
      mode: "revise_existing",
      revision: {
        preserveOverallProgression: false,
        preserveChordPositions: [],
        changeAmount: 1,
      },
      styleConstraint: { metric: "jazzColor", minimum: 8 },
      excludeSeenHashes: true,
    });
  });

  it("rejects stale pending context after the progression changes", () => {
    expect(
      buildStyleAlternativeSearch(
        {
          direction: "simple",
          metric: 0,
          progressionId: "stale",
          originalRequest: "make it simpler",
        },
        progression(["C", "F", "G", "C"]),
      ),
    ).toBeNull();
  });
});
