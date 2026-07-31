import { buildKeyChords } from "../../music/chords";
import { scoreProgression } from "../../music/chordGeneration";
import type { ChordCandidate, ScoredChord } from "../../music/types";
import { candidateHash, deduplicateCandidates } from "./candidateHash";
import type {
  CandidateGenerationContext,
  CandidatePoolEntry,
  CandidatePoolSource,
} from "./types";
import { validateCandidate } from "./validateCandidate";

type BaseDerivedCandidateOptions = {
  maxCandidates: number;
};

function normalizeLimit(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function scoreCandidate(
  chords: readonly ChordCandidate[],
  source: CandidatePoolSource,
  context: CandidateGenerationContext,
): CandidatePoolEntry {
  const scored = scoreProgression(
    chords,
    context.key,
    context.measures,
    context.getRenderedPitchFn,
    context.style,
    context.preferences,
    context.revision,
  );

  return {
    ...scored,
    symbolicHash: candidateHash(scored.progression),
    source,
  };
}

function getRootPreservingQualityOptions(
  scoredChord: ScoredChord,
  keyChords: readonly ChordCandidate[],
) {
  return keyChords.filter(
    (candidate) =>
      candidate.degree === scoredChord.chord.degree &&
      candidate.rootPc === scoredChord.chord.rootPc &&
      candidate.bassPc === candidate.rootPc &&
      (candidate.inversion ?? 0) === 0,
  );
}

export function buildBaseDerivedCandidates(
  baseProgression: readonly ScoredChord[],
  context: CandidateGenerationContext,
  options: BaseDerivedCandidateOptions,
): CandidatePoolEntry[] {
  const limit = normalizeLimit(options.maxCandidates);
  if (limit === 0 || !validateCandidate({ progression: baseProgression }).valid) {
    return [];
  }

  const baseChords = baseProgression.map(({ chord }) => chord);
  const rescoredBase = scoreCandidate(baseChords, "base_rescored", context);
  const keyChords = buildKeyChords(context.key);
  const alternatives: CandidatePoolEntry[] = [];

  baseProgression.forEach((scoredChord, measureIndex) => {
    for (const alternative of getRootPreservingQualityOptions(
      scoredChord,
      keyChords,
    )) {
      const candidateChords = baseChords.map((chord, index) =>
        index === measureIndex ? alternative : chord,
      );
      alternatives.push(
        scoreCandidate(
          candidateChords,
          "base_quality_alternative",
          context,
        ),
      );
    }
  });

  const uniqueAlternatives = deduplicateCandidates(alternatives)
    .filter(({ symbolicHash }) => symbolicHash !== rescoredBase.symbolicHash)
    .sort((left, right) => right.totalScore - left.totalScore);

  // Keep the exact committed identity available even when its score is lower
  // than a quality alternative. Role selection in Milestone 4 will decide
  // whether it is useful for the request.
  return [rescoredBase, ...uniqueAlternatives].slice(0, limit);
}
