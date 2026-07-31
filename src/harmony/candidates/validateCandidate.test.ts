import { describe, expect, it } from "vitest";
import { buildKeyChords } from "../../music/chords";
import type {
  KeyContext,
  PlacedChord,
  ScoredChord,
} from "../../music/types";
import { candidateHash } from "./candidateHash";
import {
  validateCandidate,
  validateCandidatePool,
} from "./validateCandidate";

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

function voicedProgression(): PlacedChord[][] {
  return ["c/3", "g/3", "a/3", "f/3"].map((bass) => [
    {
      slot: 0,
      duration: "w",
      durationSlots: 8,
      pitches: [bass, "c/4", "e/4"],
      symbol: "C",
    },
  ]);
}

describe("validateCandidate", () => {
  it("accepts a complete symbolic candidate and returns its hash", () => {
    const candidate = { progression: progression() };

    expect(validateCandidate(candidate)).toEqual({
      valid: true,
      symbolicHash: candidateHash(candidate.progression),
      issues: [],
    });
  });

  it("rejects the wrong measure count and malformed chord identities", () => {
    const malformed = progression().slice(0, 3);
    malformed[1] = {
      ...malformed[1],
      chord: { ...malformed[1].chord, rootPc: 12 },
    };

    expect(validateCandidate({ progression: malformed })).toMatchObject({
      valid: false,
      issues: [
        { code: "invalid_measure_count" },
        { code: "invalid_chord_identity", measure: 2 },
      ],
    });
  });

  it("rejects sparse symbolic measures", () => {
    const sparseProgression = Array(4) as ScoredChord[];

    expect(
      validateCandidate({ progression: sparseProgression }).issues,
    ).toEqual([
      { code: "invalid_chord_identity", measure: 1 },
      { code: "invalid_chord_identity", measure: 2 },
      { code: "invalid_chord_identity", measure: 3 },
      { code: "invalid_chord_identity", measure: 4 },
    ]);
  });

  it("requires four parseable voiced measures for visible candidates", () => {
    expect(
      validateCandidate(
        { progression: progression(), voicedProgression: [[], [], [], []] },
        { requireVoicing: true },
      ).issues,
    ).toContainEqual({ code: "invalid_voicing" });

    expect(
      validateCandidate(
        { progression: progression(), voicedProgression: voicedProgression() },
        { requireVoicing: true },
      ).valid,
    ).toBe(true);
  });

  it("rejects failed exact postconditions atomically", () => {
    const candidate = { progression: progression() };

    expect(
      validateCandidate(candidate, {
        satisfiesExactPostconditions: () => false,
      }).issues,
    ).toContainEqual({ code: "exact_postcondition_failed" });
    expect(
      validateCandidate(candidate, {
        satisfiesExactPostconditions: () => {
          throw new Error("invalid edit");
        },
      }).issues,
    ).toContainEqual({ code: "exact_postcondition_failed" });
  });

  it("can exclude the current progression for explicit new requests", () => {
    const current = progression();

    expect(
      validateCandidate(
        { progression: progression() },
        { excludeProgression: current },
      ).issues,
    ).toContainEqual({ code: "matches_excluded_progression" });
  });

  it("enforces a caller-supplied distance threshold", () => {
    expect(
      validateCandidate(
        { progression: progression(), distanceFromBase: 3 },
        { distanceRange: { min: 4, max: 8 } },
      ).issues,
    ).toContainEqual({ code: "distance_out_of_range" });
  });
});

describe("validateCandidatePool", () => {
  it("removes invalid and duplicate candidates without filling to three", () => {
    const first = { id: "first", progression: progression() };
    const duplicate = { id: "duplicate", progression: progression() };
    const second = {
      id: "second",
      progression: [...progression()].reverse(),
    };
    const invalid = { id: "invalid", progression: progression().slice(0, 3) };

    const result = validateCandidatePool([
      first,
      duplicate,
      second,
      invalid,
    ]);

    expect(result.candidates).toEqual([first, second]);
    expect(result.rejected).toEqual([
      {
        candidate: duplicate,
        issues: [{ code: "duplicate_symbolic_hash" }],
      },
      {
        candidate: invalid,
        issues: [{ code: "invalid_measure_count" }],
      },
    ]);
  });
});
