import {
  getMeasureLowestMelodyMidi,
  midiToSpelledPitch,
  mod12,
  parsePitchToMidi,
} from "./noteUtils";
import type {
  GenerationPreferences,
  PlacedChord,
  PlacedNote,
  ScoredChord,
  StyleOption,
} from "./types";

export type VoicingLimits = {
  minPitchNumber: number;
  maxPitchNumber: number;
  maxTotalSpan: number;
  maxAdjacentUpperVoiceGap: number;
  maxBassToNextVoiceGap: number;
};

// Project pitch numbers use parsePitchToMidi("c/4") === 48. These are not
// documented as standard MIDI bounds; they follow the app's existing convention.
export const RELAXED_VOICING_LIMITS: VoicingLimits = {
  minPitchNumber: 24,
  maxPitchNumber: 59,
  maxTotalSpan: 24,
  maxAdjacentUpperVoiceGap: 12,
  maxBassToNextVoiceGap: 16,
};

export const DEFAULT_ONE_HAND_VOICING_LIMITS: VoicingLimits = {
  ...RELAXED_VOICING_LIMITS,
  maxTotalSpan: 12,
  maxAdjacentUpperVoiceGap: 7,
  maxBassToNextVoiceGap: 7,
};

const MIN_ADJACENT_VOICE_GAP = 3;
const CANDIDATE_ADJACENT_VOICE_GAPS = [1, 2, 3, 4, 5, 7];
const MIN_CHORD_MELODY_GAP_SEMITONES = 5;
const PREFERRED_BASS_PITCH_NUMBER = 36;
const PREFERRED_TOTAL_SPAN = 18;
const PREFERRED_UPPER_GAP = 9;
const PREFERRED_BASS_MOTION = 7;

function getNearestPitchAtLeast(referencePitchNumber: number, pc: number) {
  let candidate = Math.floor(referencePitchNumber / 12) * 12 + mod12(pc);
  while (candidate < referencePitchNumber) {
    candidate += 12;
  }
  return candidate;
}

function buildAscendingVoicing(
  pcs: number[],
  bassPitchNumber: number,
  minAdjacentGap: number
) {
  return pcs.reduce<number[]>((pitchNumbers, pc, index) => {
    if (index === 0) return [bassPitchNumber];
    const previous = pitchNumbers[pitchNumbers.length - 1];
    return [
      ...pitchNumbers,
      getNearestPitchAtLeast(previous + minAdjacentGap, pc),
    ];
  }, []);
}

function getPitchClasses(pitchNumbers: number[]) {
  return pitchNumbers.map((pitchNumber) => mod12(pitchNumber));
}

export function isVoicingPlayable(
  pitchNumbers: number[],
  limits: VoicingLimits = DEFAULT_ONE_HAND_VOICING_LIMITS
) {
  if (pitchNumbers.length === 0) return false;

  const sorted = [...pitchNumbers].sort((a, b) => a - b);
  const hasVoiceCrossing = pitchNumbers.some(
    (pitchNumber, index) => pitchNumber !== sorted[index]
  );
  if (hasVoiceCrossing) return false;

  if (
    pitchNumbers.some(
      (pitchNumber) =>
        pitchNumber < limits.minPitchNumber ||
        pitchNumber > limits.maxPitchNumber
    )
  ) {
    return false;
  }

  const totalSpan = pitchNumbers[pitchNumbers.length - 1] - pitchNumbers[0];
  if (totalSpan > limits.maxTotalSpan) return false;

  if (
    pitchNumbers.length > 1 &&
    pitchNumbers[1] - pitchNumbers[0] > limits.maxBassToNextVoiceGap
  ) {
    return false;
  }

  for (let index = 2; index < pitchNumbers.length; index++) {
    if (
      pitchNumbers[index] - pitchNumbers[index - 1] >
      limits.maxAdjacentUpperVoiceGap
    ) {
      return false;
    }
  }

  for (let left = 0; left < pitchNumbers.length; left++) {
    for (let right = left + 1; right < pitchNumbers.length; right++) {
      const samePc = mod12(pitchNumbers[left]) === mod12(pitchNumbers[right]);
      if (samePc && Math.abs(pitchNumbers[right] - pitchNumbers[left]) > 12) {
        return false;
      }
    }
  }

  return true;
}

