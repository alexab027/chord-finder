import type { ScoredChord } from "../../music/types";
import {
  calculateCandidateDistance,
  type CandidateDistanceResult,
} from "./candidateDistance";
import {
  candidateHash,
  chordIdentityHash,
  deduplicateCandidates,
} from "./candidateHash";
import type {
  CandidateMode,
  CandidatePoolEntry,
  CandidateRole,
  RoleSelectedCandidate,
} from "./types";

export type CandidateRoleSelectionThresholds = {
  maxScoreDropFromBest: number;
  minimumPairwiseDistance: number;
  generateModerateMinDistance: number;
  generateModerateMaxDistance: number;
  generateDistinctMinDistance: number;
  revisionModerateMaxExactPositions: number;
  revisionModerateMaxDistance: number;
  revisionDistinctMinDistance: number;
};

export const DEFAULT_CANDIDATE_ROLE_THRESHOLDS: CandidateRoleSelectionThresholds =
  {
    maxScoreDropFromBest: 18,
    minimumPairwiseDistance: 1,
    generateModerateMinDistance: 3,
    generateModerateMaxDistance: 7,
    generateDistinctMinDistance: 8,
    revisionModerateMaxExactPositions: 2,
    revisionModerateMaxDistance: 7,
    revisionDistinctMinDistance: 8,
  };

type CommonSelectionInput = {
  candidates: readonly CandidatePoolEntry[];
  thresholds?: Partial<CandidateRoleSelectionThresholds>;
};

export type SelectGenerateNewCandidatesInput = CommonSelectionInput & {
  mode: "generate_new";
  currentProgression?: readonly ScoredChord[] | null;
  excludeCurrentProgression?: boolean;
};

export type SelectRevisionCandidatesInput = CommonSelectionInput & {
  mode: "revise_existing";
  baseProgression: readonly ScoredChord[];
};

export type SelectCandidateRolesInput =
  | SelectGenerateNewCandidatesInput
  | SelectRevisionCandidatesInput;

type CandidateWithDistance = {
  candidate: CandidatePoolEntry;
  distance: CandidateDistanceResult;
};

function resolveThresholds(
  thresholds: Partial<CandidateRoleSelectionThresholds> | undefined,
) {
  return { ...DEFAULT_CANDIDATE_ROLE_THRESHOLDS, ...thresholds };
}

function byDescendingScore(
  left: CandidatePoolEntry,
  right: CandidatePoolEntry,
) {
  return right.totalScore - left.totalScore;
}

function qualityCandidates(
  candidates: readonly CandidatePoolEntry[],
  maxScoreDropFromBest: number,
) {
  const ranked = deduplicateCandidates(candidates)
    .filter(({ totalScore }) => Number.isFinite(totalScore))
    .sort(byDescendingScore);
  const bestScore = ranked[0]?.totalScore;
  if (bestScore === undefined) return [];

  return ranked.filter(
    ({ totalScore }) => totalScore >= bestScore - maxScoreDropFromBest,
  );
}

function isPairwiseDiverse(
  candidate: CandidatePoolEntry,
  selected: readonly CandidatePoolEntry[],
  minimumDistance: number,
) {
  return selected.every(
    (other) =>
      calculateCandidateDistance(other.progression, candidate.progression)
        .total >= minimumDistance,
  );
}

function isPureReordering(
  left: readonly ScoredChord[],
  right: readonly ScoredChord[],
) {
  if (left.length !== right.length) return false;

  const leftIdentities = left.map(chordIdentityHash).sort();
  const rightIdentities = right.map(chordIdentityHash).sort();
  return leftIdentities.every(
    (identity, index) => identity === rightIdentities[index],
  );
}

function selectedCandidate(
  candidate: CandidatePoolEntry,
  role: CandidateRole,
  distance: CandidateDistanceResult,
  mode: CandidateMode,
): RoleSelectedCandidate {
  return {
    ...candidate,
    role,
    exactPositionMatches: distance.exactPositionMatches,
    ...(mode === "revise_existing"
      ? { distanceFromBase: distance.total }
      : { distanceFromBestFit: distance.total }),
  };
}

