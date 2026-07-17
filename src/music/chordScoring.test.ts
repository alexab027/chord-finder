import { describe, expect, it } from "vitest";
import type { ChordCandidate, KeyContext, PlacedNote } from "./types";
import { scoreMelodyFit } from "./chordScoring";

const cMajor: KeyContext = {
  signature: "C",
  label: "C major",
  tonicName: "c",
  tonicPc: 0,
  mode: "major",
};

function triad(name: string, pcs: number[]): ChordCandidate {
  return {
    degree: 1,
    name,
    rootPc: pcs[0],
    bassPc: pcs[0],
    pcs,
    noteNames: ["c", "e", "g"].slice(0, pcs.length),
    pitches: [],
    quality: "triad",
    keyFit: "diatonic",
  };
}

function note(
  pitch: string,
  slot: number,
  durationSlots: number,
): PlacedNote {
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

describe("melody-fit scoring", () => {
  it("rewards a chord containing an important melody note over an exposed minor-second clash", () => {
    const melody = [note("eb/5", 0, 4)];
    const supportsEb = triad("Eb", [3, 7, 10]);
    const clashesWithEb = triad("D-F shell", [2, 5, 9]);

    const supported = scoreMelodyFit(
      supportsEb,
      melody,
      renderPitch,
      cMajor,
      {
        melodyFitPriority: 1,
        consonancePriority: 0.9,
        dissonanceTolerance: 0.1,
      },
    );
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
});