function scoreVoicing(
  pitchNumbers: number[],
  previousPitchNumbers: number[] | undefined,
  lowestMelodyPitchNumber: number | undefined,
  voiceLeadingPriority: number
) {
  let score = 0;
  const totalSpan = pitchNumbers[pitchNumbers.length - 1] - pitchNumbers[0];
  score -= Math.abs(pitchNumbers[0] - PREFERRED_BASS_PITCH_NUMBER) * 0.18;
  score -= Math.max(0, totalSpan - PREFERRED_TOTAL_SPAN) * 0.8;

  for (let index = 2; index < pitchNumbers.length; index++) {
    score -= Math.max(0, pitchNumbers[index] - pitchNumbers[index - 1] - PREFERRED_UPPER_GAP);
  }

  if (lowestMelodyPitchNumber !== undefined) {
    const top = pitchNumbers[pitchNumbers.length - 1];
    if (top <= lowestMelodyPitchNumber - MIN_CHORD_MELODY_GAP_SEMITONES) {
      score += 3;
    } else {
      score -= 4;
    }
  }

  if (previousPitchNumbers) {
    const previousPcs = new Set(getPitchClasses(previousPitchNumbers));
    const commonToneCount = getPitchClasses(pitchNumbers).filter((pc) =>
      previousPcs.has(pc)
    ).length;
    const bassMotion = Math.abs(pitchNumbers[0] - previousPitchNumbers[0]);
    const sharedLength = Math.min(pitchNumbers.length, previousPitchNumbers.length);
    const totalMovement = pitchNumbers
      .slice(0, sharedLength)
      .reduce(
        (total, pitchNumber, index) =>
          total + Math.abs(pitchNumber - previousPitchNumbers[index]),
        0
      );

    score += commonToneCount * 2 * voiceLeadingPriority;
    score -= Math.max(0, bassMotion - PREFERRED_BASS_MOTION) * voiceLeadingPriority;
    score -= totalMovement * 0.12 * voiceLeadingPriority;
  }

  return score;
}

type VoicingTone = {
  pc: number;
  noteName: string;
};

type CandidateVoicing = {
  pitchNumbers: number[];
  noteNames: string[];
};

function getCompleteToneInversions(pcs: number[], noteNames: string[]) {
  const tones = pcs.map((pc, index) => ({ pc, noteName: noteNames[index] }));

  return tones.map((bassTone) => [
    bassTone,
    ...tones
      .filter((tone) => tone !== bassTone)
      .sort(
        (left, right) =>
          mod12(left.pc - bassTone.pc) - mod12(right.pc - bassTone.pc)
      ),
  ]);
}

function buildCandidateVoicings(
  toneOrders: VoicingTone[][],
  previousBassPitchNumber: number | undefined,
  style: StyleOption,
  limits: VoicingLimits
) {
  return toneOrders.flatMap((tones) => {
    const candidateBassPitchNumbers: number[] = [];

    for (
      let pitchNumber = limits.minPitchNumber;
      pitchNumber <= limits.maxPitchNumber;
      pitchNumber++
    ) {
      if (mod12(pitchNumber) === mod12(tones[0].pc)) {
        candidateBassPitchNumbers.push(pitchNumber);
      }
    }

    const basses =
      style === "descendingBass" && previousBassPitchNumber !== undefined
        ? candidateBassPitchNumbers.filter(
            (pitchNumber) => pitchNumber < previousBassPitchNumber
          )
        : candidateBassPitchNumbers;
    const effectiveBasses =
      basses.length > 0 ? basses : candidateBassPitchNumbers;

    return effectiveBasses.flatMap((bassPitchNumber) =>
      CANDIDATE_ADJACENT_VOICE_GAPS.map((gap): CandidateVoicing => ({
        pitchNumbers: buildAscendingVoicing(
          tones.map((tone) => tone.pc),
          bassPitchNumber,
          gap
        ),
        noteNames: tones.map((tone) => tone.noteName),
      }))
    );
  });
}

