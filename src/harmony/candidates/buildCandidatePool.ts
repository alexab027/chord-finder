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

export const DEFAULT_CANDIDATE_POOL_OPTIONS: CandidatePoolOptions = {
  maxCandidates: 12,
  maxRankedCandidates: 12,
  maxBaseCandidates: 6,
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
  };
}

function capPool(
  candidates: CandidatePoolEntry[],
  maxCandidates: number,
  reserveBaseCandidate: boolean,
) {
  if (maxCandidates === 0) return [];

  const ranked = [...candidates].sort(
    (left, right) => right.totalScore - left.totalScore,
  );
  const selected = ranked.slice(0, maxCandidates);
  if (
    !reserveBaseCandidate ||
    selected.some(({ source }) => source !== "ranked_engine")
  ) {
    return selected;
  }

  const bestBaseCandidate = ranked.find(
    ({ source }) => source !== "ranked_engine",
  );
  if (!bestBaseCandidate) return selected;

  return [...selected.slice(0, -1), bestBaseCandidate].sort(
    (left, right) => right.totalScore - left.totalScore,
  );
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
  const { candidates } = validateCandidatePool(
    [...rankedCandidates, ...baseCandidates].filter(({ totalScore }) =>
      Number.isFinite(totalScore),
    ),
  );

  return capPool(
    candidates,
    options.maxCandidates,
    input.mode === "revise_existing" && baseCandidates.length > 0,
  );
}
