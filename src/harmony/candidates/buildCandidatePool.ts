import { rankProgressions } from "../../music/chordGeneration";
import type { ScoredChord } from "../../music/types";
import { buildBaseDerivedCandidates } from "./buildBaseDerivedCandidates";
import { candidateHash } from "./candidateHash";
import type {
  CandidateGenerationContext,
  CandidateMode,
  CandidatePoolEntry,
  CandidatePoolOptions,
} from "./types";
import { validateCandidatePool } from "./validateCandidate";
import {
  buildStyleTransformCandidates,
  jazzColorScore,
  progressionComplexity,
} from "../transforms/styleTransforms";

export const DEFAULT_CANDIDATE_POOL_OPTIONS: CandidatePoolOptions = {
  maxCandidates: 12,
  maxRankedCandidates: 12,
  maxBaseCandidates: 6,
  maxStyleCandidates: 6,
};

export type BuildCandidatePoolInput = CandidateGenerationContext & {
  mode: CandidateMode;
  baseProgression?: readonly ScoredChord[] | null;
  options?: Partial<CandidatePoolOptions>;
};

function normalizeLimit(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function resolveOptions(
  options: Partial<CandidatePoolOptions> | undefined,
): CandidatePoolOptions {
  return {
    maxCandidates: normalizeLimit(
      options?.maxCandidates ?? DEFAULT_CANDIDATE_POOL_OPTIONS.maxCandidates,
      DEFAULT_CANDIDATE_POOL_OPTIONS.maxCandidates,
    ),
    maxRankedCandidates: normalizeLimit(
      options?.maxRankedCandidates ??
        DEFAULT_CANDIDATE_POOL_OPTIONS.maxRankedCandidates,
      DEFAULT_CANDIDATE_POOL_OPTIONS.maxRankedCandidates,
    ),
    maxBaseCandidates: normalizeLimit(
      options?.maxBaseCandidates ??
        DEFAULT_CANDIDATE_POOL_OPTIONS.maxBaseCandidates,
      DEFAULT_CANDIDATE_POOL_OPTIONS.maxBaseCandidates,
    ),
    maxStyleCandidates: normalizeLimit(
      options?.maxStyleCandidates ??
        DEFAULT_CANDIDATE_POOL_OPTIONS.maxStyleCandidates,
      DEFAULT_CANDIDATE_POOL_OPTIONS.maxStyleCandidates,
    ),
  };
}

function capPool(
  candidates: CandidatePoolEntry[],
  maxCandidates: number,
  reserveBaseCandidate: boolean,
  reserveStyleCandidate: boolean,
) {
  if (maxCandidates === 0) return [];

  const ranked = [...candidates].sort(
    (left, right) => right.totalScore - left.totalScore,
  );
  const selected = ranked.slice(0, maxCandidates);
  const reserved = [...selected];
  if (
    reserveStyleCandidate &&
    !reserved.some(({ source }) => source === "style_transform")
  ) {
    const styleCandidate = ranked.find(
      ({ source }) => source === "style_transform",
    );
    if (styleCandidate) reserved[reserved.length - 1] = styleCandidate;
  }
  if (
    reserveBaseCandidate &&
    !reserved.some(
      ({ source }) =>
        source === "base_rescored" || source === "base_quality_alternative",
    )
  ) {
    const baseCandidate = ranked.find(
      ({ source }) =>
        source === "base_rescored" || source === "base_quality_alternative",
    );
    const replaceIndex = reserved.findLastIndex(
      ({ source }) => source !== "style_transform",
    );
    if (baseCandidate && replaceIndex >= 0) {
      reserved[replaceIndex] = baseCandidate;
    }
  }

  return [...new Map(reserved.map((item) => [item.symbolicHash, item])).values()]
    .sort((left, right) => right.totalScore - left.totalScore);
}

export function buildCandidatePool(
  input: BuildCandidatePoolInput,
): CandidatePoolEntry[] {
  const options = resolveOptions(input.options);
  const rankedCandidates = rankProgressions(
    input.key,
    input.measures,
    input.getRenderedPitchFn,
    input.style,
    input.preferences,
    input.revision,
  )
    .slice(0, options.maxRankedCandidates)
    .map<CandidatePoolEntry>((ranked) => ({
      ...ranked,
      symbolicHash: candidateHash(ranked.progression),
      source: "ranked_engine",
    }));
  const baseCandidates =
    input.mode === "revise_existing" && input.baseProgression
      ? buildBaseDerivedCandidates(input.baseProgression, input, {
          maxCandidates: options.maxBaseCandidates,
        })
      : [];
  const styleCandidates = buildStyleTransformCandidates(
    [...baseCandidates, ...rankedCandidates],
    input,
    options.maxStyleCandidates,
  );
  const requestedStyleTargets =
    input.mode === "revise_existing" &&
    input.preferences?.styleTransform &&
    baseCandidates[0]
      ? buildStyleTransformCandidates(
          [baseCandidates[0]],
          input,
          options.maxStyleCandidates,
        )
      : [];
  const satisfiesRequestedStyle = (candidate: CandidatePoolEntry) => {
    if (!input.preferences?.styleTransform) return true;
    if (requestedStyleTargets.length === 0) return false;
    if (input.preferences.styleTransform === "simple") {
      const target = Math.min(
        ...requestedStyleTargets.map(({ progression }) =>
          progressionComplexity(progression),
        ),
      );
      return progressionComplexity(candidate.progression) <= target;
    }
    const target = Math.max(
      ...requestedStyleTargets.map(({ progression }) =>
        jazzColorScore(progression),
      ),
    );
    return jazzColorScore(candidate.progression) >= target;
  };
  const { candidates } = validateCandidatePool(
    [...rankedCandidates, ...styleCandidates, ...baseCandidates].filter(
      (candidate) =>
        Number.isFinite(candidate.totalScore) &&
        satisfiesRequestedStyle(candidate),
    ),
  );

  return capPool(
    candidates,
    options.maxCandidates,
    input.mode === "revise_existing" && baseCandidates.length > 0,
    styleCandidates.length > 0,
  );
}
