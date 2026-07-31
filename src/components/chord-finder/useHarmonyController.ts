import { useRef, useState } from "react";
import type { InterpretedStyle } from "../../ai/types";
import { buildCandidatePool } from "../../harmony/candidates/buildCandidatePool";
import { selectCandidateRoles } from "../../harmony/candidates/selectCandidateRoles";
import type {
  CandidateMode,
  ProgressionCandidate,
} from "../../harmony/candidates/types";
import { validateCandidatePool } from "../../harmony/candidates/validateCandidate";
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
import { useCandidatePreview } from "./useCandidatePreview";

type VoiceProgressionFn = typeof voiceProgression;

export type PrepareVisibleCandidatesInput = {
  mode: CandidateMode;
  key: KeyContext;
  measures: PlacedNote[][];
  getRenderedPitchFn: (note: PlacedNote) => string;
  style: StyleOption;
  preferences: GenerationPreferences;
  revision?: RevisionContext;
  currentProgression: readonly ScoredChord[] | null;
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
  const selected =
    mode === "generate_new"
      ? selectCandidateRoles({
          mode,
          candidates: pool,
          currentProgression,
          excludeCurrentProgression: Boolean(currentProgression),
        })
      : currentProgression
        ? selectCandidateRoles({
            mode,
            candidates: pool,
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
  const lastProgressionRef = useRef<ScoredChord[] | null>(null);
  const {
    candidateSet,
    openCandidatePreview,
    previewCandidate,
    markCandidateSelected,
    markCandidateCancelled,
    clearCandidatePreview,
  } = useCandidatePreview();

  function commitProgressionState(
    progression: ScoredChord[],
    voicedProgression: PlacedChord[][],
  ) {
    lastProgressionRef.current = progression;
    setChordMeasures(voicedProgression);
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
  }: OpenCreativePreviewInput) {
    const candidates = prepareVisibleCandidates({
      mode,
      key,
      measures,
      getRenderedPitchFn,
      style,
      preferences,
      revision,
      currentProgression: lastProgressionRef.current,
    });
    if (candidates.length === 0) {
      setError("Could not prepare any valid progression previews.");
      return null;
    }

    const nextCandidateSet = openCandidatePreview({
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
    if (
      !candidateSet ||
      candidateSet.id !== candidateSetId ||
      candidateSet.status !== "previewing"
    ) {
      return;
    }

    const candidate = candidateSet.candidates.find(
      (item) => item.id === candidateId,
    );
    if (!candidate) return;

    previewCandidate(candidateSetId, candidateId);
    setChordMeasures(candidate.voicedProgression);
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

    commitProgressionState(
      selectedCandidate.progression,
      selectedCandidate.voicedProgression,
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
