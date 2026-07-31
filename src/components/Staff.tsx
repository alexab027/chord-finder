"use client";

import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import { playMeasuresAudio } from "../audio/playback";
import { getGenerationKey } from "../music/keyDetection";
import { DURATION_TO_SLOTS } from "../music/noteUtils";
import {
  getStaffGeometry,
  getMeasureInfoFromClick,
} from "./chord-finder/staffGeometry";
import { voiceProgression } from "../music/voicing";
import {
  applyChordEdit,
  HarmonyActionError,
  type ChordEditAction,
} from "../harmony/actions";
import { applyChordEditTransaction } from "../harmony/actionTransaction";
import { parsePureDirectEdits } from "../harmony/directEditParser";
import {
  directEditRequest,
  normalizeHarmonyRequest,
} from "../harmony/request";
import {
  asksForExplicitDescendingBass,
  getRelativeStyleChange,
} from "../harmony/requestLanguage";
import {
  resolveCreativeRevisionPreferences,
} from "../harmony/preferences";
import { useHarmonyMessages } from "./chord-finder/useHarmonyMessages";
import { useHarmonyController } from "./chord-finder/useHarmonyController";
import type {
  DurationName,
  GenerationMode,
  GenerationPreferences,
  PlacedNote,
  RevisionContext,
  ScoredChord,
  StyleOption,
} from "../music/types";
import {
  buildExplanationRequest,
  type ExplanationRequest,
} from "./chord-finder/explanationRequest";
import {
  DEFAULT_INTERPRETED_STYLE,
  type HarmonyRouterResponse,
  type InterpretedStyle,
  type PendingClarification,
  type RevisionIntent,
} from "../ai/types";
import { toGenerationPreferences } from "../ai/toGenerationPreferences";
import {
  buildProgressionIdentityItems,
  type CurrentProgressionItem,
} from "../music/progressionPresentation";
import HarmonyToolbar from "./chord-finder/HarmonyToolbar";
import HarmonyChat from "./chord-finder/HarmonyChat";
import { renderPitch, yToPitch } from "./chord-finder/pitchSpelling";
import StaffRenderer from "./chord-finder/StaffRenderer";

type AiProgressionExplanation = {
  overview: string;
  measures: Array<{
    measure: number;
    chord: string;
    explanation: string;
  }>;
};

const BLANK_PROMPT_STYLE: StyleOption = DEFAULT_INTERPRETED_STYLE.primaryStyle;

const PROMPT_HELPER_TEXT =
  "Leave this blank to generate the progression that best fits your melody. " +
  'After generating, you can ask for changes such as "keep this progression ' +
  'but make it more complex."';

const FRESH_PLACEHOLDER =
  "Example: Warm and jazzy with a descending bass and a strong ending";

const REVISION_PLACEHOLDER =
  "Example: Keep this progression but make it slightly more complex";

