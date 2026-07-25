"use client";

import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import {
  GhostNote,
  Renderer,
  Stave,
  Voice,
  StaveNote,
  Formatter,
  Beam,
  Accidental,
} from "vexflow";
import { playMeasuresAudio } from "../audio/playback";
import { chooseProgression } from "../music/chordGeneration";
import { getGenerationKey } from "../music/keyDetection";
import {
  DURATION_TO_SLOTS,
  getKeySignatureExtraWidth,
  KEY_SIGNATURE_ACCIDENTALS,
  parsePitchToMidi,
  PITCHES_TOP_TO_BOTTOM,
} from "../music/noteUtils";
import { voiceProgression } from "../music/voicing";
import {
  applyChordEdit,
  applyChordEdits,
  HarmonyActionError,
  type ChordEditAction,
} from "../harmony/actions";
import { parsePureDirectEdits } from "../harmony/directEditParser";
import { applyHarmonyPreferencePatch } from "../harmony/preferences";
import type {
  DurationName,
  GenerationMode,
  GenerationPreferences,
  PlacedChord,
  PlacedNote,
  RevisionContext,
  ScoredChord,
  StyleOption,
} from "../music/types";
import {
  DEFAULT_INTERPRETED_STYLE,
  type HarmonyRouterResponse,
  type InterpretedStyle,
  type PendingClarification,
  type RevisionIntent,
} from "../ai/types";
import { toGenerationPreferences } from "../ai/toGenerationPreferences";
import {
  buildExplanationIdentityItems,
  buildProgressionIdentityItems,
  type CurrentProgressionItem,
} from "../music/progressionPresentation";
import HarmonyToolbar from "./chord-finder/HarmonyToolbar";
import HarmonyChat, { type ChatMessage } from "./chord-finder/HarmonyChat";

type AiProgressionExplanation = {
  overview: string;
  measures: Array<{
    measure: number;
    chord: string;
    explanation: string;
  }>;
};