function buildFallbackVoicing(
  toneOrders: VoicingTone[][],
  limits: VoicingLimits
): CandidateVoicing {
  for (const tones of toneOrders) {
    const pcs = tones.map((tone) => tone.pc);
    for (
      let bassPitchNumber = getNearestPitchAtLeast(limits.minPitchNumber, pcs[0]);
      bassPitchNumber <= limits.maxPitchNumber;
      bassPitchNumber += 12
    ) {
      const pitchNumbers = buildAscendingVoicing(
        pcs,
        bassPitchNumber,
        MIN_ADJACENT_VOICE_GAP
      );
      if (isVoicingPlayable(pitchNumbers, limits)) {
        return {
          pitchNumbers,
          noteNames: tones.map((tone) => tone.noteName),
        };
      }
    }
  }

  throw new Error(
    `Unable to construct a playable fallback voicing for pitch classes [${toneOrders[0].map((tone) => tone.pc).join(
      ", "
    )}] within the configured limits.`
  );
}

export function choosePlayableVoicing(
  pcs: number[],
  noteNames: string[],
  options: {
    lowestMelodyPitchNumber?: number;
    previousPitchNumbers?: number[];
    previousBassPitchNumber?: number;
    style?: StyleOption;
    voiceLeadingPriority?: number;
    playabilityRequired?: boolean;
    limits?: VoicingLimits;
  } = {}
) {
  const playabilityRequired = options.playabilityRequired ?? true;
  const limits =
    options.limits ??
    (playabilityRequired
      ? DEFAULT_ONE_HAND_VOICING_LIMITS
      : RELAXED_VOICING_LIMITS);
  const style = options.style ?? "simple";
  const voiceLeadingPriority = options.voiceLeadingPriority ?? 0.75;
  const toneOrders = getCompleteToneInversions(pcs, noteNames);
  const candidates = buildCandidateVoicings(
    toneOrders,
    options.previousBassPitchNumber,
    style,
    limits
  ).filter(({ pitchNumbers }) => isVoicingPlayable(pitchNumbers, limits));

  const chosen =
    candidates
      .map((candidate) => ({
        ...candidate,
        score: scoreVoicing(
          candidate.pitchNumbers,
          options.previousPitchNumbers,
          options.lowestMelodyPitchNumber,
          voiceLeadingPriority
        ),
      }))
      .sort((a, b) => b.score - a.score)[0] ??
    buildFallbackVoicing(toneOrders, limits);

  return chosen.pitchNumbers.map((pitchNumber, index) =>
    midiToSpelledPitch(pitchNumber, chosen.noteNames[index])
  );
}

// Pure projection of the musical progression (ScoredChord[]) into the
// rendered/voiced representation (PlacedChord[][]).
//
// This is the logic previously inlined in Staff.tsx (handleGenerateProgression);
// it is lifted verbatim so behavior is unchanged. Voicing is contextual: each
// measure's octave placement depends on that measure's lowest melody note and,
// on the descending-bass style, on the previous chord's bass. Because callers
// always re-derive the entire array from the current ScoredChord[], an edited
// chord automatically re-voices against its new neighbors.
export function voiceProgression(
  progression: ScoredChord[],
  measures: PlacedNote[][],
  getRenderedPitchFn: (note: PlacedNote) => string,
  style: StyleOption,
  preferences?: GenerationPreferences
): PlacedChord[][] {
  let previousBassMidi: number | undefined;
  let previousPitchNumbers: number[] | undefined;

  return progression.map((scoredChord, measureIndex) => {
    const chord = scoredChord.chord;
    const lowestMelodyMidi = getMeasureLowestMelodyMidi(
      measures[measureIndex],
      getRenderedPitchFn
    );
    const pitches = choosePlayableVoicing(
      chord.pcs,
      chord.noteNames,
      {
        lowestMelodyPitchNumber: lowestMelodyMidi,
        previousPitchNumbers,
        previousBassPitchNumber:
          style === "descendingBass" ? previousBassMidi : undefined,
        style,
        voiceLeadingPriority: preferences?.voiceLeadingPriority,
        playabilityRequired: preferences?.playabilityRequired,
      }
    );

    previousBassMidi = parsePitchToMidi(pitches[0]) ?? previousBassMidi;
    previousPitchNumbers = pitches
      .map((pitch) => parsePitchToMidi(pitch))
      .filter((pitchNumber): pitchNumber is number => pitchNumber !== undefined);

    return [
      {
        slot: 0,
        duration: "w",
        durationSlots: 8,
        pitches,
        symbol: chord.name,
        score: scoredChord.score,
        reasons: scoredChord.reasons,
      },
    ];
  });
}
