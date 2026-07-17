import { describe, expect, it } from "vitest";
import type { ScoredChord } from "./types";
import {
  choosePlayableVoicing,
  DEFAULT_VOICING_LIMITS,
  isVoicingPlayable,
  voiceProgression,
  type VoicingLimits,
} from "./voicing";
import { parsePitchToMidi } from "./noteUtils";

describe("voicing validity", () => {
  it("rejects a chord spanning too many semitones", () => {
    expect(isVoicingPlayable([24, 36, 49])).toBe(false);
  });

  it("rejects an excessive adjacent upper-voice gap", () => {
    expect(isVoicingPlayable([36, 40, 55])).toBe(false);
  });

  it("allows a normal compact triad", () => {
    expect(isVoicingPlayable([36, 40, 43])).toBe(true);
  });

  it("allows a reasonable open voicing", () => {
    expect(isVoicingPlayable([36, 43, 52])).toBe(true);
  });

  it("rejects an excessive bass-to-upper-voice gap", () => {
    expect(isVoicingPlayable([24, 41, 48])).toBe(false);
  });

  it("rejects voice crossing", () => {
    expect(isVoicingPlayable([40, 36, 43])).toBe(false);
  });

  it("chooses playable voicings within configured pitch range", () => {
    const pitches = choosePlayableVoicing([0, 4, 7], ["c", "e", "g"]);
    const pitchNumbers = pitches.map((pitch) => parsePitchToMidi(pitch));

    expect(pitchNumbers.every((pitch) => pitch !== undefined)).toBe(true);
    expect(
      pitchNumbers.every(
        (pitch) =>
          pitch !== undefined &&
          pitch >= DEFAULT_VOICING_LIMITS.minPitchNumber &&
          pitch <= DEFAULT_VOICING_LIMITS.maxPitchNumber,
      ),
    ).toBe(true);
    expect(isVoicingPlayable(pitchNumbers as number[])).toBe(true);
  });

  it("keeps rendered fallback voicings playable", () => {
    const progression: ScoredChord[] = [
      {
        chord: {
          degree: 1,
          name: "Iadd9",
          rootPc: 0,
          bassPc: 0,
          pcs: [0, 4, 7, 2],
          noteNames: ["c", "e", "g", "d"],
          pitches: [],
          quality: "add9",
          keyFit: "diatonic",
        },
        score: 0,
        reasons: [],
      },
    ];

    const voiced = voiceProgression(progression, [[]], () => "c/5", "simple");
    const pitchNumbers = voiced[0][0].pitches.map((pitch) =>
      parsePitchToMidi(pitch),
    );

    expect(isVoicingPlayable(pitchNumbers as number[])).toBe(true);
  });

  it("fallback voicings preserve pitch classes, stay ascending, and are playable", () => {
    const pitches = choosePlayableVoicing(
      [0, 4, 7, 2],
      ["c", "e", "g", "d"],
    );
    const pitchNumbers = pitches.map(
      (pitch) => parsePitchToMidi(pitch) as number,
    );

    expect(pitchNumbers).toEqual([...pitchNumbers].sort((a, b) => a - b));
    expect(pitchNumbers.map((n) => ((n % 12) + 12) % 12)).toEqual([0, 4, 7, 2]);
    expect(isVoicingPlayable(pitchNumbers)).toBe(true);
  });

  it("fails with a controlled error when no playable voicing fits the limits", () => {
    const impossibleLimits: VoicingLimits = {
      ...DEFAULT_VOICING_LIMITS,
      maxTotalSpan: 1,
    };

    expect(() =>
      choosePlayableVoicing([0, 4, 7], ["c", "e", "g"], {
        limits: impossibleLimits,
      }),
    ).toThrow(/playable fallback voicing/i);
  });

  it("preserves explicit descending bass behavior when a lower bass is available", () => {
    const progression: ScoredChord[] = [
      {
        chord: {
          degree: 1,
          name: "I",
          rootPc: 0,
          bassPc: 0,
          pcs: [0, 4, 7],
          noteNames: ["c", "e", "g"],
          pitches: [],
          quality: "triad",
          keyFit: "diatonic",
        },
        score: 0,
        reasons: [],
      },
      {
        chord: {
          degree: 7,
          name: "VII",
          rootPc: 11,
          bassPc: 11,
          pcs: [11, 2, 6],
          noteNames: ["b", "d", "f#"],
          pitches: [],
          quality: "triad",
          keyFit: "diatonic",
        },
        score: 0,
        reasons: [],
      },
    ];

    const voiced = voiceProgression(
      progression,
      [[], []],
      () => "c/5",
      "descendingBass",
    );
    const basses = voiced.map((measure) =>
      parsePitchToMidi(measure[0].pitches[0]),
    );

    expect(basses[1]).toBeLessThan(basses[0] as number);
  });
});