type ExplanationRequest = {
  activeKey: string;
  key: string;
  styleRequest: string;
  styleSummary: string;
  progression: Array<{
    measure: number;
    symbol: string;
    romanNumeral: string;
    score?: number;
    reasons: string[];
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

function asksForExplicitDescendingBass(prompt: string) {
  return /\bdescending\s+bass(?:\s*line|line)?\b/i.test(prompt);
}

function getEffectiveStyle(
  prompt: string,
  fallbackStyle: StyleOption,
): StyleOption {
  return asksForExplicitDescendingBass(prompt)
    ? "descendingBass"
    : fallbackStyle;
}

// "C major" reads better as just "C" in a card heading; minor keys keep the
// mode so "A minor" stays unambiguous.
function formatKeyForHeading(keyLabel: string) {
  return keyLabel.replace(/\s+major$/i, "");
}

function getVoicedBassMidiSequence(voicedProgression: PlacedChord[][]) {
  return voicedProgression.map((measure) => {
    const bassPitch = measure[0]?.pitches[0];
    return bassPitch ? (parsePitchToMidi(bassPitch) ?? null) : null;
  });
}

function reasonClaimsDescendingBass(reason: string) {
  return /\b(descending bass|bass line|bassline|bass downward|stepwise bass motion)\b/i.test(
    reason,
  );
}

function getGroundedExplanationReasons(
  scoredChord: ScoredChord,
  measureIndex: number,
  bassMidiSequence: Array<number | null>,
) {
  const currentBass = bassMidiSequence[measureIndex];
  const previousBass =
    measureIndex > 0 ? bassMidiSequence[measureIndex - 1] : null;
  const bassDescends =
    currentBass !== null && previousBass !== null && currentBass < previousBass;
  const reasons = scoredChord.reasons.filter(
    (reason) => bassDescends || !reasonClaimsDescendingBass(reason),
  );

  if (bassDescends) {
    reasons.push(
      `The final voiced bass moves downward from MIDI ${previousBass} to ${currentBass}.`,
    );
  }

  return reasons;
}

export default function Staff() {
  const containerRef = useRef<HTMLDivElement>(null);
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
  const [aiInterpretation, setAiInterpretation] =
    useState<InterpretedStyle | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pendingClarification, setPendingClarification] =
    useState<PendingClarification | null>(null);
  // The persistent harmony conversation: user prompts, assistant answers, and
  // progression cards, in order. Append-only so the chat reads naturally.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messageIdRef = useRef(0);

  // The full scored progression behind the rendered chords. Kept in a ref (not
  // rendered) so revisions can pass the current chord identities into scoring.
  const lastProgressionRef = useRef<ScoredChord[] | null>(null);

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
  const [chordMeasures, setChordMeasures] = useState<PlacedChord[][]>([
    [],
    [],
    [],
    [],
  ]);
  const staffX = 20;
  const melodyStaffY = 40;
  const chordStaffY = 190;
  const baseFirstMeasureExtra = 90;
  const firstMeasureExtra =
    baseFirstMeasureExtra + getKeySignatureExtraWidth(keySignature);
  const baseMeasureWidth = 300;
  const rendererWidth = staffX * 2 + baseMeasureWidth * 4 + firstMeasureExtra;
  const rendererHeight = 310;

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = "";

    const renderer = new Renderer(containerRef.current, Renderer.Backends.SVG);

    renderer.resize(rendererWidth, rendererHeight);

    const context = renderer.getContext();

    let currentX = staffX;

    const melodyStave1 = new Stave(
      currentX,
      melodyStaffY,
      baseMeasureWidth + firstMeasureExtra,
    );

    const chordStave1 = new Stave(
      currentX,
      chordStaffY,
      baseMeasureWidth + firstMeasureExtra,
    );

    currentX += baseMeasureWidth + firstMeasureExtra;

    const melodyStave2 = new Stave(currentX, melodyStaffY, baseMeasureWidth);
    const chordStave2 = new Stave(currentX, chordStaffY, baseMeasureWidth);

    currentX += baseMeasureWidth;

    const melodyStave3 = new Stave(currentX, melodyStaffY, baseMeasureWidth);
    const chordStave3 = new Stave(currentX, chordStaffY, baseMeasureWidth);

    currentX += baseMeasureWidth;

    const melodyStave4 = new Stave(currentX, melodyStaffY, baseMeasureWidth);
    const chordStave4 = new Stave(currentX, chordStaffY, baseMeasureWidth);

    melodyStave1
      .addClef("treble")
      .addKeySignature(keySignature)
      .addTimeSignature("4/4");

    chordStave1
      .addClef("bass")
      .addKeySignature(keySignature)
      .addTimeSignature("4/4");

    // Ask VexFlow where the melody staff lines actually are.
    // line 0 = top staff line
    // line 4 = bottom staff line
    topStaffLineYRef.current = melodyStave1.getYForLine(0);
    bottomStaffLineYRef.current = melodyStave1.getYForLine(4);

    const melodyStaves = [
      melodyStave1,
      melodyStave2,
      melodyStave3,
      melodyStave4,
    ];

    const chordStaves = [chordStave1, chordStave2, chordStave3, chordStave4];

    [...melodyStaves, ...chordStaves].forEach((stave) => {
      stave.setContext(context).draw();
    });

    function drawMeasure(measureNotes: PlacedNote[], stave: Stave) {
      const tickables = buildTickables(measureNotes);

      const voice = new Voice({
        numBeats: 4,
        beatValue: 4,
      });

      voice.addTickables(tickables);

      const noteStartX = stave.getNoteStartX();
      const noteEndX = stave.getNoteEndX();
      const formattingWidth = noteEndX - noteStartX - 10;

      new Formatter().joinVoices([voice]).format([voice], formattingWidth);

      const realNotes = tickables.filter(
        (tickable) => tickable instanceof StaveNote,
      ) as StaveNote[];

      // Generate beams BEFORE drawing the voice so eighth notes do not keep their flags/tails.
      const beams = Beam.generateBeams(realNotes);

      voice.draw(context, stave);

      beams.forEach((beam) => {
        beam.setContext(context).draw();
      });
    }

    function drawChordMeasure(chords: PlacedChord[], stave: Stave) {
      const tickables: (StaveNote | GhostNote)[] = [];

      let usedSlots = 0;

      for (const chord of chords) {
        tickables.push(
          new StaveNote({
            keys: chord.pitches,
            duration: chord.duration,
            clef: "bass",
          }),
        );

        usedSlots += chord.durationSlots;
      }

      let remainingSlots = 8 - usedSlots;

      while (remainingSlots > 0) {
        if (remainingSlots >= 4) {
          tickables.push(new GhostNote("h"));
          remainingSlots -= 4;
        } else if (remainingSlots >= 2) {
          tickables.push(new GhostNote("q"));
          remainingSlots -= 2;
        } else {
          tickables.push(new GhostNote("8"));
          remainingSlots -= 1;
        }
      }

      const voice = new Voice({
        numBeats: 4,
        beatValue: 4,
      });

      voice.addTickables(tickables);

      const noteStartX = stave.getNoteStartX();
      const noteEndX = stave.getNoteEndX();
      const formattingWidth = noteEndX - noteStartX - 10;

      new Formatter().joinVoices([voice]).format([voice], formattingWidth);

      voice.draw(context, stave);
    }

    measures.forEach((measureNotes, index) => {
      drawMeasure(measureNotes, melodyStaves[index]);
    });

    chordMeasures.forEach((chords, index) => {
      drawChordMeasure(chords, chordStaves[index]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measures, chordMeasures, keySignature, rendererWidth, firstMeasureExtra]);

  function buildTickables(measureNotes: PlacedNote[]) {
    const tickables: (StaveNote | GhostNote)[] = [];

    let usedSlots = 0;

    for (const note of measureNotes) {
      const renderedPitch = getRenderedPitch(note);

      const staveNote = new StaveNote({
        keys: [renderedPitch],
        duration: note.kind === "rest" ? `${note.duration}r` : note.duration,
      });

      if (note.kind === "note" && note.accidental !== null) {
        staveNote.addModifier(new Accidental(note.accidental), 0);
      }

      tickables.push(staveNote);

      usedSlots += note.durationSlots;
    }

    let remainingSlots = 8 - usedSlots;

    while (remainingSlots > 0) {
      if (remainingSlots >= 4) {
        tickables.push(new GhostNote("h"));
        remainingSlots -= 4;
      } else if (remainingSlots >= 2) {
        tickables.push(new GhostNote("q"));
        remainingSlots -= 2;
      } else {
        tickables.push(new GhostNote("8"));
        remainingSlots -= 1;
      }
    }

    return tickables;
  }

  function getNextAvailableSlot(measureNotes: PlacedNote[]) {
    let nextSlot = 0;

    for (const note of measureNotes) {
      const noteEnd = note.slot + note.durationSlots;
      nextSlot = Math.max(nextSlot, noteEnd);
    }

    return nextSlot;
  }

  function getMeasureInfoFromClick(clickX: number) {
    const measureStarts = [
      staffX,
      staffX + baseMeasureWidth + firstMeasureExtra,
      staffX + baseMeasureWidth + firstMeasureExtra + baseMeasureWidth,
      staffX + baseMeasureWidth + firstMeasureExtra + baseMeasureWidth * 2,
    ];

    const measureWidths = [
      baseMeasureWidth + firstMeasureExtra,
      baseMeasureWidth,
      baseMeasureWidth,
      baseMeasureWidth,
    ];

    for (let i = 0; i < 4; i++) {
      const startX = measureStarts[i];
      const endX = startX + measureWidths[i];

      if (clickX >= startX && clickX <= endX) {
        return {
          measureIndex: i,
          startX,
          endX,
          width: measureWidths[i],
        };
      }
    }

    return null;
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

    const measureInfo = getMeasureInfoFromClick(clickX);

    if (!measureInfo) return;

    const pitch = yToPitch(clickY);
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

  function getRenderedPitch(note: PlacedNote) {
    if (note.kind === "rest") {
      return note.pitch;
    }

    const [letter, octave] = note.pitch.split("/");
    const lowerLetter = letter.toLowerCase();

    // Explicit accidental wins.
    if (note.accidental === "#") {
      return `${lowerLetter}#/${octave}`;
    }

    if (note.accidental === "b") {
      return `${lowerLetter}b/${octave}`;
    }

    if (note.accidental === "n") {
      return `${lowerLetter}/${octave}`;
    }

    // Otherwise use key signature.
    const keyMap = KEY_SIGNATURE_ACCIDENTALS[keySignature] ?? {};
    const keyAccidental = keyMap[lowerLetter];

    if (keyAccidental) {
      return `${lowerLetter}${keyAccidental}/${octave}`;
    }

    return `${lowerLetter}/${octave}`;
  }
  function yToPitch(y: number) {
    const topStaffLineY = topStaffLineYRef.current;
    const bottomStaffLineY = bottomStaffLineYRef.current;

    // There are 4 gaps between the 5 staff lines.
    const staffLineSpacing = (bottomStaffLineY - topStaffLineY) / 4;

    // One pitch step is line-to-space or space-to-line.
    const pitchStep = staffLineSpacing / 2;

    // In treble clef:
    // f/5 is the top staff line.
    // c/6 is four pitch steps above f/5:
    // f/5 -> g/5 -> a/5 -> b/5 -> c/6
    const firstPitchY = topStaffLineY - 4 * pitchStep;

    // Browser y gets bigger as you move down.
    // Our pitch array also goes from high to low.
    const index = Math.round((y - firstPitchY) / pitchStep);

    const clampedIndex = Math.max(
      0,
      Math.min(PITCHES_TOP_TO_BOTTOM.length - 1, index),
    );

    return PITCHES_TOP_TO_BOTTOM[clampedIndex];
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

  function nextMessageId() {
    messageIdRef.current += 1;
    return `msg-${messageIdRef.current}`;
  }

  function pushMessage(message: ChatMessage) {
    setMessages((prev) => [...prev, message]);
  }

  function pushUserMessage(text: string) {
    pushMessage({ id: nextMessageId(), kind: "text", role: "user", text });
  }

  function pushAssistantMessage(text: string) {
    pushMessage({ id: nextMessageId(), kind: "text", role: "assistant", text });
  }

  function pushProgressionCard(
    label: "Generated" | "Updated",
    keyLabel: string,
    progression: ScoredChord[],
  ) {
    pushMessage({
      id: nextMessageId(),
      kind: "progression",
      heading: `${label} in ${formatKeyForHeading(keyLabel)}`,
      items: buildProgressionIdentityItems(progression),
    });
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
      pushMessage({
        id: nextMessageId(),
        kind: "explanation",
        overview: data.overview,
        measures: data.measures.filter((measure) => measure.explanation),
      });
    } catch {
      pushAssistantMessage(
        "A plain-English explanation is unavailable right now. The progression is still ready to play.",
      );
    } finally {
      setIsExplaining(false);
    }
  }

  function buildExplanationRequest(
    finalProgression: ScoredChord[],
    voicedProgression: PlacedChord[][],
    keyLabel: string,
    styleRequest: string,
    styleSummary: string,
  ): ExplanationRequest | null {
    if (finalProgression.length === 0) return null;

    const bassMidiSequence = getVoicedBassMidiSequence(voicedProgression);
    const identities = buildExplanationIdentityItems(finalProgression);

    return {
      activeKey: keyLabel,
      key: keyLabel,
      styleRequest,
      styleSummary,
      progression: finalProgression.map((scoredChord, index) => ({
        ...identities[index],
        score: scoredChord.score,
        reasons: getGroundedExplanationReasons(
          scoredChord,
          index,
          bassMidiSequence,
        ),
      })),
    };
  }

  function renderProgression(
    finalProgression: ScoredChord[],
    keyLabel: string,
    effectiveStyle: StyleOption,
    label: "Generated" | "Updated",
    preferences?: GenerationPreferences,
  ) {
    const voicedProgression = voiceProgression(
      finalProgression,
      measures,
      getRenderedPitch,
      effectiveStyle,
      preferences,
    );
    lastProgressionRef.current = finalProgression;
    setChordMeasures(voicedProgression);
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
      return applyChordEdits(baseProgression, requestedActions, {
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
    const effectiveStyle = getEffectiveStyle(
      normalizedPrompt,
      data?.primaryStyle ?? BLANK_PROMPT_STYLE,
    );
    const preferences = toGenerationPreferences(
      data ?? DEFAULT_INTERPRETED_STYLE,
    );
    const requestedActions = data?.actions ?? [];

    if (data) {
      setAiInterpretation(data);
    } else {
      setAiInterpretation(DEFAULT_INTERPRETED_STYLE);
    }

    const generatedKey = getGenerationKey(
      keySignature,
      generationMode,
      measures,
      getRenderedPitch,
    );

    const baseProgression = chooseProgression(
      generatedKey,
      measures,
      getRenderedPitch,
      effectiveStyle,
      preferences,
    );
    const finalProgression = applyRequestedActions(
      baseProgression,
      requestedActions,
      generatedKey,
    );

    renderProgression(
      finalProgression,
      generatedKey.label,
      effectiveStyle,
      "Generated",
      preferences,
    );
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

    if (requestedActions.length > 0) {
      const effectiveStyle = getEffectiveStyle(
        normalizedPrompt,
        aiInterpretation?.primaryStyle ?? BLANK_PROMPT_STYLE,
      );
      // Apply only the returned preference patch to the current active
      // preferences so a combined request (deterministic chord actions plus an
      // explicit style/preference change like "make it jazzier") applies both.
      // Unrelated preferences are preserved by applyHarmonyPreferencePatch.
      const activePreferences = toGenerationPreferences(
        aiInterpretation ?? DEFAULT_INTERPRETED_STYLE,
      );
      const effectivePreferences: GenerationPreferences = {
        ...applyHarmonyPreferencePatch(
          activePreferences,
          data.revision?.requestedChanges ?? {},
        ),
        style: effectiveStyle,
      };
      const baseInterpretationForActions =
        aiInterpretation ?? DEFAULT_INTERPRETED_STYLE;
      const appliedInterpretation: InterpretedStyle = {
        ...baseInterpretationForActions,
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
      };
      setAiInterpretation(appliedInterpretation);

      const finalProgression = applyRequestedActions(
        previousProgression,
        requestedActions,
        generatedKey,
      );

      renderProgression(
        finalProgression,
        generatedKey.label,
        effectiveStyle,
        "Updated",
        effectivePreferences,
      );
      setPendingClarification(null);
      return;
    }

    const baseInterpretation = aiInterpretation ?? DEFAULT_INTERPRETED_STYLE;
    const revisionIntent: RevisionIntent = data.revision ?? {
      preserveOverallProgression: true,
      preserveChordPositions: [],
      changeAmount: 0.3,
      requestedChanges: {},
    };
    const applied = applyHarmonyPreferencePatch(
      toGenerationPreferences(baseInterpretation),
      revisionIntent.requestedChanges,
    );
    const effectiveStyle = getEffectiveStyle(
      normalizedPrompt,
      baseInterpretation.primaryStyle,
    );
    const effectivePreferences: GenerationPreferences = {
      ...applied,
      style: effectiveStyle,
      descendingBassWeight: asksForExplicitDescendingBass(normalizedPrompt)
        ? 1
        : applied.descendingBassWeight,
    };
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
      summary: data.summary || baseInterpretation.summary,
    };
    setAiInterpretation(appliedInterpretation);

    const baseProgression = chooseProgression(
      generatedKey,
      measures,
      getRenderedPitch,
      effectiveStyle,
      effectivePreferences,
      revision,
    );
    const finalProgression = applyRequestedActions(
      baseProgression,
      data.actions ?? [],
      generatedKey,
    );

    renderProgression(
      finalProgression,
      generatedKey.label,
      effectiveStyle,
      "Updated",
      effectivePreferences,
    );
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
    const effectiveStyle = activeInterpretation.primaryStyle ?? BLANK_PROMPT_STYLE;
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
      effectiveStyle,
      "Updated",
      effectivePreferences,
    );
    setPendingClarification(null);
  }

  function handleClarification(
    data: HarmonyRouterResponse,
    originalMessage: string,
  ) {
    const question =
      data.clarificationQuestion ??
      "Could you clarify whether you want a new progression or a change to the current one?";

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
      normalizedPrompt === "" ? "Generate a progression" : normalizedPrompt,
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
          handleDirectEditShortcut(
            normalizedPrompt,
            directEdits,
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
            "AI interpretation was unavailable. A default progression was generated instead.",
        );
        if (previousProgression && previousProgression.length > 0) {
          return;
        }
        handleGenerateNewProgression(normalizedPrompt);
        return;
      }

      switch (data.intent) {
        case "generate_new":
          handleGenerateNewProgression(normalizedPrompt, data);
          break;
        case "revise_existing":
          handleReviseExistingProgression(normalizedPrompt, data);
          break;
        case "clarify":
          handleClarification(data, normalizedPrompt);
          break;
        case "answer_question":
          handleAnswerQuestion(data, normalizedPrompt);
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

    // Source of truth for any further revisions/edits.
    lastProgressionRef.current = next;

    // Re-voice the COMPLETE progression. Style mirrors what generation used:
    // the interpreted primaryStyle, or the blank-prompt default.
    const style = aiInterpretation?.primaryStyle ?? BLANK_PROMPT_STYLE;
    const preferences = aiInterpretation
      ? toGenerationPreferences(aiInterpretation)
      : toGenerationPreferences(DEFAULT_INTERPRETED_STYLE);
    setChordMeasures(
      voiceProgression(next, measures, getRenderedPitch, style, preferences),
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
    setChordMeasures([[], [], [], []]);
    // Clear progression metadata so nothing is stale. The conversation log is
    // left intact so the history of the session stays readable.
    setAiInterpretation(null);
    setPendingClarification(null);
    lastProgressionRef.current = null;
    pushAssistantMessage("Chord progression cleared.");
  }

  const hasNotes = measures.some((measure) => measure.length > 0);
  const hasProgression = chordMeasures.some((measure) => measure.length > 0);

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
            <div ref={containerRef} />
          </div>
        </div>
      </section>

      <HarmonyChat
        composerValue={stylePrompt}
        error={aiError}
        hasProgression={hasProgression}
        helperText={PROMPT_HELPER_TEXT}
        isExplaining={isExplaining}
        isGenerating={isGenerating}
        messages={messages}
        onComposerChange={setStylePrompt}
        onSubmit={handleGenerateProgression}
        placeholder={
          hasProgression ? REVISION_PLACEHOLDER : FRESH_PLACEHOLDER
        }
      />
    </div>
  );
}