function selectGenerateNewCandidates(
  input: SelectGenerateNewCandidatesInput,
  thresholds: CandidateRoleSelectionThresholds,
) {
  const excludedHash =
    input.excludeCurrentProgression && input.currentProgression
      ? candidateHash(input.currentProgression)
      : null;
  const candidates = qualityCandidates(
    input.candidates.filter(
      ({ symbolicHash }) => symbolicHash !== excludedHash,
    ),
    thresholds.maxScoreDropFromBest,
  );
  const bestFit = candidates[0];
  if (!bestFit) return [];

  const selected: RoleSelectedCandidate[] = [
    selectedCandidate(
      bestFit,
      "closest",
      calculateCandidateDistance(bestFit.progression, bestFit.progression),
      input.mode,
    ),
  ];
  const remaining = candidates.slice(1);
  const moderate = remaining.find((candidate) => {
    const distance = calculateCandidateDistance(
      bestFit.progression,
      candidate.progression,
    );
    return (
      distance.total >= thresholds.generateModerateMinDistance &&
      distance.total <= thresholds.generateModerateMaxDistance &&
      isPairwiseDiverse(
        candidate,
        selected,
        thresholds.minimumPairwiseDistance,
      )
    );
  });

  if (moderate) {
    selected.push(
      selectedCandidate(
        moderate,
        "moderate",
        calculateCandidateDistance(
          bestFit.progression,
          moderate.progression,
        ),
        input.mode,
      ),
    );
  }

  const selectedEntries = selected.map((candidate) => candidate);
  const distinct = remaining
    .filter(
      (candidate) =>
        candidate.symbolicHash !== moderate?.symbolicHash &&
        isPairwiseDiverse(
          candidate,
          selectedEntries,
          thresholds.minimumPairwiseDistance,
        ),
    )
    .map((candidate) => ({
      candidate,
      distance: calculateCandidateDistance(
        bestFit.progression,
        candidate.progression,
      ),
    }))
    .filter(
      ({ distance }) =>
        distance.total >= thresholds.generateDistinctMinDistance,
    )
    .sort(
      (left, right) =>
        right.distance.total - left.distance.total ||
        byDescendingScore(left.candidate, right.candidate),
    )[0];

  if (distinct) {
    selected.push(
      selectedCandidate(
        distinct.candidate,
        "distinct",
        distinct.distance,
        input.mode,
      ),
    );
  }

  return selected;
}

function selectRevisionCandidates(
  input: SelectRevisionCandidatesInput,
  thresholds: CandidateRoleSelectionThresholds,
) {
  const changedCandidates = deduplicateCandidates(input.candidates)
    .filter(({ totalScore }) => Number.isFinite(totalScore))
    .map<CandidateWithDistance>((candidate) => ({
      candidate,
      distance: calculateCandidateDistance(
        input.baseProgression,
        candidate.progression,
      ),
    }))
    .filter(({ distance }) => distance.total > 0);
  const bestChangedScore = Math.max(
    ...changedCandidates.map(({ candidate }) => candidate.totalScore),
  );
  const candidates = changedCandidates.filter(
    ({ candidate }) =>
      candidate.totalScore >=
      bestChangedScore - thresholds.maxScoreDropFromBest,
  );
  if (candidates.length === 0) return [];

  const closest = [...candidates].sort(
    (left, right) =>
      left.distance.total - right.distance.total ||
      byDescendingScore(left.candidate, right.candidate),
  )[0];
  const selected: RoleSelectedCandidate[] = [
    selectedCandidate(
      closest.candidate,
      "closest",
      closest.distance,
      input.mode,
    ),
  ];
  const moderate = [...candidates]
    .filter(
      ({ candidate, distance }) =>
        candidate.symbolicHash !== closest.candidate.symbolicHash &&
        distance.total > closest.distance.total &&
        distance.total <= thresholds.revisionModerateMaxDistance &&
        distance.exactPositionMatches <=
          thresholds.revisionModerateMaxExactPositions &&
        !isPureReordering(
          closest.candidate.progression,
          candidate.progression,
        ) &&
        isPairwiseDiverse(
          candidate,
          selected,
          thresholds.minimumPairwiseDistance,
        ),
    )
    .sort(
      (left, right) =>
        left.distance.total - right.distance.total ||
        byDescendingScore(left.candidate, right.candidate),
    )[0];

  if (moderate) {
    selected.push(
      selectedCandidate(
        moderate.candidate,
        "moderate",
        moderate.distance,
        input.mode,
      ),
    );
  }

  const minimumDistinctDistance = Math.max(
    thresholds.revisionDistinctMinDistance,
    (moderate?.distance.total ?? closest.distance.total) + 1,
  );
  const distinct = [...candidates]
    .filter(
      ({ candidate, distance }) =>
        candidate.symbolicHash !== closest.candidate.symbolicHash &&
        candidate.symbolicHash !== moderate?.candidate.symbolicHash &&
        distance.total >= minimumDistinctDistance &&
        !isPureReordering(
          closest.candidate.progression,
          candidate.progression,
        ) &&
        isPairwiseDiverse(
          candidate,
          selected,
          thresholds.minimumPairwiseDistance,
        ),
    )
    .sort(
      (left, right) =>
        right.distance.total - left.distance.total ||
        byDescendingScore(left.candidate, right.candidate),
    )[0];

  if (distinct) {
    selected.push(
      selectedCandidate(
        distinct.candidate,
        "distinct",
        distinct.distance,
        input.mode,
      ),
    );
  }

  return selected;
}

export function selectCandidateRoles(
  input: SelectCandidateRolesInput,
): RoleSelectedCandidate[] {
  const thresholds = resolveThresholds(input.thresholds);

  return input.mode === "generate_new"
    ? selectGenerateNewCandidates(input, thresholds)
    : selectRevisionCandidates(input, thresholds);
}
