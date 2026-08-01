import { useId, useRef, useState } from "react";
import type { InterpretedStyle } from "../../ai/types";
import { applyChordEditTransaction } from "../../harmony/actionTransaction";
import type { ChordEditAction } from "../../harmony/actions";
import { buildCandidatePool } from "../../harmony/candidates/buildCandidatePool";
import { candidateHash } from "../../harmony/candidates/candidateHash";
import { selectCandidateRoles } from "../../harmony/candidates/selectCandidateRoles";
import type {
  CandidateMode,
  CandidateSet,
  ProgressionCandidate,
} from "../../harmony/candidates/types";
import { validateCandidatePool } from "../../harmony/candidates/validateCandidate";
import { buildCandidateExplanationFacts } from "../../harmony/explanations/facts";
import {
  evaluateStyleBoundary,
  isStyleImprovement,
  satisfiesStyleConstraint,
  type CandidateStyleConstraint,
  type PendingStyleAlternative,
  type StyleBoundaryResult,
  type StyleDirection,
} from "../../harmony/styleBoundary";
import {
  jazzColorScore,
  progressionComplexity,
} from "../../harmony/transforms/styleTransforms";
import {
  EMPTY_HARMONY_HISTORY,
  recordHarmonyCommit,
  type HarmonyCommitSource,
} from "../../harmony/history";
import { voiceProgression } from "../../music/voicing";
import type {
  GenerationPreferences,
  KeyContext,
  PlacedChord,
  PlacedNote,
  RevisionContext,
  ScoredChord,
  StyleOption,
} from "../../music/types";
import {
  useCandidatePreview,
  type OpenCandidateSet,
} from "./useCandidatePreview";
import { harmonyDebug, harmonyDebugError } from "./harmonyDebug";

type VoiceProgressionFn = typeof voiceProgression;

export function prepareReopenedCandidateSet({
  archived,
  candidateId,
  sessionId,
  requestId,
  currentProgression,
  currentVoicedProgression,
  currentInterpretation,
}: {
  archived: CandidateSet;
  candidateId: string;
  sessionId: string;
  requestId: string;
  currentProgression: ScoredChord[] | null;
  currentVoicedProgression: PlacedChord[][];
  currentInterpretation: InterpretedStyle | null;
}): OpenCandidateSet | null {
  const candidate = archived.candidates.find((item) => item.id === candidateId);
  if (!candidate) return null;

  return {
    sessionId,
    requestId,
    requestSummary: archived.requestSummary,
    mode: archived.mode,
    keyLabel: archived.keyLabel,
    commitLabel: archived.commitLabel,
    baseProgression: currentProgression,
    baseVoicedProgression: currentVoicedProgression.map((measure) => [
      ...measure,
    ]),
    baseInterpretation: currentInterpretation,
    resultInterpretation: archived.resultInterpretation,
    candidates: [
      candidate,
      ...archived.candidates.filter((item) => item.id !== candidateId),
    ].map((item) => ({
      ...item,
      explanationFacts: {
        ...buildCandidateExplanationFacts({
          progression: item.progression,
          activeKey: archived.keyLabel,
          requestSummary:
            archived.requestSummary ?? "Reopened candidate preview",
          candidateRole: item.role,
          candidateSource: item.explanationFacts?.candidateSource,
          baseProgression: currentProgression,
        }),
        exactEdits: item.explanationFacts?.exactEdits ?? [],
      },
    })),
  };
}

export type PrepareVisibleCandidatesInput = {
  mode: CandidateMode;
  key: KeyContext;
  measures: PlacedNote[][];
  getRenderedPitchFn: (note: PlacedNote) => string;
  style: StyleOption;
  preferences: GenerationPreferences;
  revision?: RevisionContext;
  currentProgression: readonly ScoredChord[] | null;
  exactActions?: readonly ChordEditAction[];
  seenHashes?: readonly string[];
  excludeSeenHashes?: boolean;
  styleConstraint?: CandidateStyleConstraint;
  directionalStyleChange?: StyleDirection;
  voiceProgressionFn?: VoiceProgressionFn;
  requestSummary?: string;
};

