import { describe, expect, it } from "vitest";
import { DEFAULT_INTERPRETED_STYLE } from "../../ai/types";
import { toGenerationPreferences } from "../../ai/toGenerationPreferences";
import { buildCandidatePool } from "../../harmony/candidates/buildCandidatePool";
import { candidateHash } from "../../harmony/candidates/candidateHash";
import type { CandidateSet } from "../../harmony/candidates/types";
import { progressionComplexity } from "../../harmony/transforms/styleTransforms";
import { buildNamedChord } from "../../music/chords";
import { rankProgressions } from "../../music/chordGeneration";
import type {
  KeyContext,
  PlacedChord,
  PlacedNote,
  RevisionContext,
  ScoredChord,
} from "../../music/types";
import {
  getStyleBoundaryNotice,
  prepareReopenedCandidateSet,
  prepareVisibleCandidates,
} from "./useHarmonyController";

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

function visibleVoicing(progression: ScoredChord[]): PlacedChord[][] {
  return progression.map(({ chord }) => [
    {
      slot: 0,
      duration: "w",
      durationSlots: 8,
      pitches: ["c/3", "e/3", "g/3"],
      symbol: chord.absoluteSymbol,
    },
  ]);
}

function outsideGrammarBase(): ScoredChord[] {
  return ["Dm7", "E7", "Am7", "Fmaj7"].map((symbol) => ({
    chord: buildNamedChord(aMinor, symbol)!,
    score: 0,
    reasons: [],
  }));
}

function revisionContext(base: ScoredChord[]): RevisionContext {
  return {
    targets: base.map(({ chord }) => ({
      degree: chord.degree,
      rootPc: chord.rootPc,
      quality: chord.quality,
      bassPc: chord.bassPc,
      inversion: chord.inversion,
    })),
    preserveOverallProgression: true,
    preserveChordPositions: [],
    changeAmount: 0.3,
  };
}

