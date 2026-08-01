import { parsePitchToMidi } from "../../music/noteUtils";
import type { PlacedChord, ScoredChord } from "../../music/types";
import { chordIdentityHash } from "./candidateHash";

export const CANDIDATE_DISTANCE_WEIGHTS = {
  qualityChange: 1,
  bassOrInversionChange: 1,
  rootOrDegreeChange: 3,
  finalRootOrDegreeChange: 2,
  voicedBassDirectionMismatch: 1,
} as const;

export type CandidateDistanceOptions = {
  baseVoicedProgression?: readonly (readonly PlacedChord[])[];
  candidateVoicedProgression?: readonly (readonly PlacedChord[])[];
};

export type CandidateDistanceResult = {
  total: number;
  positionDistance: number;
  finalRootDistance: number;
  voicedBassDirectionDistance: number;
  exactPositionMatches: number;
};

function sameRootAndDegree(left: ScoredChord, right: ScoredChord) {
  return (
    left.chord.degree === right.chord.degree &&
    left.chord.rootPc === right.chord.rootPc
  );
}

function positionDistance(left?: ScoredChord, right?: ScoredChord) {
  if (!left || !right) {
    return CANDIDATE_DISTANCE_WEIGHTS.rootOrDegreeChange;
  }
  if (chordIdentityHash(left) === chordIdentityHash(right)) return 0;
  if (!sameRootAndDegree(left, right)) {
    return CANDIDATE_DISTANCE_WEIGHTS.rootOrDegreeChange;
  }

  let distance = 0;
  if (left.chord.quality !== right.chord.quality) {
    distance += CANDIDATE_DISTANCE_WEIGHTS.qualityChange;
  }
  if (
    left.chord.bassPc !== right.chord.bassPc ||
    (left.chord.inversion ?? 0) !== (right.chord.inversion ?? 0)
  ) {
    distance += CANDIDATE_DISTANCE_WEIGHTS.bassOrInversionChange;
  }

  return distance;
}

function bassDirections(
  voicedProgression: readonly (readonly PlacedChord[])[],
) {
  const basses = voicedProgression.map((measure) => {
    const pitch = measure[0]?.pitches[0];
    return pitch ? (parsePitchToMidi(pitch) ?? null) : null;
  });

  return basses.slice(1).map((bass, index) => {
    const previousBass = basses[index];
    if (bass === null || previousBass === null) return null;
    return Math.sign(bass - previousBass);
  });
}

function voicedBassDirectionDistance(
  baseVoicedProgression?: readonly (readonly PlacedChord[])[],
  candidateVoicedProgression?: readonly (readonly PlacedChord[])[],
) {
  if (!baseVoicedProgression || !candidateVoicedProgression) return 0;

  const baseDirections = bassDirections(baseVoicedProgression);
  const candidateDirections = bassDirections(candidateVoicedProgression);
  const comparisonCount = Math.min(
    baseDirections.length,
    candidateDirections.length,
  );
  let mismatches = 0;

  for (let index = 0; index < comparisonCount; index += 1) {
    const baseDirection = baseDirections[index];
    const candidateDirection = candidateDirections[index];
    if (
      baseDirection !== null &&
      candidateDirection !== null &&
      baseDirection !== candidateDirection
    ) {
      mismatches += 1;
    }
  }

  return (
    mismatches * CANDIDATE_DISTANCE_WEIGHTS.voicedBassDirectionMismatch
  );
}

export function calculateCandidateDistance(
  baseProgression: readonly ScoredChord[],
  candidateProgression: readonly ScoredChord[],
  options: CandidateDistanceOptions = {},
): CandidateDistanceResult {
  const positionCount = Math.max(
    baseProgression.length,
    candidateProgression.length,
  );
  let exactPositionMatches = 0;
  let totalPositionDistance = 0;

  for (let index = 0; index < positionCount; index += 1) {
    const distance = positionDistance(
      baseProgression[index],
      candidateProgression[index],
    );
    totalPositionDistance += distance;
    if (distance === 0) exactPositionMatches += 1;
  }

  const baseFinalChord = baseProgression.at(-1);
  const candidateFinalChord = candidateProgression.at(-1);
  const finalRootDistance =
    baseFinalChord &&
    candidateFinalChord &&
    !sameRootAndDegree(baseFinalChord, candidateFinalChord)
      ? CANDIDATE_DISTANCE_WEIGHTS.finalRootOrDegreeChange
      : 0;
  const bassDirectionDistance = voicedBassDirectionDistance(
    options.baseVoicedProgression,
    options.candidateVoicedProgression,
  );

  return {
    total:
      totalPositionDistance + finalRootDistance + bassDirectionDistance,
    positionDistance: totalPositionDistance,
    finalRootDistance,
    voicedBassDirectionDistance: bassDirectionDistance,
    exactPositionMatches,
  };
}
