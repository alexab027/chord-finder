import { describe, expect, it } from "vitest";
import { DEFAULT_INTERPRETED_STYLE } from "../../ai/types";
import type { CandidateSet } from "../../harmony/candidates/types";
import { candidatePreviewReducer } from "./useCandidatePreview";

function fixtureCandidateSet(): CandidateSet {
  return {
    id: "candidate-set-1",
    sessionId: "session-1",
    requestId: "request-1",
    mode: "generate_new",
    keyLabel: "C major",
    commitLabel: "Generated",
    baseProgression: null,
    baseVoicedProgression: [[], [], [], []],
    baseInterpretation: null,
    resultInterpretation: DEFAULT_INTERPRETED_STYLE,
    candidates: [
      {
        id: "closest",
        symbolicHash: "closest-hash",
        role: "closest",
        progression: [],
        voicedProgression: [[], [], [], []],
        totalScore: 3,
      },
      {
        id: "moderate",
        symbolicHash: "moderate-hash",
        role: "moderate",
        progression: [],
        voicedProgression: [[], [], [], []],
        totalScore: 2,
      },
      {
        id: "distinct",
        symbolicHash: "distinct-hash",
        role: "distinct",
        progression: [],
        voicedProgression: [[], [], [], []],
        totalScore: 1,
      },
    ],
    previewedCandidateId: "closest",
    status: "previewing",
  };
}

describe("candidatePreviewReducer", () => {
  it("opens with the first fixture candidate previewed", () => {
    const candidateSet = fixtureCandidateSet();

    expect(
      candidatePreviewReducer(null, { type: "open", candidateSet }),
    ).toEqual(candidateSet);
  });

  it("changes only the previewed candidate while previewing", () => {
    const candidateSet = fixtureCandidateSet();
    const next = candidatePreviewReducer(candidateSet, {
      type: "preview",
      candidateSetId: candidateSet.id,
      candidateId: "moderate",
    });

    expect(next).toEqual({
      ...candidateSet,
      previewedCandidateId: "moderate",
    });
    expect(next?.baseProgression).toBe(candidateSet.baseProgression);
  });

  it("ignores missing candidates and stale candidate-set IDs", () => {
    const candidateSet = fixtureCandidateSet();

    expect(
      candidatePreviewReducer(candidateSet, {
        type: "preview",
        candidateSetId: candidateSet.id,
        candidateId: "missing",
      }),
    ).toBe(candidateSet);
    expect(
      candidatePreviewReducer(candidateSet, {
        type: "cancel",
        candidateSetId: "candidate-set-old",
      }),
    ).toBe(candidateSet);
  });

  it("closes the transaction as selected or cancelled", () => {
    const candidateSet = fixtureCandidateSet();

    expect(
      candidatePreviewReducer(candidateSet, {
        type: "select",
        candidateSetId: candidateSet.id,
      })?.status,
    ).toBe("selected");
    expect(
      candidatePreviewReducer(candidateSet, {
        type: "cancel",
        candidateSetId: candidateSet.id,
      })?.status,
    ).toBe("cancelled");
  });
});
