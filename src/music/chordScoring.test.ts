import { describe, expect, it } from "vitest";
import { DEFAULT_HARMONY_PROFILE } from "../harmony/preferences";
import { buildNamedChord } from "./chords";
import type {
  ChordCandidate,
  ChordScoreContext,
  KeyContext,
  PlacedNote,
} from "./types";
import {
  getIntervalDissonancePenalty,
  isStepwiseResolution,
  MELODY_WEIGHT,
  scoreChord,
  scoreChordMovement,
  scoreKeyFit,
  scoreMelodyFit,
  scorePreferences,
  scoreRevisionSimilarity,
  scoreStyle,
  type MelodyEvent,
} from "./chordScoring";

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

function triad(name: string, pcs: number[]): ChordCandidate {
  return {
    degree: 1,
    name,
    romanNumeral: name,
    absoluteSymbol: name,
    rootName: name,
    rootPc: pcs[0],
    bassPc: pcs[0],
    pcs,
    noteNames: ["c", "e", "g"].slice(0, pcs.length),
    pitches: [],
    quality: "triad",
    keyFit: "diatonic",
  };
}

function note(pitch: string, slot: number, durationSlots: number): PlacedNote {
  return {
    pitch,
    slot,
    durationSlots,
    duration: durationSlots >= 4 ? "h" : durationSlots === 2 ? "q" : "8",
    kind: "note",
    accidental: null,
  };
}

const renderPitch = (placedNote: PlacedNote) => placedNote.pitch;

describe("directed interval dissonance", () => {
  it.each([
    [0, 0],
    [1, 5],
    [2, 1.2],
    [3, 0],
    [4, 0],
    [5, 0.8],
    [6, 3.2],
    [7, 0],
    [8, 0.8],
    [9, 0],
    [10, 1.4],
    [11, 5],
  ])(
    "uses the penalty for directed semitone class %i",
    (melodyPc, expectedPenalty) => {
      expect(getIntervalDissonancePenalty(melodyPc, 0)).toBe(expectedPenalty);
    },
  );

  it("does not fold opposite interval directions into one class", () => {
    expect(getIntervalDissonancePenalty(2, 0)).toBe(1.2);
    expect(getIntervalDissonancePenalty(10, 0)).toBe(1.4);
    expect(getIntervalDissonancePenalty(5, 0)).toBe(0.8);
    expect(getIntervalDissonancePenalty(7, 0)).toBe(0);
  });

  it("normalizes pitch classes before selecting a directed penalty", () => {
    expect(getIntervalDissonancePenalty(14, 12)).toBe(1.2);
    expect(getIntervalDissonancePenalty(-2, 0)).toBe(1.4);
  });

  it("keeps stepwise resolution based on shortest pitch-class distance", () => {
    const event = (pc: number, index: number): MelodyEvent => ({
      note: note("c/5", index, 1),
      pc,
      label: "test",
      importance: 1,
      index,
    });

    expect(
      isStepwiseResolution(event(11, 0), [event(11, 0), event(1, 1)]),
    ).toBe(true);
    expect(isStepwiseResolution(event(1, 0), [event(1, 0), event(11, 1)])).toBe(
      true,
    );
  });
});

describe("melody-fit scoring", () => {
  it("rewards a chord containing an important melody note over an exposed minor-second clash", () => {
    const melody = [note("eb/5", 0, 4)];
    const supportsEb = triad("Eb", [3, 7, 10]);
    const clashesWithEb = triad("D-F shell", [2, 5, 9]);

    const supported = scoreMelodyFit(supportsEb, melody, renderPitch, cMajor, {
      melodyFitPriority: 1,
      consonancePriority: 0.9,
      dissonanceTolerance: 0.1,
    });
    const clashing = scoreMelodyFit(
      clashesWithEb,
      melody,
      renderPitch,
      cMajor,
      {
        melodyFitPriority: 1,
        consonancePriority: 0.9,
        dissonanceTolerance: 0.1,
      },
    );

    expect(supported.points).toBeGreaterThan(clashing.points);
  });

  it("penalizes a long strong-beat dissonance more than a short weak-beat dissonance", () => {
    const chord = triad("D-F shell", [2, 5, 9]);
    const strongLong = scoreMelodyFit(
      chord,
      [note("eb/5", 0, 4)],
      renderPitch,
      cMajor,
      { consonancePriority: 0.9, dissonanceTolerance: 0.1 },
    );
    const weakShort = scoreMelodyFit(
      chord,
      [note("eb/5", 1, 1)],
      renderPitch,
      cMajor,
      { consonancePriority: 0.9, dissonanceTolerance: 0.1 },
    );

    expect(strongLong.points).toBeLessThan(weakShort.points);
  });

  it("penalizes a brief stepwise passing tone less than a sustained unresolved non-chord tone", () => {
    const chord = triad("C", [0, 4, 7]);
    const passing = scoreMelodyFit(
      chord,
      [note("d/5", 1, 1), note("e/5", 2, 2)],
      renderPitch,
      cMajor,
      { consonancePriority: 0.9, dissonanceTolerance: 0.1 },
    );
    const unresolved = scoreMelodyFit(
      chord,
      [note("d/5", 0, 4)],
      renderPitch,
      cMajor,
      { consonancePriority: 0.9, dissonanceTolerance: 0.1 },
    );

    expect(passing.points).toBeGreaterThan(unresolved.points);
  });

  it("increasing dissonance tolerance reduces but does not eliminate dissonance penalty", () => {
    const chord = triad("D-F shell", [2, 5, 9]);
    const melody = [note("eb/5", 0, 4)];
    const strict = scoreMelodyFit(chord, melody, renderPitch, cMajor, {
      consonancePriority: 0.9,
      dissonanceTolerance: 0,
    });
    const tolerant = scoreMelodyFit(chord, melody, renderPitch, cMajor, {
      consonancePriority: 0.9,
      dissonanceTolerance: 1,
    });

    expect(tolerant.points).toBeGreaterThan(strict.points);
    expect(tolerant.points).toBeLessThan(0);
  });

  it("does not force a repeated G melody into an Am7 accompaniment in simple mode", () => {
    const melody = [
      note("g/5", 0, 2),
      note("g/5", 2, 2),
      note("g/5", 4, 2),
      note("g/5", 6, 2),
    ];
    const am = buildNamedChord(aMinor, "Am")!;
    const am7 = buildNamedChord(aMinor, "Am7")!;
    const context = {
      key: aMinor,
      style: "simple" as const,
      measureNotes: melody,
      measureIndex: 0,
      measureCount: 4,
      getRenderedPitchFn: renderPitch,
      preferences: DEFAULT_HARMONY_PROFILE,
    };

    expect(scoreChord(am, context).score).toBeGreaterThan(
      scoreChord(am7, context).score,
    );
  });
});