describe("prepareVisibleCandidates", () => {
  it("voices only the earned visible candidates from the larger real pool", () => {
    const preferences = toGenerationPreferences(DEFAULT_INTERPRETED_STYLE);
    const pool = buildCandidatePool({
      mode: "generate_new",
      key: cMajor,
      measures: emptyMeasures,
      getRenderedPitchFn: noPitch,
      style: preferences.style,
      preferences,
    });
    let voicingCalls = 0;
    const candidates = prepareVisibleCandidates({
      mode: "generate_new",
      key: cMajor,
      measures: emptyMeasures,
      getRenderedPitchFn: noPitch,
      style: preferences.style,
      preferences,
      currentProgression: null,
      voiceProgressionFn: (progression) => {
        voicingCalls += 1;
        return visibleVoicing(progression);
      },
    });

    expect(pool.length).toBeGreaterThan(candidates.length);
    expect(candidates.map(({ role }) => role)).toEqual([
      "closest",
      "moderate",
      "distinct",
    ]);
    expect(voicingCalls).toBe(candidates.length);
    expect(new Set(candidates.map(({ symbolicHash }) => symbolicHash)).size).toBe(
      candidates.length,
    );
  });

  it("excludes the committed progression from an explicit generate-new request", () => {
    const preferences = toGenerationPreferences(DEFAULT_INTERPRETED_STYLE);
    const current = rankProgressions(
      cMajor,
      emptyMeasures,
      noPitch,
      preferences.style,
      preferences,
    )[0].progression;
    const candidates = prepareVisibleCandidates({
      mode: "generate_new",
      key: cMajor,
      measures: emptyMeasures,
      getRenderedPitchFn: noPitch,
      style: preferences.style,
      preferences,
      currentProgression: current,
      voiceProgressionFn: visibleVoicing,
    });

    expect(
      candidates.some(
        ({ symbolicHash }) => symbolicHash === candidateHash(current),
      ),
    ).toBe(false);
  });

  it("preserves an unusual selected root path in a real revision candidate", () => {
    const base = outsideGrammarBase();
    const preferences = {
      ...toGenerationPreferences(DEFAULT_INTERPRETED_STYLE),
      style: "simple" as const,
    };
    const candidates = prepareVisibleCandidates({
      mode: "revise_existing",
      key: aMinor,
      measures: emptyMeasures,
      getRenderedPitchFn: noPitch,
      style: preferences.style,
      preferences,
      revision: revisionContext(base),
      currentProgression: base,
      voiceProgressionFn: visibleVoicing,
    });
    const baseRoots = base.map(({ chord }) => chord.rootPc);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].role).toBe("closest");
    expect(candidates[0].progression.map(({ chord }) => chord.rootPc)).toEqual(
      baseRoots,
    );
    expect(candidates[0].progression.map(({ chord }) => chord.quality)).toEqual([
      "triad",
      "triad",
      "triad",
      "triad",
    ]);
  });

  it("selects roles only from candidates satisfying the discrete style transform", () => {
    const base = outsideGrammarBase();
    const preferences = {
      ...toGenerationPreferences(DEFAULT_INTERPRETED_STYLE),
      style: "simple" as const,
      simplicityLevel: 2 as const,
      styleTransform: "simple" as const,
    };
    const candidates = prepareVisibleCandidates({
      mode: "revise_existing",
      key: aMinor,
      measures: emptyMeasures,
      getRenderedPitchFn: noPitch,
      style: "simple",
      preferences,
      revision: revisionContext(base),
      currentProgression: base,
      voiceProgressionFn: visibleVoicing,
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(
      candidates.every(
        ({ progression }) => progressionComplexity(progression) <= 4,
      ),
    ).toBe(true);
  });

  it("applies every combined exact edit to every visible creative candidate", () => {
    const preferences = toGenerationPreferences(DEFAULT_INTERPRETED_STYLE);
    const candidates = prepareVisibleCandidates({
      mode: "generate_new",
      key: cMajor,
      measures: emptyMeasures,
      getRenderedPitchFn: noPitch,
      style: preferences.style,
      preferences,
      currentProgression: null,
      exactActions: [
        { type: "replace_chord", measure: 2, chordName: "F" },
        { type: "replace_chord", measure: 4, chordName: "Am" },
      ],
      voiceProgressionFn: visibleVoicing,
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(
      candidates.every(
        ({ progression }) =>
          progression[1].chord.absoluteSymbol === "F" &&
          progression[3].chord.absoluteSymbol === "Am",
      ),
    ).toBe(true);
  });

  it("filters committed hashes before selecting generate-new roles", () => {
    const preferences = toGenerationPreferences(DEFAULT_INTERPRETED_STYLE);
    const first = prepareVisibleCandidates({
      mode: "generate_new",
      key: cMajor,
      measures: emptyMeasures,
      getRenderedPitchFn: noPitch,
      style: preferences.style,
      preferences,
      currentProgression: null,
      voiceProgressionFn: visibleVoicing,
    });
    const next = prepareVisibleCandidates({
      mode: "generate_new",
      key: cMajor,
      measures: emptyMeasures,
      getRenderedPitchFn: noPitch,
      style: preferences.style,
      preferences,
      currentProgression: null,
      seenHashes: first.map(({ symbolicHash }) => symbolicHash),
      voiceProgressionFn: visibleVoicing,
    });

    expect(
      next.every(
        ({ symbolicHash }) =>
          !first.some((candidate) => candidate.symbolicHash === symbolicHash),
      ),
    ).toBe(true);
  });
});

describe("prepareReopenedCandidateSet", () => {
  it("uses current committed state as the new base instead of stale archive state", () => {
    const archivedBase = outsideGrammarBase();
    const currentBase = outsideGrammarBase().map((item, index) =>
      index === 0
        ? { ...item, chord: buildNamedChord(aMinor, "Am")! }
        : item,
    );
    const candidate = {
      id: candidateHash(archivedBase),
      symbolicHash: candidateHash(archivedBase),
      role: "closest" as const,
      progression: archivedBase,
      voicedProgression: visibleVoicing(archivedBase),
      totalScore: 1,
    };
    const archived: CandidateSet = {
      id: "old-set",
      sessionId: "session-old",
      requestId: "request-old",
      mode: "revise_existing",
      keyLabel: "A minor",
      commitLabel: "Updated",
      baseProgression: archivedBase,
      baseVoicedProgression: visibleVoicing(archivedBase),
      baseInterpretation: null,
      resultInterpretation: DEFAULT_INTERPRETED_STYLE,
      candidates: [candidate],
      previewedCandidateId: candidate.id,
      status: "selected",
    };
    const currentVoicing = visibleVoicing(currentBase);
    const reopened = prepareReopenedCandidateSet({
      archived,
      candidateId: candidate.id,
      sessionId: "session-current",
      requestId: "request-new",
      currentProgression: currentBase,
      currentVoicedProgression: currentVoicing,
      currentInterpretation: DEFAULT_INTERPRETED_STYLE,
    });

    expect(reopened?.baseProgression).toBe(currentBase);
    expect(reopened?.baseProgression).not.toBe(archived.baseProgression);
    expect(reopened?.baseVoicedProgression).toEqual(currentVoicing);
    expect(reopened?.requestId).toBe("request-new");
  });
});

describe("getStyleBoundaryNotice", () => {
  it("recognizes the absolute four-measure jazz-color ceiling", () => {
    const notice = getStyleBoundaryNotice("jazzy", outsideGrammarBase());

    expect(notice).toMatchObject({
      currentMetric: 8,
      absoluteBoundary: 8,
      atAbsoluteBoundary: true,
    });
    expect(notice.message).toContain("already very jazzy");
    expect(notice.message).toContain("different options");
  });
});
