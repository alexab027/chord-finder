import type { RevisionContext, ScoredChord } from "../music/types";
import { candidateHash } from "./candidates/candidateHash";
import {
  jazzColorScore,
  progressionComplexity,
} from "./transforms/styleTransforms";

export type StyleDirection = "jazzy" | "simple";

export type StyleBoundaryResult = {
  direction: StyleDirection;
  baseMetric: number;
  bestCandidateMetric: number | null;
  improved: boolean;
  atAbsoluteBoundary: boolean;
  reason: "absolute_boundary" | "no_valid_improvement" | null;
};

export type PendingStyleAlternative = {
  direction: StyleDirection;
  metric: number;
  progressionId: string;
  originalRequest: string;
};

export type CandidateStyleConstraint =
  | { metric: "jazzColor"; minimum: number }
  | { metric: "complexity"; maximum: number };

export function styleMetric(
  progression: readonly ScoredChord[],
  direction: StyleDirection,
) {
  return direction === "jazzy"
    ? jazzColorScore(progression)
    : progressionComplexity(progression);
}

export function isStyleImprovement(
  candidate: readonly ScoredChord[],
  baseMetric: number,
  direction: StyleDirection,
) {
  const candidateMetric = styleMetric(candidate, direction);
  return direction === "jazzy"
    ? candidateMetric > baseMetric
    : candidateMetric < baseMetric;
}

export function evaluateStyleBoundary({
  currentProgression,
  candidates,
  direction,
}: {
  currentProgression: readonly ScoredChord[];
  candidates: readonly (readonly ScoredChord[])[];
  direction: StyleDirection;
}): StyleBoundaryResult {
  const baseMetric = styleMetric(currentProgression, direction);
  const candidateMetrics = candidates.map((candidate) =>
    styleMetric(candidate, direction),
  );
  const bestCandidateMetric =
    candidateMetrics.length === 0
      ? null
      : direction === "jazzy"
        ? Math.max(...candidateMetrics)
        : Math.min(...candidateMetrics);
  const improved =
    bestCandidateMetric !== null &&
    (direction === "jazzy"
      ? bestCandidateMetric > baseMetric
      : bestCandidateMetric < baseMetric);
  const absoluteBoundary =
    direction === "jazzy" ? currentProgression.length * 2 : 0;
  const atAbsoluteBoundary =
    direction === "jazzy"
      ? baseMetric >= absoluteBoundary
      : baseMetric <= absoluteBoundary;

  return {
    direction,
    baseMetric,
    bestCandidateMetric,
    improved,
    atAbsoluteBoundary,
    reason: improved
      ? null
      : atAbsoluteBoundary
        ? "absolute_boundary"
        : "no_valid_improvement",
  };
}

export function satisfiesStyleConstraint(
  progression: readonly ScoredChord[],
  constraint: CandidateStyleConstraint,
) {
  return constraint.metric === "jazzColor"
    ? jazzColorScore(progression) >= constraint.minimum
    : progressionComplexity(progression) <= constraint.maximum;
}

export function styleConstraintForBoundary(
  pending: PendingStyleAlternative,
): CandidateStyleConstraint {
  return pending.direction === "jazzy"
    ? { metric: "jazzColor", minimum: pending.metric }
    : { metric: "complexity", maximum: pending.metric };
}

export function buildStyleAlternativeSearch(
  pending: PendingStyleAlternative,
  currentProgression: readonly ScoredChord[],
): {
  mode: "revise_existing";
  revision: RevisionContext;
  styleConstraint: CandidateStyleConstraint;
  excludeSeenHashes: true;
} | null {
  if (candidateHash(currentProgression) !== pending.progressionId) return null;

  return {
    mode: "revise_existing",
    revision: {
      targets: currentProgression.map(({ chord }) => ({
        degree: chord.degree,
        rootPc: chord.rootPc,
        quality: chord.quality,
        bassPc: chord.bassPc,
        inversion: chord.inversion,
      })),
      preserveOverallProgression: false,
      preserveChordPositions: [],
      changeAmount: 1,
    },
    styleConstraint: styleConstraintForBoundary(pending),
    excludeSeenHashes: true,
  };
}

export function getStyleBoundaryNotice(result: StyleBoundaryResult) {
  const adjective = result.direction === "jazzy" ? "jazzier" : "simpler";
  const noun = result.direction === "jazzy" ? "jazziness" : "simplicity";
  const currentDescription =
    result.direction === "jazzy" ? "already very jazzy" : "already very simple";

  return result.atAbsoluteBoundary
    ? `The current progression is ${currentDescription} and has reached the available ${noun} limit. Would you like structurally different options at about the same level instead? You can say “show different.”`
    : `I couldn't find a valid progression that is ${adjective} without breaking the current musical constraints. Would you like structurally different options at about the same level instead? You can say “show different.”`;
}