export type PrepareVisibleCandidateResult = {
  candidates: ProgressionCandidate[];
  styleBoundary: StyleBoundaryResult | null;
};

export function prepareVisibleCandidateResult({
  mode,
  key,
  measures,
  getRenderedPitchFn,
  style,
  preferences,
  revision,
  currentProgression,
  exactActions = [],
  seenHashes = [],
  excludeSeenHashes = false,
  styleConstraint,
  directionalStyleChange,
  voiceProgressionFn = voiceProgression,
  requestSummary = "Generate the best-fitting progression.",
}: PrepareVisibleCandidatesInput): PrepareVisibleCandidateResult {
  const pool = buildCandidatePool({
    mode,
    key,
    measures,
    getRenderedPitchFn,
    style,
    preferences,
    revision,
    baseProgression:
      mode === "revise_existing" ? currentProgression : undefined,
  });
  const seen = new Set(seenHashes);
  const constrainedPool = validateCandidatePool(
    pool
      .map((candidate) => {
        const progression =
          exactActions.length > 0
            ? applyChordEditTransaction(candidate.progression, exactActions, {
                key,
              })
            : candidate.progression;
        return {
          ...candidate,
          progression,
          symbolicHash: candidateHash(progression),
        };
      })
      .filter(
        ({ progression, symbolicHash }) =>
          (!(mode === "generate_new" || excludeSeenHashes) ||
            !seen.has(symbolicHash)) &&
          (!styleConstraint ||
            satisfiesStyleConstraint(progression, styleConstraint)),
      ),
  ).candidates;
  const poolStyleBoundary =
    directionalStyleChange && currentProgression
      ? evaluateStyleBoundary({
          currentProgression,
          candidates: constrainedPool.map(({ progression }) => progression),
          direction: directionalStyleChange,
        })
      : null;
  const directionallyValidPool = poolStyleBoundary
    ? poolStyleBoundary.improved
      ? constrainedPool.filter(({ progression }) =>
          isStyleImprovement(
            progression,
            poolStyleBoundary.baseMetric,
            poolStyleBoundary.direction,
          ),
        )
      : []
    : constrainedPool;
  const selected =
    mode === "generate_new"
      ? selectCandidateRoles({
          mode,
          candidates: directionallyValidPool,
          currentProgression,
          excludeCurrentProgression: Boolean(currentProgression),
        })
      : currentProgression
        ? selectCandidateRoles({
            mode,
            candidates: directionallyValidPool,
            baseProgression: currentProgression,
          })
        : [];
  const voicedCandidates = selected.flatMap<ProgressionCandidate>(
    (candidate) => {
      try {
        return [
          {
            id: candidate.symbolicHash,
            symbolicHash: candidate.symbolicHash,
            role: candidate.role,
            progression: candidate.progression,
            voicedProgression: voiceProgressionFn(
              candidate.progression,
              measures,
              getRenderedPitchFn,
              preferences,
            ),
            totalScore: candidate.totalScore,
            distanceFromBase: candidate.distanceFromBase,
            explanationFacts: buildCandidateExplanationFacts({
              progression: candidate.progression,
              activeKey: key.label,
              requestSummary,
              candidateRole: candidate.role,
              candidateSource: candidate.source,
              baseProgression: currentProgression,
              exactActions,
            }),
          },
        ];
      } catch {
        return [];
      }
    },
  );

  const candidates = validateCandidatePool(voicedCandidates, {
    requireVoicing: true,
  }).candidates;
  const styleBoundary =
    directionalStyleChange && currentProgression
      ? evaluateStyleBoundary({
          currentProgression,
          candidates: candidates.map(({ progression }) => progression),
          direction: directionalStyleChange,
        })
      : null;

  return { candidates, styleBoundary };
}

