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
    ],
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
  voiceProgressionFn?: VoiceProgressionFn;
};

export function prepareVisibleCandidates({
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
  voiceProgressionFn = voiceProgression,
}: PrepareVisibleCandidatesInput): ProgressionCandidate[] {
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
        ({ symbolicHash }) =>
          mode !== "generate_new" || !seen.has(symbolicHash),
      ),
  ).candidates;
  const selected =
    mode === "generate_new"
      ? selectCandidateRoles({
          mode,
          candidates: constrainedPool,
          currentProgression,
          excludeCurrentProgression: Boolean(currentProgression),
        })
      : currentProgression
        ? selectCandidateRoles({
            mode,
            candidates: constrainedPool,
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
          },
        ];
      } catch {
        return [];
      }
    },
  );

  return validateCandidatePool(voicedCandidates, {
    requireVoicing: true,
  }).candidates;
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
  resolvePendingClarification: () => void;
};

type OpenCreativePreviewInput = Omit<
  PrepareVisibleCandidatesInput,
  "currentProgression" | "voiceProgressionFn"
> & {
  resultInterpretation: InterpretedStyle;
  commitLabel: "Generated" | "Updated";
};

export function useHarmonyController({
  pushCandidateMessage,
  pushProgressionCard,
  setError,
  resolvePendingClarification,
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
  }: OpenCreativePreviewInput) {
    let candidates: ProgressionCandidate[];
    try {
      candidates = prepareVisibleCandidates({
        mode,
        key,
        measures,
        getRenderedPitchFn,
        style,
        preferences,
        revision,
        exactActions,
        seenHashes: history.seenHashes,
        currentProgression: lastProgressionRef.current,
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not apply every requested chord edit.",
      );
      return null;
    }
    if (candidates.length === 0) {
      setError("Could not prepare any valid progression previews.");
      return null;
    }

    const nextCandidateSet = openCandidatePreview({
      sessionId,
      requestId: nextRequestId(),
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
      },
    );
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
