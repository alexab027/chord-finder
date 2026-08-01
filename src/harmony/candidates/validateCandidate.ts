import { parsePitchToMidi } from "../../music/noteUtils";
import type {
  ChordQuality,
  PlacedChord,
  ScoredChord,
} from "../../music/types";
import { candidateHash } from "./candidateHash";

const VALID_CHORD_QUALITIES = new Set<ChordQuality>([
  "triad",
  "sus",
  "sus2",
  "sus4",
  "add9",
  "maj7",
  "min7",
  "dom7",
]);

export type CandidateValidationIssueCode =
  | "invalid_measure_count"
  | "invalid_chord_identity"
  | "invalid_voicing"
  | "exact_postcondition_failed"
  | "matches_excluded_progression"
  | "distance_out_of_range"
  | "duplicate_symbolic_hash";

export type CandidateValidationIssue = {
  code: CandidateValidationIssueCode;
  measure?: number;
};

export type CandidateForValidation = {
  progression: readonly ScoredChord[];
  voicedProgression?: readonly (readonly PlacedChord[])[];
  distanceFromBase?: number;
};

export type ValidateCandidateOptions = {
  expectedMeasureCount?: number;
  requireVoicing?: boolean;
  excludeProgression?: readonly ScoredChord[] | null;
  satisfiesExactPostconditions?: (
    progression: readonly ScoredChord[],
  ) => boolean;
  distanceRange?: {
    min: number;
    max: number;
  };
};

export type CandidateValidationResult = {
  valid: boolean;
  symbolicHash?: string;
  issues: CandidateValidationIssue[];
};

export type CandidatePoolValidationResult<T> = {
  candidates: T[];
  rejected: Array<{
    candidate: T;
    issues: CandidateValidationIssue[];
  }>;
};

function isPitchClass(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 11;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidChordIdentity(scoredChord: ScoredChord | undefined) {
  const chord = scoredChord?.chord;
  if (!chord || !Array.isArray(chord.pcs)) return false;

  const inversion = chord.inversion ?? 0;

  return (
    Number.isInteger(chord.degree) &&
    chord.degree >= 1 &&
    chord.degree <= 7 &&
    isPitchClass(chord.rootPc) &&
    isPitchClass(chord.bassPc) &&
    VALID_CHORD_QUALITIES.has(chord.quality) &&
    Number.isInteger(inversion) &&
    inversion >= 0 &&
    inversion < chord.pcs.length &&
    chord.pcs.length >= 2 &&
    chord.pcs.every(isPitchClass) &&
    chord.pcs.includes(chord.rootPc) &&
    chord.pcs.includes(chord.bassPc) &&
    isNonEmptyString(chord.rootName) &&
    isNonEmptyString(chord.name) &&
    isNonEmptyString(chord.romanNumeral) &&
    isNonEmptyString(chord.absoluteSymbol)
  );
}

function isValidVoicedProgression(
  voicedProgression: readonly (readonly PlacedChord[])[] | undefined,
  expectedMeasureCount: number,
) {
  return (
    voicedProgression?.length === expectedMeasureCount &&
    Array.from({ length: expectedMeasureCount }, (_, index) =>
      voicedProgression[index],
    ).every(
      (measure) =>
        Array.isArray(measure) &&
        measure.length > 0 &&
        measure.every(
          (chord) =>
            Array.isArray(chord.pitches) &&
            chord.pitches.length > 0 &&
            chord.pitches.every(
              (pitch: unknown) =>
                typeof pitch === "string" &&
                parsePitchToMidi(pitch) !== undefined,
            ),
        ),
    )
  );
}

export function validateCandidate(
  candidate: CandidateForValidation,
  options: ValidateCandidateOptions = {},
): CandidateValidationResult {
  const expectedMeasureCount = options.expectedMeasureCount ?? 4;
  const issues: CandidateValidationIssue[] = [];

  if (candidate.progression.length !== expectedMeasureCount) {
    issues.push({ code: "invalid_measure_count" });
  }

  Array.from(
    { length: candidate.progression.length },
    (_, index) => candidate.progression[index],
  ).forEach((scoredChord, index) => {
    if (!isValidChordIdentity(scoredChord)) {
      issues.push({ code: "invalid_chord_identity", measure: index + 1 });
    }
  });

  if (
    options.requireVoicing &&
    !isValidVoicedProgression(
      candidate.voicedProgression,
      expectedMeasureCount,
    )
  ) {
    issues.push({ code: "invalid_voicing" });
  }

  if (options.satisfiesExactPostconditions) {
    let satisfiesPostconditions = false;
    try {
      satisfiesPostconditions = options.satisfiesExactPostconditions(
        candidate.progression,
      );
    } catch {
      satisfiesPostconditions = false;
    }
    if (!satisfiesPostconditions) {
      issues.push({ code: "exact_postcondition_failed" });
    }
  }

  const hasValidSymbolicProgression = !issues.some(
    ({ code }) =>
      code === "invalid_measure_count" || code === "invalid_chord_identity",
  );
  const symbolicHash = hasValidSymbolicProgression
    ? candidateHash(candidate.progression)
    : undefined;

  if (
    symbolicHash &&
    options.excludeProgression &&
    symbolicHash === candidateHash(options.excludeProgression)
  ) {
    issues.push({ code: "matches_excluded_progression" });
  }

  if (
    options.distanceRange &&
    (candidate.distanceFromBase === undefined ||
      !Number.isFinite(candidate.distanceFromBase) ||
      candidate.distanceFromBase < options.distanceRange.min ||
      candidate.distanceFromBase > options.distanceRange.max)
  ) {
    issues.push({ code: "distance_out_of_range" });
  }

  return {
    valid: issues.length === 0,
    symbolicHash,
    issues,
  };
}

export function validateCandidatePool<T extends CandidateForValidation>(
  candidates: readonly T[],
  options: ValidateCandidateOptions = {},
): CandidatePoolValidationResult<T> {
  const validCandidates: T[] = [];
  const rejected: CandidatePoolValidationResult<T>["rejected"] = [];
  const seenHashes = new Set<string>();

  for (const candidate of candidates) {
    const result = validateCandidate(candidate, options);
    if (!result.valid || !result.symbolicHash) {
      rejected.push({ candidate, issues: result.issues });
      continue;
    }
    if (seenHashes.has(result.symbolicHash)) {
      rejected.push({
        candidate,
        issues: [{ code: "duplicate_symbolic_hash" }],
      });
      continue;
    }

    seenHashes.add(result.symbolicHash);
    validCandidates.push(candidate);
  }

  return { candidates: validCandidates, rejected };
}