export default function Staff() {
  const staffWrapperRef = useRef<HTMLDivElement>(null);

  const [keySignature, setKeySignature] = useState("C");
  const [generationMode, setGenerationMode] =
    useState<GenerationMode>("automatic");
  const [selectedAccidental, setSelectedAccidental] = useState<
    "#" | "b" | "n" | null
  >(null);

  // Harmony prompt + the interpretation behind the current progression. The
  // interpretation is kept internally (used as the base for revisions and as the
  // style summary for the explanation); it is no longer shown to the user.
  const [stylePrompt, setStylePrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pendingClarification, setPendingClarification] =
    useState<PendingClarification | null>(null);
  // The persistent harmony conversation: user prompts, assistant answers, and
  // progression cards, in order. Append-only so the chat reads naturally.
  const {
    messages,
    pushUserMessage,
    pushAssistantMessage,
    pushProgressionCard,
    pushCandidateMessage,
    pushExplanationMessage,
  } = useHarmonyMessages();
  const {
    aiInterpretation,
    candidateSet,
    chordMeasures,
    lastProgressionRef,
    commitProgressionState,
    openCreativeCandidatePreview,
    handlePreviewCandidate,
    handleSelectCandidate,
    handleCancelCandidate,
    clearHarmonyState,
  } = useHarmonyController({
    pushCandidateMessage,
    pushProgressionCard,
    setError: setAiError,
    resolvePendingClarification: () => setPendingClarification(null),
  });

  // True only while an on-demand explanation is being fetched (see
  // handleAnswerQuestion). Explanations are never requested automatically.
  const [isExplaining, setIsExplaining] = useState(false);

  // Stores the real top and bottom staff line y-values from VexFlow
  const topStaffLineYRef = useRef<number>(40);
  const bottomStaffLineYRef = useRef<number>(80);

  const [selectedDuration, setSelectedDuration] = useState<DurationName>("q");
  const [selectedKind, setSelectedKind] = useState<"note" | "rest">("note");
  const [bpm, setBpm] = useState(90);
  const [measures, setMeasures] = useState<PlacedNote[][]>([[], [], [], []]);
  const currentSamplerRef = useRef<Tone.Sampler | null>(null);
  const currentPartRef = useRef<Tone.Part | null>(null);
  const geometry = getStaffGeometry(keySignature);
  const { firstMeasureExtra, rendererWidth, rendererHeight } = geometry;

  const getRenderedPitch = (note: PlacedNote) =>
    renderPitch(note, keySignature);

  function getNextAvailableSlot(measureNotes: PlacedNote[]) {
    let nextSlot = 0;

    for (const note of measureNotes) {
      const noteEnd = note.slot + note.durationSlots;
      nextSlot = Math.max(nextSlot, noteEnd);
    }

    return nextSlot;
  }

  function handleStaffClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!staffWrapperRef.current) return;

    const rect = staffWrapperRef.current.getBoundingClientRect();

    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const melodyClickableTop = topStaffLineYRef.current - 20;
    const melodyClickableBottom = bottomStaffLineYRef.current + 60;

    if (clickY < melodyClickableTop || clickY > melodyClickableBottom) {
      return;
    }

    const measureInfo = getMeasureInfoFromClick(clickX, firstMeasureExtra);

    if (!measureInfo) return;

    const pitch = yToPitch(
      clickY,
      topStaffLineYRef.current,
      bottomStaffLineYRef.current,
    );

    const durationSlots = DURATION_TO_SLOTS[selectedDuration];

    setMeasures((prevMeasures) => {
      const newMeasures = prevMeasures.map((measure) => [...measure]);

      const measureNotes = newMeasures[measureInfo.measureIndex];

      const nextSlot = getNextAvailableSlot(measureNotes);

      if (nextSlot + durationSlots > 8) {
        return prevMeasures;
      }

      const newNote: PlacedNote = {
        slot: nextSlot,
        duration: selectedDuration,
        durationSlots,
        pitch: selectedKind === "note" ? pitch : "b/4",
        kind: selectedKind,
        accidental: selectedKind === "note" ? selectedAccidental : null,
      };

      newMeasures[measureInfo.measureIndex] = [...measureNotes, newNote];
      setSelectedAccidental(null);
      return newMeasures;
    });
  }

  // Calls the server-side Groq route. When a current progression is supplied the
  // route also returns revision intent. Returns null only if the request itself
  // could not complete. No client-side cache is used, so revising the same text
  // against a different current progression always asks the route fresh.
  async function fetchInterpretation(
    prompt: string,
    currentProgression?: CurrentProgressionItem[],
    activeKey?: string,
  ): Promise<HarmonyRouterResponse | null> {
    try {
      const response = await fetch("/api/interpret-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          hasProgression: !!currentProgression,
          activeKey,
          currentProgression,
          pendingClarification,
        }),
      });
      return (await response.json()) as HarmonyRouterResponse;
    } catch {
      return null;
    }
  }

  // Best-effort plain-English explanation, requested only when the user asks a
  // question. Failures never block or undo a progression.
  async function requestExplanation(requestBody: ExplanationRequest) {
    setIsExplaining(true);

    try {
      const response = await fetch("/api/explain-progression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        pushAssistantMessage(
          "A plain-English explanation is unavailable right now. The progression is still ready to play.",
        );
        return;
      }

      const data = (await response.json()) as AiProgressionExplanation;
      pushExplanationMessage(
        data.overview,
        data.measures.filter((measure) => measure.explanation),
      );
    } catch {
      pushAssistantMessage(
        "A plain-English explanation is unavailable right now. The progression is still ready to play.",
      );
    } finally {
      setIsExplaining(false);
    }
  }

  function renderProgression(
    finalProgression: ScoredChord[],
    keyLabel: string,
    label: "Generated" | "Updated",
    preferences?: GenerationPreferences,
  ) {
    const voicedProgression = voiceProgression(
      finalProgression,
      measures,
      getRenderedPitch,
      preferences,
    );
    commitProgressionState(finalProgression, voicedProgression);
    pushProgressionCard(label, keyLabel, finalProgression);
    return voicedProgression;
  }

  function applyRequestedActions(
    baseProgression: ScoredChord[],
    requestedActions: ChordEditAction[],
    generatedKey: ReturnType<typeof getGenerationKey>,
  ): ScoredChord[] {
    if (requestedActions.length === 0) return baseProgression;

    try {
      return applyChordEditTransaction(baseProgression, requestedActions, {
        key: generatedKey,
      });
    } catch (editError) {
      setAiError(
        editError instanceof HarmonyActionError
          ? editError.message
          : "Could not apply the requested chord edit.",
      );
      return baseProgression;
    }
  }

  function handleGenerateNewProgression(
    normalizedPrompt: string,
    data?: HarmonyRouterResponse,
  ): void {
    const effectiveStyle = data?.primaryStyle ?? BLANK_PROMPT_STYLE;
    const preferences = toGenerationPreferences(
      data ?? DEFAULT_INTERPRETED_STYLE,
    );
    const requestedActions = data?.actions ?? [];

    const resultInterpretation: InterpretedStyle =
      data ?? DEFAULT_INTERPRETED_STYLE;

    const generatedKey = getGenerationKey(
      keySignature,
      generationMode,
      measures,
      getRenderedPitch,
    );

    openCreativeCandidatePreview({
      key: generatedKey,
      measures,
      getRenderedPitchFn: getRenderedPitch,
      style: effectiveStyle,
      preferences,
      resultInterpretation,
      exactActions: requestedActions,
      mode: "generate_new",
      commitLabel: "Generated",
    });
    setPendingClarification(null);
  }

  function handleReviseExistingProgression(
    normalizedPrompt: string,
    data: HarmonyRouterResponse,
  ): void {
    const previousProgression = lastProgressionRef.current;
    if (!previousProgression || previousProgression.length === 0) {
      pushAssistantMessage(
        "There is no existing progression to edit. Would you like me to generate one first?",
      );
      return;
    }

    const generatedKey = getGenerationKey(
      keySignature,
      generationMode,
      measures,
      getRenderedPitch,
    );
    const requestedActions = data.actions ?? [];

    const baseInterpretation = aiInterpretation ?? DEFAULT_INTERPRETED_STYLE;
    const revisionIntent: RevisionIntent = data.revision ?? {
      preserveOverallProgression: true,
      preserveChordPositions: [],
      changeAmount: 0.3,
      requestedChanges: {},
    };
    const activePreferences = toGenerationPreferences(baseInterpretation);
    const interpretedPreferences = toGenerationPreferences(data);

    const resolvedPreferences = resolveCreativeRevisionPreferences(
      activePreferences,
      interpretedPreferences,
      revisionIntent.requestedChanges,
      getRelativeStyleChange(normalizedPrompt),
    );

    const effectivePreferences: GenerationPreferences = {
      ...resolvedPreferences,
      descendingBassWeight: asksForExplicitDescendingBass(normalizedPrompt)
        ? 1
        : resolvedPreferences.descendingBassWeight,
    };

    const effectiveStyle = effectivePreferences.style;

    const revision: RevisionContext = {
      targets: previousProgression.map((scoredChord) => ({
        degree: scoredChord.chord.degree,
        rootPc: scoredChord.chord.rootPc,
        quality: scoredChord.chord.quality,
        bassPc: scoredChord.chord.bassPc,
        inversion: scoredChord.chord.inversion,
      })),
      preserveOverallProgression: revisionIntent.preserveOverallProgression,
      preserveChordPositions: revisionIntent.preserveChordPositions,
      changeAmount: revisionIntent.changeAmount,
    };
    const appliedInterpretation: InterpretedStyle = {
      ...baseInterpretation,
      primaryStyle: effectiveStyle,
      descendingBassWeight: effectivePreferences.descendingBassWeight,
      complexity: effectivePreferences.complexity,
      dissonanceTolerance: effectivePreferences.dissonanceTolerance,
      cadenceStrength: effectivePreferences.cadenceStrength,
      preferSevenths: effectivePreferences.preferSevenths,
      preferSuspensions: effectivePreferences.preferSuspensions,
      melodyFitPriority: effectivePreferences.melodyFitPriority,
      consonancePriority: effectivePreferences.consonancePriority,
      voiceLeadingPriority: effectivePreferences.voiceLeadingPriority,
      playabilityRequired: effectivePreferences.playabilityRequired,
      simplicityLevel: effectivePreferences.simplicityLevel,
      jazzLevel: effectivePreferences.jazzLevel,
      summary: data.summary || baseInterpretation.summary,
    };
    openCreativeCandidatePreview({
      key: generatedKey,
      measures,
      getRenderedPitchFn: getRenderedPitch,
      style: effectiveStyle,
      preferences: effectivePreferences,
      revision,
      resultInterpretation: appliedInterpretation,
      exactActions: requestedActions,
      mode: "revise_existing",
      commitLabel: "Updated",
    });
    setPendingClarification(null);
  }

  // Direct-edit fast path. Applies pre-parsed exact edits to the current
  // progression locally, reusing the same deterministic engine and re-voicing
  // as the revise path. Deliberately makes NO network call (neither Groq
  // interpretation nor explanation): a pure exact edit needs no interpretation,
  // and direct edits never auto-request an explanation. Preferences/style are
  // taken unchanged from the active interpretation, since a pure edit carries no
  // style clause.
  function handleDirectEditShortcut(
    normalizedPrompt: string,
    actions: ChordEditAction[],
    previousProgression: ScoredChord[],
  ): void {
    const generatedKey = getGenerationKey(
      keySignature,
      generationMode,
      measures,
      getRenderedPitch,
    );
    const activeInterpretation = aiInterpretation ?? DEFAULT_INTERPRETED_STYLE;
    const effectiveStyle =
      activeInterpretation.primaryStyle ?? BLANK_PROMPT_STYLE;
    const effectivePreferences: GenerationPreferences = {
      ...toGenerationPreferences(activeInterpretation),
      style: effectiveStyle,
    };

    const finalProgression = applyRequestedActions(
      previousProgression,
      actions,
      generatedKey,
    );

    // applyRequestedActions returns the SAME array reference on failure (after
    // surfacing the error via setAiError). Don't claim a successful update then.
    if (finalProgression === previousProgression) return;

    renderProgression(
      finalProgression,
      generatedKey.label,
      "Updated",
      effectivePreferences,
    );
    setPendingClarification(null);
  }

  function handleClarification(question: string, originalMessage: string) {
    setPendingClarification({
      originalMessage,
      question,
    });
    pushAssistantMessage(question);
  }

  // Explanations are surfaced ONLY here — when the user explicitly asks a
  // question. Nothing else in the app auto-requests an explanation. When there
  // is a progression to ground against, we fetch the grounded plain-English
  // explanation; otherwise we fall back to the model's short answer.
  function handleAnswerQuestion(
    data: HarmonyRouterResponse,
    normalizedPrompt: string,
  ) {
    setPendingClarification(null);
    const currentProgression = lastProgressionRef.current;

    if (!currentProgression || currentProgression.length === 0) {
      pushAssistantMessage(
        data.assistantMessage ??
          "There isn't a progression yet — generate one first, then ask me about it.",
      );
      return;
    }

    const generatedKey = getGenerationKey(
      keySignature,
      generationMode,
      measures,
      getRenderedPitch,
    );
    const request = buildExplanationRequest(
      currentProgression,
      chordMeasures,
      generatedKey.label,
      normalizedPrompt,
      aiInterpretation?.summary ?? "",
    );

    if (!request) {
      pushAssistantMessage(
        data.assistantMessage ??
          "I could not build an explanation for the current progression.",
      );
      return;
    }

    void requestExplanation(request);
  }

  // Route first, then generate, revise, clarify, or answer.
  async function handleGenerateProgression() {
    setIsGenerating(true);
    setAiError(null);

    const normalizedPrompt = stylePrompt.trim();
    // Record the user's turn in the conversation, then clear the input so the
    // chat reads as a back-and-forth. A blank prompt means "best fit for me".
    pushUserMessage(
      normalizedPrompt === ""
        ? "Generate best-fit progression"
        : normalizedPrompt,
    );
    setStylePrompt("");

    try {
      if (normalizedPrompt === "") {
        handleGenerateNewProgression(normalizedPrompt);
        return;
      }

      const previousProgression = lastProgressionRef.current;

      // Direct-edit fast path: if the whole prompt is nothing but one supported
      // exact chord edit, apply it locally and skip BOTH Groq calls. Requires an
      // existing progression to edit; anything else (style clauses, mixed
      // prompts, questions) fails the total-parse gate and falls through to Groq.
      if (previousProgression && previousProgression.length > 0) {
        const directEdits = parsePureDirectEdits(
          normalizedPrompt,
          previousProgression.length,
        );
        if (directEdits) {
          let request;
          try {
            request = directEditRequest(
              directEdits,
              previousProgression.length,
            );
          } catch (error) {
            setAiError(
              error instanceof Error
                ? error.message
                : "The exact edits conflict, so nothing was changed.",
            );
            return;
          }
          handleDirectEditShortcut(
            normalizedPrompt,
            request.intent === "direct_edit" ? request.actions : [],
            previousProgression,
          );
          return;
        }
      }

      const currentProgressionSummary = previousProgression
        ? buildProgressionIdentityItems(previousProgression)
        : undefined;
      const activeKey = getGenerationKey(
        keySignature,
        generationMode,
        measures,
        getRenderedPitch,
      ).label;

      const data = await fetchInterpretation(
        normalizedPrompt,
        currentProgressionSummary,
        activeKey,
      );

      if (!data || data.warning) {
        setAiError(
          data?.warning ??
            "AI interpretation was unavailable. Nothing was changed.",
        );
        return;
      }

      const request = normalizeHarmonyRequest({
        response: data,
        measureCount: previousProgression?.length ?? 4,
        prompt: normalizedPrompt,
      });

      switch (request.intent) {
        case "direct_edit":
          if (!previousProgression || previousProgression.length === 0) {
            pushAssistantMessage(
              "There is no existing progression to edit. Generate one first.",
            );
            break;
          }
          handleDirectEditShortcut(
            normalizedPrompt,
            request.actions,
            previousProgression,
          );
          break;
        case "generate_new":
          handleGenerateNewProgression(
            normalizedPrompt,
            request.interpretation,
          );
          break;
        case "revise_existing":
          handleReviseExistingProgression(
            normalizedPrompt,
            request.interpretation,
          );
          break;
        case "clarify":
          handleClarification(request.question, normalizedPrompt);
          break;
        case "answer_question":
          handleAnswerQuestion(request.interpretation, normalizedPrompt);
          break;
      }
    } catch (error) {
      console.error("generateProgression failed:", error);
      setAiError("Something went wrong while generating. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  // Deterministic chord-edit entry point. Edits operate on the musical
  // progression (lastProgressionRef); the rendered chords are then re-derived
  // wholesale so the edited measure re-voices against its new neighbors.
  // No visible control or natural-language parsing is wired up yet.
  function applyEdit(action: ChordEditAction) {
    const current = lastProgressionRef.current;
    if (!current) {
      setAiError("There is no progression to edit yet. Generate one first.");
      return;
    }

    // Re-derived deterministically; melody is unchanged by a chord edit, so this
    // matches the generation-time key. set_chord resolves against it.
    const editedKey = getGenerationKey(
      keySignature,
      generationMode,
      measures,
      getRenderedPitch,
    );

    let next;
    try {
      next = applyChordEdit(current, action, { key: editedKey });
    } catch (error) {
      // Invalid actions surface through the existing error state rather than
      // failing silently or pretending the edit succeeded.
      setAiError(
        error instanceof HarmonyActionError
          ? error.message
          : "Could not apply the edit. Please try again.",
      );
      return;
    }

    // Re-voice the COMPLETE progression using the generation preferences.
    const preferences = aiInterpretation
      ? toGenerationPreferences(aiInterpretation)
      : toGenerationPreferences(DEFAULT_INTERPRETED_STYLE);
    commitProgressionState(
      next,
      voiceProgression(next, measures, getRenderedPitch, preferences),
    );
    pushProgressionCard("Updated", editedKey.label, next);
    // We do NOT auto-request an explanation here: copied chords carry stale
    // positional score/reasons, so a grounded explanation would be misleading.
    setAiError(null);
  }

  // Development-only: lets the copy_chord slice be exercised from the browser
  // console, e.g.
  //   window.__applyChordEdit({ type: "copy_chord", fromMeasure: 1, toMeasure: 4 })
  // No deps array so the latest closure (current state) is always exposed.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    (
      window as unknown as {
        __applyChordEdit?: (action: ChordEditAction) => void;
      }
    ).__applyChordEdit = applyEdit;
  });

  //playback
  async function playMeasures() {
    await playMeasuresAudio({
      measures,
      chordMeasures,
      bpm,
      getRenderedPitch,
      currentSamplerRef,
      currentPartRef,
    });
  }

  //measure-level actions
  function handleAccidentalClick(accidental: "#" | "b" | "n") {
    setSelectedAccidental((prev) => (prev === accidental ? null : accidental));
  }
  function handleKeySignatureChange(nextKeySignature: string) {
    setKeySignature(nextKeySignature);
  }

  function handleGenerationModeChange(nextGenerationMode: GenerationMode) {
    setGenerationMode(nextGenerationMode);
  }

  function deleteLastNote() {
    setMeasures((prevMeasures) => {
      const newMeasures = prevMeasures.map((measure) => [...measure]);

      for (let i = newMeasures.length - 1; i >= 0; i--) {
        if (newMeasures[i].length > 0) {
          newMeasures[i] = newMeasures[i].slice(0, -1);
          break;
        }
      }

      return newMeasures;
    });
  }

  function clearAllMeasures() {
    setMeasures([[], [], [], []]);
  }

  function clearChords() {
    // Clear progression metadata so nothing is stale. The conversation log is
    // left intact so the history of the session stays readable.
    clearHarmonyState();
    setPendingClarification(null);
    pushAssistantMessage("Chord progression cleared.");
  }

  const hasNotes = measures.some((measure) => measure.length > 0);
  const hasProgression = chordMeasures.some((measure) => measure.length > 0);
  const hasCommittedProgression =
    candidateSet?.status === "previewing"
      ? Boolean(candidateSet.baseProgression?.length)
      : hasProgression;

  return (
    <div className="space-y-8">
      {/* Section 1: melody + chord staves and all note-entry controls */}
      <section className="space-y-4">
        <HarmonyToolbar
          bpm={bpm}
          generationMode={generationMode}
          hasChords={hasProgression}
          hasNotes={hasNotes}
          keySignature={keySignature}
          onAccidentalClick={handleAccidentalClick}
          onBpmChange={setBpm}
          onClearChords={clearChords}
          onClearMelody={clearAllMeasures}
          onDeleteLast={deleteLastNote}
          onGenerationModeChange={handleGenerationModeChange}
          onKeySignatureChange={handleKeySignatureChange}
          onPlay={playMeasures}
          onSelectNote={(duration) => {
            setSelectedKind("note");
            setSelectedDuration(duration);
          }}
          onSelectRest={(duration) => {
            setSelectedKind("rest");
            setSelectedDuration(duration);
            setSelectedAccidental(null);
          }}
          selectedAccidental={selectedAccidental}
          selectedDuration={selectedDuration}
          selectedKind={selectedKind}
        />

        {/* Staff */}
        <div className="overflow-x-auto border-y border-[var(--border)] bg-[var(--surface)]">
          <div
            ref={staffWrapperRef}
            onClick={handleStaffClick}
            className="cursor-crosshair"
            style={{
              width: rendererWidth,
              height: rendererHeight,
              position: "relative",
            }}
          >
            <StaffRenderer
              bottomStaffLineYRef={bottomStaffLineYRef}
              chordMeasures={chordMeasures}
              geometry={geometry}
              keySignature={keySignature}
              measures={measures}
              topStaffLineYRef={topStaffLineYRef}
            />
          </div>
        </div>
      </section>

      <HarmonyChat
        candidatePreview={candidateSet}
        composerValue={stylePrompt}
        error={aiError}
        hasProgression={hasCommittedProgression}
        helperText={PROMPT_HELPER_TEXT}
        isExplaining={isExplaining}
        isGenerating={isGenerating}
        messages={messages}
        onCancelCandidate={handleCancelCandidate}
        onComposerChange={setStylePrompt}
        onPreviewCandidate={handlePreviewCandidate}
        onSelectCandidate={handleSelectCandidate}
        onSubmit={handleGenerateProgression}
        placeholder={hasProgression ? REVISION_PLACEHOLDER : FRESH_PLACEHOLDER}
      />
    </div>
  );
}
