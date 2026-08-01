import { describe, expect, it } from "vitest";
import { buildKeyChords } from "../../music/chords";
import type {
  KeyContext,
  PlacedChord,
  ScoredChord,
} from "../../music/types";
import {
  calculateCandidateDistance,
  CANDIDATE_DISTANCE_WEIGHTS,
} from "./candidateDistance";

const cMajor: KeyContext = {
  signature: "C",
  label: "C major",
  tonicName: "c",
  tonicPc: 0,
  mode: "major",
};

function progression(): ScoredChord[] {
  const chords = buildKeyChords(cMajor);

  return [1, 5, 6, 4].map((degree) => ({
    chord: chords.find(
      (candidate) =>
        candidate.degree === degree &&
        candidate.quality === "triad" &&
        (candidate.inversion ?? 0) === 0,
    )!,
    score: 0,
    reasons: [],
  }));
}

function changeChord(
  source: ScoredChord[],
  index: number,
  identityChange: Partial<ScoredChord["chord"]>,
) {
  return source.map((scoredChord, measureIndex) =>
    measureIndex === index
      ? {
          ...scoredChord,
          chord: { ...scoredChord.chord, ...identityChange },
        }
      : scoredChord,
  );
}

function voicedProgression(basses: string[]): PlacedChord[][] {
  return basses.map((bass) => [
    {
      slot: 0,
      duration: "w",
      durationSlots: 8,
      pitches: [bass, "e/4", "g/4"],
      symbol: "C",
    },
  ]);
}

describe("calculateCandidateDistance", () => {
  it("returns zero for identical symbolic progressions", () => {
    const base = progression();

    expect(calculateCandidateDistance(base, progression())).toEqual({
      total: 0,
      positionDistance: 0,
      finalRootDistance: 0,
      voicedBassDirectionDistance: 0,
      exactPositionMatches: 4,
    });
  });

  it("weights quality, inversion, and root changes explicitly", () => {
    const base = progression();
    const qualityChanged = changeChord(base, 0, { quality: "sus4" });
    const inversionChanged = changeChord(base, 0, {
      bassPc: 4,
      inversion: 1,
    });
    const rootChanged = changeChord(base, 0, { degree: 2, rootPc: 2 });

    expect(calculateCandidateDistance(base, qualityChanged).total).toBe(
      CANDIDATE_DISTANCE_WEIGHTS.qualityChange,
    );
    expect(calculateCandidateDistance(base, inversionChanged).total).toBe(
      CANDIDATE_DISTANCE_WEIGHTS.bassOrInversionChange,
    );
    expect(calculateCandidateDistance(base, rootChanged).total).toBe(
      CANDIDATE_DISTANCE_WEIGHTS.rootOrDegreeChange,
    );
  });

  it("adds a cadence penalty when the final root or degree changes", () => {
    const base = progression();
    const changed = changeChord(base, 3, { degree: 1, rootPc: 0 });
    const result = calculateCandidateDistance(base, changed);

    expect(result.positionDistance).toBe(
      CANDIDATE_DISTANCE_WEIGHTS.rootOrDegreeChange,
    );
    expect(result.finalRootDistance).toBe(
      CANDIDATE_DISTANCE_WEIGHTS.finalRootOrDegreeChange,
    );
    expect(result.total).toBe(
      CANDIDATE_DISTANCE_WEIGHTS.rootOrDegreeChange +
        CANDIDATE_DISTANCE_WEIGHTS.finalRootOrDegreeChange,
    );
  });

  it("uses voiced bass direction only when both voiced facts exist", () => {
    const base = progression();
    const withoutVoicing = calculateCandidateDistance(base, base);
    const withDifferentDirections = calculateCandidateDistance(base, base, {
      baseVoicedProgression: voicedProgression([
        "c/4",
        "b/3",
        "a/3",
        "g/3",
      ]),
      candidateVoicedProgression: voicedProgression([
        "c/4",
        "d/4",
        "e/4",
        "f/4",
      ]),
    });

    expect(withoutVoicing.voicedBassDirectionDistance).toBe(0);
    expect(withDifferentDirections.voicedBassDirectionDistance).toBe(
      3 * CANDIDATE_DISTANCE_WEIGHTS.voicedBassDirectionMismatch,
    );
  });
});