describe("per-chord score aggregation", () => {
  it("applies MELODY_WEIGHT to melody fit without scaling other components", () => {
    const candidate = triad("I", [0, 4, 7]);
    const melody = [note("c/5", 0, 4)];
    const context: ChordScoreContext = {
      key: cMajor,
      style: "simple",
      measureNotes: melody,
      measureIndex: 0,
      measureCount: 4,
      getRenderedPitchFn: renderPitch,
    };
    const melodyResult = scoreMelodyFit(
      candidate,
      melody,
      renderPitch,
      cMajor,
      { simpleAccompaniment: true },
    );
    const otherScore =
      scoreKeyFit(candidate, cMajor).points +
      scoreStyle(candidate, "simple", context).points +
      scoreChordMovement(undefined, candidate).points;

    expect(scoreChord(candidate, context).score).toBeCloseTo(
      melodyResult.points * MELODY_WEIGHT + otherScore,
    );
    expect(scoreChord(candidate, context).score - otherScore).toBeCloseTo(
      melodyResult.points * MELODY_WEIGHT,
    );
    expect(MELODY_WEIGHT).toBeGreaterThan(1);
    expect(scoreChord(candidate, context).score - otherScore).toBeGreaterThan(
      melodyResult.points,
    );
  });

  it("keeps key, style, and movement points numerically unchanged", () => {
    const dominant = { ...triad("V", [7, 11, 2]), degree: 5 };
    const tonic = triad("I", [0, 4, 7]);
    const context: ChordScoreContext = {
      key: cMajor,
      style: "simple",
      measureNotes: [],
      measureIndex: 1,
      measureCount: 4,
      getRenderedPitchFn: renderPitch,
      previousChord: dominant,
    };

    expect(scoreKeyFit(tonic, cMajor).points).toBe(4);
    expect(scoreStyle(tonic, "simple", context).points).toBe(5);
    expect(scoreChordMovement(dominant, tonic).points).toBe(5);
    expect(scoreChord(tonic, context).score).toBe(14);
  });

  it("preserves reasons from melody and every other score component", () => {
    const dominant = { ...triad("V", [7, 11, 2]), degree: 5 };
    const candidate = triad("I", [0, 4, 7]);
    const preferences = {
      ...DEFAULT_HARMONY_PROFILE,
      complexity: 0.2,
    };
    const context: ChordScoreContext = {
      key: cMajor,
      style: "simple",
      measureNotes: [note("c/5", 0, 4)],
      measureIndex: 1,
      measureCount: 4,
      getRenderedPitchFn: renderPitch,
      previousChord: dominant,
      preferences,
      revision: {
        preserveOverallProgression: true,
        changeAmount: 0.2,
      },
      revisionTarget: {
        degree: candidate.degree,
        rootPc: candidate.rootPc,
        quality: candidate.quality,
        bassPc: candidate.bassPc,
      },
      revisionLocked: true,
    };
    const melodyResult = scoreMelodyFit(
      candidate,
      context.measureNotes,
      renderPitch,
      cMajor,
      {
        melodyFitPriority: preferences.melodyFitPriority,
        consonancePriority: preferences.consonancePriority,
        dissonanceTolerance: preferences.dissonanceTolerance,
        isFinalMeasure: false,
        simpleAccompaniment: true,
      },
    );
    const otherParts = [
      scoreKeyFit(candidate, cMajor),
      scoreStyle(candidate, "simple", context),
      scoreChordMovement(dominant, candidate),
      scorePreferences(candidate, preferences),
      scoreRevisionSimilarity(candidate, context),
    ];

    expect(scoreChord(candidate, context).reasons).toEqual([
      ...melodyResult.reasons,
      ...otherParts.flatMap((part) => part.reasons),
    ]);
  });
});

describe("chord movement scoring", () => {
  it("rewards V-I more strongly than unrelated movement", () => {
    const dominant = { ...triad("V", [7, 11, 2]), degree: 5 };
    const tonic = { ...triad("I", [0, 4, 7]), degree: 1 };
    const mediant = { ...triad("iii", [4, 7, 11]), degree: 3 };

    expect(scoreChordMovement(dominant, tonic).points).toBeGreaterThan(
      scoreChordMovement(dominant, mediant).points,
    );
  });

  it("returns no movement score for the opening chord", () => {
    expect(scoreChordMovement(undefined, triad("I", [0, 4, 7]))).toEqual({
      points: 0,
      reasons: [],
    });
  });
});
