import type { ScoredChord } from "../../music/types";

type ProgressionLike = {
  progression: readonly ScoredChord[];
};

function chordIdentityTuple({ chord }: ScoredChord) {
  return [
    chord.degree,
    chord.rootPc,
    chord.quality,
    chord.bassPc,
    chord.inversion ?? 0,
  ] as const;
}

export function chordIdentityHash(scoredChord: ScoredChord) {
  return JSON.stringify(chordIdentityTuple(scoredChord));
}

export function candidateHash(progression: readonly ScoredChord[]) {
  return `symbolic:v1:${JSON.stringify(progression.map(chordIdentityTuple))}`;
}

export function deduplicateCandidates<T extends ProgressionLike>(
  candidates: readonly T[],
): T[] {
  const seenHashes = new Set<string>();

  return candidates.filter((candidate) => {
    const hash = candidateHash(candidate.progression);
    if (seenHashes.has(hash)) return false;

    seenHashes.add(hash);
    return true;
  });
}