export function prepareVisibleCandidates(
  input: PrepareVisibleCandidatesInput,
): ProgressionCandidate[] {
  return prepareVisibleCandidateResult(input).candidates;
}

type UseHarmonyControllerOptions = {
  pushCandidateMessage: (
    candidateSetId: string,
    mode: CandidateMode,
    candidates: ProgressionCandidate[],
  ) => void;
  pushProgressionCard: (
    label: "Generated" | "Updated",
    keyLabel: string,
    progression: ScoredChord[],
  ) => void;
  setError: (message: string | null) => void;
  pushAssistantMessage: (message: string) => void;
  resolvePendingClarification: () => void;
  onStyleBoundary: (event: {
    boundary: StyleBoundaryResult;
    pending: PendingStyleAlternative;
  }) => void;
};

type OpenCreativePreviewInput = Omit<
  PrepareVisibleCandidatesInput,
  "currentProgression" | "voiceProgressionFn" | "requestSummary"
> & {
  resultInterpretation: InterpretedStyle;
  commitLabel: "Generated" | "Updated";
  requestSummary: string;
  emptyCandidateMessage?: string;
};

export function useHarmonyController({
  pushCandidateMessage,
  pushProgressionCard,
  setError,
  pushAssistantMessage,
  resolvePendingClarification,
  onStyleBoundary,
}: UseHarmonyControllerOptions) {
  const [aiInterpretation, setAiInterpretation] =
    useState<InterpretedStyle | null>(null);
  const [chordMeasures, setChordMeasures] = useState<PlacedChord[][]>([
    [],
    [],
    [],
    [],
  ]);
  const [history, setHistory] = useState(EMPTY_HARMONY_HISTORY);
  const lastProgressionRef = useRef<ScoredChord[] | null>(null);
  const sessionId = `harmony-session-${useId()}`;
  const requestSequenceRef = useRef(0);
  const candidateSetsRef = useRef(new Map<string, CandidateSet>());
  const committedCandidateSetsRef = useRef(new Set<string>());
  const {
    candidateSet,
    openCandidatePreview,
    previewCandidate,
    markCandidateSelected,
    markCandidateCancelled,
    clearCandidatePreview,
  } = useCandidatePreview();

  function nextRequestId() {
    requestSequenceRef.current += 1;
    return `request-${requestSequenceRef.current}`;
  }

  function commitProgressionState(
    progression: ScoredChord[],
    voicedProgression: PlacedChord[][],
    metadata: {
      requestId?: string;
      interpretation?: InterpretedStyle | null;
      source?: HarmonyCommitSource;
      explanationFacts?: NonNullable<ProgressionCandidate["explanationFacts"]>;
    } = {},
  ) {
    lastProgressionRef.current = progression;
    setChordMeasures(voicedProgression);
    const requestId = metadata.requestId ?? nextRequestId();
    setHistory((current) =>
      recordHarmonyCommit(current, {
        sessionId,
        requestId,
        progression,
        voicedProgression,
        interpretation: metadata.interpretation ?? aiInterpretation,
        source: metadata.source ?? "direct_edit",
        explanationFacts: metadata.explanationFacts,
      }),
    );
  }

  function openCreativeCandidatePreview({
    mode,
    key,
    measures,
    getRenderedPitchFn,
    style,
    preferences,
    revision,
    resultInterpretation,
    commitLabel,
    exactActions,
    requestSummary,
    excludeSeenHashes,
    styleConstraint,
    directionalStyleChange,
    emptyCandidateMessage,
  }: OpenCreativePreviewInput) {
    let prepared: PrepareVisibleCandidateResult;
    try {
      prepared = prepareVisibleCandidateResult({
        mode,
        key,
        measures,
        getRenderedPitchFn,
        style,
        preferences,
        revision,
        exactActions,
        requestSummary,
        seenHashes: history.seenHashes,
        excludeSeenHashes,
        styleConstraint,
        directionalStyleChange,
        currentProgression: lastProgressionRef.current,
      });
    } catch (error) {
      harmonyDebugError("candidate_preparation_failed", error, {
        mode,
        requestSummary,
        exactActionCount: exactActions?.length ?? 0,
      });
      setError(
        error instanceof Error
          ? error.message
          : "Could not apply every requested chord edit.",
      );
      return null;
    }
    const { candidates, styleBoundary } = prepared;
    const baseProgression = lastProgressionRef.current;
    if (styleBoundary && !styleBoundary.improved && baseProgression) {
      const pending: PendingStyleAlternative = {
        direction: styleBoundary.direction,
        metric: styleBoundary.baseMetric,
        progressionId: candidateHash(baseProgression),
        originalRequest: requestSummary,
      };
      harmonyDebug("style_boundary_reached", {
        ...styleBoundary,
        progressionId: pending.progressionId,
        candidateCount: candidates.length,
      });
      onStyleBoundary({ boundary: styleBoundary, pending });
      setError(null);
      return null;
    }
    if (candidates.length === 0) {
      harmonyDebug("candidate_preparation_empty", {
        mode,
        requestSummary,
        seenProgressionCount: history.seenHashes.length,
        exactActionCount: exactActions?.length ?? 0,
      });
      if (emptyCandidateMessage) {
        pushAssistantMessage(emptyCandidateMessage);
        setError(null);
        return null;
      }
      setError("Could not prepare any valid progression previews.");
      return null;
    }

    const candidateMetrics = candidates.map((candidate) => ({
      role: candidate.role,
      progressionId: candidate.symbolicHash,
      complexity: progressionComplexity(candidate.progression),
      jazzColor: jazzColorScore(candidate.progression),
    }));
    const styleDirection = preferences.styleTransform;

    harmonyDebug("candidate_set_prepared", {
      mode,
      requestSummary,
      key: key.label,
      styleDirection: styleDirection ?? null,
      styleIntensity:
        styleDirection === "jazzy"
          ? preferences.jazzLevel ?? null
          : styleDirection === "simple"
            ? preferences.simplicityLevel ?? null
            : null,
      baseProgressionId: baseProgression
        ? candidateHash(baseProgression)
        : null,
      baseStyleMetric: styleBoundary?.baseMetric ?? null,
      bestCandidateStyleMetric: styleBoundary?.bestCandidateMetric ?? null,
      reachedStyleBoundary: false,
      exactActions: exactActions ?? [],
      seenProgressionCount: history.seenHashes.length,
      candidateCount: candidates.length,
      candidates: candidateMetrics,
    });

    const nextCandidateSet = openCandidatePreview({
      sessionId,
      requestId: nextRequestId(),
      requestSummary,
      mode,
      keyLabel: key.label,
      commitLabel,
      baseProgression: lastProgressionRef.current,
      baseVoicedProgression: chordMeasures.map((measure) => [...measure]),
      baseInterpretation: aiInterpretation,
      resultInterpretation,
      candidates,
    });
    const firstCandidate = nextCandidateSet?.candidates[0];
    if (!nextCandidateSet || !firstCandidate) return null;

    candidateSetsRef.current.set(nextCandidateSet.id, nextCandidateSet);
    setChordMeasures(firstCandidate.voicedProgression);
    pushCandidateMessage(
      nextCandidateSet.id,
      nextCandidateSet.mode,
      nextCandidateSet.candidates,
    );
    setError(null);
    return nextCandidateSet;
  }

  function handlePreviewCandidate(
    candidateSetId: string,
    candidateId: string,
  ) {
    if (candidateSet?.status === "previewing") {
      if (candidateSet.id !== candidateSetId) return;
      const candidate = candidateSet.candidates.find(
        (item) => item.id === candidateId,
      );
      if (!candidate) return;

      previewCandidate(candidateSetId, candidateId);
      setChordMeasures(candidate.voicedProgression);
      harmonyDebug("candidate_previewed", {
        candidateSetId,
        candidateId,
        role: candidate.role,
      });
      return;
    }

    const archived = candidateSetsRef.current.get(candidateSetId);
    if (!archived) return;
    const reopenedInput = prepareReopenedCandidateSet({
      archived,
      candidateId,
      sessionId,
      requestId: nextRequestId(),
      currentProgression: lastProgressionRef.current,
      currentVoicedProgression: chordMeasures,
      currentInterpretation: aiInterpretation,
    });
    if (!reopenedInput) return;
    const reopened = openCandidatePreview(reopenedInput);
    if (!reopened) return;

    candidateSetsRef.current.set(reopened.id, reopened);
    harmonyDebug("candidate_set_reopened", {
      archivedCandidateSetId: candidateSetId,
      reopenedCandidateSetId: reopened.id,
      requestedCandidateId: candidateId,
      rollbackProgressionId: reopened.baseProgression
        ? candidateHash(reopened.baseProgression)
        : null,
    });
    setChordMeasures(reopened.candidates[0].voicedProgression);
    pushCandidateMessage(reopened.id, reopened.mode, reopened.candidates);
    setError(null);
  }

  function handleSelectCandidate(candidateSetId: string) {
    if (
      !candidateSet ||
      candidateSet.id !== candidateSetId ||
      candidateSet.status !== "previewing"
    ) {
      return;
    }

    const selectedCandidate = candidateSet.candidates.find(
      (candidate) => candidate.id === candidateSet.previewedCandidateId,
    );
    if (!selectedCandidate) {
      setError("The previewed progression is no longer available.");
      return;
    }
    if (committedCandidateSetsRef.current.has(candidateSetId)) return;
    committedCandidateSetsRef.current.add(candidateSetId);

    commitProgressionState(
      selectedCandidate.progression,
      selectedCandidate.voicedProgression,
      {
        requestId: candidateSet.requestId,
        interpretation: candidateSet.resultInterpretation,
        source: "candidate_selection",
        explanationFacts: selectedCandidate.explanationFacts,
      },
    );
    harmonyDebug("candidate_selected", {
      candidateSetId,
      candidateId: selectedCandidate.id,
      role: selectedCandidate.role,
      progressionId: selectedCandidate.symbolicHash,
    });
    setAiInterpretation(candidateSet.resultInterpretation);
    pushProgressionCard(
      candidateSet.commitLabel,
      candidateSet.keyLabel,
      selectedCandidate.progression,
    );
    markCandidateSelected(candidateSetId);
    resolvePendingClarification();
    setError(null);
  }

  function handleCancelCandidate(candidateSetId: string) {
    if (
      !candidateSet ||
      candidateSet.id !== candidateSetId ||
      candidateSet.status !== "previewing"
    ) {
      return;
    }

    lastProgressionRef.current = candidateSet.baseProgression;
    setChordMeasures(
      candidateSet.baseVoicedProgression.map((measure) => [...measure]),
    );
    setAiInterpretation(candidateSet.baseInterpretation);
    harmonyDebug("candidate_preview_cancelled", {
      candidateSetId,
      restoredProgressionId: candidateSet.baseProgression
        ? candidateHash(candidateSet.baseProgression)
        : null,
    });
    markCandidateCancelled(candidateSetId);
    setError(null);
  }

  function clearHarmonyState() {
    setChordMeasures([[], [], [], []]);
    setAiInterpretation(null);
    lastProgressionRef.current = null;
    clearCandidatePreview();
  }

  return {
    aiInterpretation,
    candidateSet,
    chordMeasures,
    history,
    lastProgressionRef,
    setAiInterpretation,
    commitProgressionState,
    openCreativeCandidatePreview,
    handlePreviewCandidate,
    handleSelectCandidate,
    handleCancelCandidate,
    clearHarmonyState,
  };
}
