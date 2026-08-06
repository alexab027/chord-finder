import { describe, expect, it } from "vitest";
import type { KeyContext, ScoredChord } from "./types";
import { buildKeyChords } from "./chords";
import {
  choosePlayableVoicing,
  DEFAULT_ONE_HAND_VOICING_LIMITS,
  getRequiredBassToneOrders,
  isVoicingPlayable,
  RELAXED_VOICING_LIMITS,
  voiceProgression,
  type VoicingLimits,
} from "./voicing";
import { mod12, parsePitchToMidi } from "./noteUtils";
import { DEFAULT_HARMONY_PROFILE } from "../harmony/preferences";

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

function voicedPitchClasses(pitches: string[]) {
  return pitches.map((pitch) => mod12(parsePitchToMidi(pitch) as number));
}

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
    expect(isVoicingPlayable([36, 43, 52], RELAXED_VOICING_LIMITS)).toBe(true);
  });

  it("rejects a wide suspended shape for one hand but allows it when relaxed", () => {
    const wideSuspendedShape = [40, 47, 57];

    expect(
      isVoicingPlayable(wideSuspendedShape, DEFAULT_ONE_HAND_VOICING_LIMITS),
    ).toBe(false);
    expect(isVoicingPlayable(wideSuspendedShape, RELAXED_VOICING_LIMITS)).toBe(
      true,
    );
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
          pitch >= DEFAULT_ONE_HAND_VOICING_LIMITS.minPitchNumber &&
          pitch <= DEFAULT_ONE_HAND_VOICING_LIMITS.maxPitchNumber,
      ),
    ).toBe(true);
    expect(isVoicingPlayable(pitchNumbers as number[])).toBe(true);
  });

  it("fixes the requested bass while allowing upper voices to reorder", () => {
    const pitches = choosePlayableVoicing([4, 0, 7], ["e", "c", "g"], {
      requiredBassPc: 4,
    });

    expect(voicedPitchClasses(pitches)).toEqual([4, 7, 0]);
    expect(
      isVoicingPlayable(pitches.map((pitch) => parsePitchToMidi(pitch)!)),
    ).toBe(true);
  });

  it("deduplicates equivalent upper-tone permutations with repeated pitch classes", () => {
    const orders = getRequiredBassToneOrders(
      [4, 0, 0, 7],
      ["e", "c", "c", "g"],
      4,
    );
    const pitchClassOrders = orders.map((order) =>
      order.map(({ pc }) => mod12(pc)).join(","),
    );

    expect(pitchClassOrders).toHaveLength(3);
    expect(new Set(pitchClassOrders).size).toBe(pitchClassOrders.length);
    expect(pitchClassOrders.every((order) => order.startsWith("4,"))).toBe(
      true,
    );
  });

  it("fails explicitly when the requested bass is not a chord tone", () => {
    expect(() =>
      choosePlayableVoicing([0, 4, 7], ["c", "e", "g"], {
        requiredBassPc: 2,
      }),
    ).toThrow(/required bass pitch class 2 is not present/i);
  });

  it("rejects an unvoiceable required inversion instead of using a playable root position", () => {
    const rootOnlyRange: VoicingLimits = {
      ...DEFAULT_ONE_HAND_VOICING_LIMITS,
      minPitchNumber: 36,
      maxPitchNumber: 47,
    };

    expect(
      voicedPitchClasses(
        choosePlayableVoicing([4, 0, 7], ["e", "c", "g"], {
          limits: rootOnlyRange,
        }),
      )[0],
    ).toBe(0);
    expect(() =>
      choosePlayableVoicing([4, 0, 7], ["e", "c", "g"], {
        requiredBassPc: 4,
        limits: rootOnlyRange,
      }),
    ).toThrow(/playability invariant failed/i);
  });

  it("keeps rendered fallback voicings playable", () => {
    const progression: ScoredChord[] = [
      {
        chord: {
          degree: 1,
          name: "Iadd9",
          romanNumeral: "Iadd9",
          absoluteSymbol: "Cadd9",
          rootName: "C",
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

    const voiced = voiceProgression(progression, [[]], () => "c/5");
    const pitchNumbers = voiced[0][0].pitches.map((pitch) =>
      parsePitchToMidi(pitch),
    );

    expect(isVoicingPlayable(pitchNumbers as number[])).toBe(true);
  });

  it.each([true, false])(
    "preserves every pitch class once, ascending order, and range when playabilityRequired=%s",
    (playabilityRequired) => {
      const inputPcs = [0, 4, 7, 2];
      const pitches = choosePlayableVoicing(inputPcs, ["c", "e", "g", "d"], {
        playabilityRequired,
      });
      const pitchNumbers = pitches.map(
        (pitch) => parsePitchToMidi(pitch) as number,
      );
      const limits = playabilityRequired
        ? DEFAULT_ONE_HAND_VOICING_LIMITS
        : RELAXED_VOICING_LIMITS;

      expect(pitchNumbers).toHaveLength(inputPcs.length);
      expect(pitchNumbers).toEqual([...pitchNumbers].sort((a, b) => a - b));
      expect(pitchNumbers.map((n) => ((n % 12) + 12) % 12).sort()).toEqual(
        [...inputPcs].sort(),
      );
      expect(
        pitchNumbers.every(
          (pitch) =>
            pitch >= RELAXED_VOICING_LIMITS.minPitchNumber &&
            pitch <= RELAXED_VOICING_LIMITS.maxPitchNumber,
        ),
      ).toBe(true);
      expect(isVoicingPlayable(pitchNumbers, limits)).toBe(true);
    },
  );

  it("reorders a suspended chord into a compact complete voicing", () => {
    const inputPcs = [4, 11, 9];
    const pitches = choosePlayableVoicing(inputPcs, ["e", "b", "a"]);
    const pitchNumbers = pitches.map(
      (pitch) => parsePitchToMidi(pitch) as number,
    );

    expect(pitchNumbers).toHaveLength(inputPcs.length);
    expect(pitchNumbers.at(-1)! - pitchNumbers[0]).toBeLessThanOrEqual(12);
    expect(pitchNumbers).toEqual([...pitchNumbers].sort((a, b) => a - b));
    expect(
      pitchNumbers.map((pitch) => ((pitch % 12) + 12) % 12).sort(),
    ).toEqual([...inputPcs].sort());
  });

  it("permits a wider complete voicing when playability is not required", () => {
    const pitches = choosePlayableVoicing([4, 11, 9], ["e", "b", "a"], {
      playabilityRequired: false,
      previousPitchNumbers: [33, 47, 52],
      voiceLeadingPriority: 10,
    });
    const pitchNumbers = pitches.map(
      (pitch) => parsePitchToMidi(pitch) as number,
    );

    expect(isVoicingPlayable(pitchNumbers, RELAXED_VOICING_LIMITS)).toBe(true);
    expect(pitchNumbers.at(-1)! - pitchNumbers[0]).toBeGreaterThan(12);
  });

  it("fails with a controlled error when no playable voicing fits the limits", () => {
    const impossibleLimits: VoicingLimits = {
      ...DEFAULT_ONE_HAND_VOICING_LIMITS,
      maxTotalSpan: 1,
    };

    expect(() =>
      choosePlayableVoicing([0, 4, 7], ["c", "e", "g"], {
        limits: impossibleLimits,
      }),
    ).toThrow(/playability invariant failed/i);
  });

  it("preserves explicit descending bass behavior when a lower bass is available", () => {
    const progression: ScoredChord[] = [
      {
        chord: {
          degree: 1,
          name: "I",
          romanNumeral: "I",
          absoluteSymbol: "C",
          rootName: "C",
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
          romanNumeral: "VII",
          absoluteSymbol: "B",
          rootName: "B",
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

    const voiced = voiceProgression(progression, [[], []], () => "c/5", {
      ...DEFAULT_HARMONY_PROFILE,
      descendingBassWeight: 1,
    });
    const basses = voiced.map((measure) =>
      parsePitchToMidi(measure[0].pitches[0]),
    );

    expect(basses[1]).toBeLessThan(basses[0] as number);
  });

  it("propagates playabilityRequired through voiceProgression", () => {
    const progression: ScoredChord[] = [
      {
        chord: {
          degree: 1,
          name: "isus",
          romanNumeral: "isus",
          absoluteSymbol: "Csus4",
          rootName: "C",
          rootPc: 0,
          bassPc: 0,
          pcs: [0, 0, 8],
          noteNames: ["c", "c", "g#"],
          pitches: [],
          quality: "sus",
          keyFit: "diatonic",
        },
        score: 0,
        reasons: [],
      },
    ];
    const basePreferences = {
      style: "simple" as const,
      melodyFitPriority: 1,
      consonancePriority: 0.9,
      descendingBassWeight: 0,
      complexity: 0,
      dissonanceTolerance: 0.1,
      cadenceStrength: 0,
      preferSevenths: false,
      preferSuspensions: false,
      voiceLeadingPriority: 0.75,
    };

    expect(() =>
      voiceProgression(progression, [[]], () => "c/5", {
        ...basePreferences,
        playabilityRequired: true,
      }),
    ).toThrow(/playability invariant failed/i);
    const relaxed = voiceProgression(progression, [[]], () => "c/5", {
      ...basePreferences,
      playabilityRequired: false,
    })[0][0].pitches.map((pitch) => parsePitchToMidi(pitch) as number);

    expect(isVoicingPlayable(relaxed, RELAXED_VOICING_LIMITS)).toBe(true);
    expect(relaxed[1] - relaxed[0]).toBeGreaterThan(
      DEFAULT_ONE_HAND_VOICING_LIMITS.maxBassToNextVoiceGap,
    );
  });

  it.each(
    [
      ["root-position triad", "triad", 0],
      ["first-inversion triad", "triad", 1],
      ["second-inversion triad", "triad", 2],
      ["third-inversion seventh chord", "maj7", 3],
    ] as const,
  )(
    "preserves the symbolic bass for a %s",
    (_label, quality, inversion) => {
      const chord = buildKeyChords(cMajor).find(
        (candidate) =>
          candidate.degree === 1 &&
          candidate.quality === quality &&
          candidate.inversion === inversion,
      );
      if (!chord) {
        throw new Error(`Missing test chord: ${quality}/${inversion}`);
      }

      const pitches = voiceProgression(
        [{ chord, score: 0, reasons: [] }],
        [[]],
        () => "c/5",
      )[0][0].pitches;

      expect(mod12(parsePitchToMidi(pitches[0])!)).toBe(chord.bassPc);
    },
  );

  for (const key of [cMajor, aMinor]) {
    const candidates = buildKeyChords(key);

    it(`voices all ${candidates.length} generated candidates for ${key.label} without changing candidate count`, () => {
      const voiced = candidates.map((chord) => ({
        chord,
        pitches: choosePlayableVoicing(chord.pcs, chord.noteNames, {
          requiredBassPc: chord.bassPc,
        }),
      }));

      expect(voiced).toHaveLength(candidates.length);
      expect(
        voiced.every(
          ({ chord, pitches }) =>
            mod12(parsePitchToMidi(pitches[0])!) === chord.bassPc,
        ),
      ).toBe(true);
    });
  }
});
