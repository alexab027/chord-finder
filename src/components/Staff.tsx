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
  PITCHES_TOP_TO_BOTTOM,
} from "../music/noteUtils";
import { voiceProgression } from "../music/voicing";
import {
  applyChordEdit,
  applyChordEdits,
  HarmonyActionError,
  type ChordEditAction,
} from "../harmony/actions";
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

type AiProgressionExplanation = {
  overview: string;
  measures: Array<{
    measure: number;
    chord: string;
    explanation: string;
  }>;
};

type ExplanationRequest = {
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

// The Style dropdown was removed; a blank prompt uses the engine's original
// default behavior (style "simple", no AI preferences).
const BLANK_PROMPT_STYLE: StyleOption = "simple";

const PROMPT_HELPER_TEXT =
  "Leave this blank to generate the progression that best fits your melody. " +
  'After generating, you can ask for changes such as "keep this progression ' +
  'but make it more complex."';

const FRESH_PLACEHOLDER =
  "Example: Warm and jazzy with a descending bass and a strong ending";

const REVISION_PLACEHOLDER =
  "Example: Keep this progression but make it slightly more complex";

function clampPref(value: number) {
  return Math.min(1, Math.max(0, value));
}

// Applies the model's relative revision nudges on top of the preferences that
// produced the current progression.
function applyRevisionDeltas(
  base: GenerationPreferences,
  changes: RevisionIntent["requestedChanges"],
): GenerationPreferences {
  const complexityDelta = changes.complexityDelta ?? 0;

  return {
    style: base.style,
    descendingBassWeight: clampPref(
      base.descendingBassWeight + (changes.descendingBassDelta ?? 0),
    ),
    complexity: clampPref(base.complexity + complexityDelta),
    dissonanceTolerance: clampPref(
      base.dissonanceTolerance + (changes.dissonanceDelta ?? 0),
    ),
    cadenceStrength: clampPref(
      base.cadenceStrength + (changes.cadenceDelta ?? 0),
    ),
    preferSevenths:
      complexityDelta > 0.25
        ? true
        : complexityDelta < -0.25
          ? false
          : base.preferSevenths,
    preferSuspensions: base.preferSuspensions,
  };
}

const NOTE_DURATION_OPTIONS: {
  duration: DurationName;
  label: string;
  title: string;
}[] = [
  { duration: "w", label: "𝅝", title: "Whole note" },
  { duration: "h", label: "𝅗𝅥", title: "Half note" },
  { duration: "q", label: "♩", title: "Quarter note" },
  { duration: "8", label: "♪", title: "Eighth note" },
];

const REST_DURATION_OPTIONS: {
  duration: DurationName;
  label: string;
  title: string;
}[] = [
  { duration: "w", label: "𝄻", title: "Whole rest" },
  { duration: "h", label: "𝄼", title: "Half rest" },
  { duration: "q", label: "𝄽", title: "Quarter rest" },
  { duration: "8", label: "𝄾", title: "Eighth rest" },
];

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
  const [harmonyAssistantMessage, setHarmonyAssistantMessage] = useState<
    string | null
  >(null);

  // The full scored progression behind the rendered chords. Kept in a ref (not
  // rendered) so revisions can pass the current chord identities into scoring.
  const lastProgressionRef = useRef<ScoredChord[] | null>(null);

  // Plain-English explanation of the current progression. Requested
  // automatically after each generation; grounded only in engine output.
  const [aiExplanation, setAiExplanation] =
    useState<AiProgressionExplanation | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [aiExplainError, setAiExplainError] = useState<string | null>(null);

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
  const [progressionInfo, setProgressionInfo] = useState(
    "Chord staff is empty. Generate chords to fill it.",
  );
  const staffX = 20;
  const melodyStaffY = 40;
  const chordStaffY = 190;
  const baseFirstMeasureExtra = 90;
  const firstMeasureExtra =
    baseFirstMeasureExtra + getKeySignatureExtraWidth(keySignature);
  const baseMeasureWidth = 300;
  const rendererWidth = staffX * 2 + baseMeasureWidth * 4 + firstMeasureExtra;
  const rendererHeight = 380;

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

    console.log("clickY:", clickY, "pitch:", pitch);

    setMeasures((prevMeasures) => {
      const newMeasures = prevMeasures.map((measure) => [...measure]);

      const measureNotes = newMeasures[measureInfo.measureIndex];

      const nextSlot = getNextAvailableSlot(measureNotes);

      if (nextSlot + durationSlots > 8) {
        console.log("Note does not fit in this measure.");
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
    currentProgression?: Array<{ measure: number; romanNumeral: string }>,
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
      const rawRouterResponse = await response.text();
      if (process.env.NODE_ENV === "development") {
        console.debug("rawRouterResponse", rawRouterResponse);
      }

      const parsedRouterResponse = JSON.parse(
        rawRouterResponse,
      ) as HarmonyRouterResponse;
      if (process.env.NODE_ENV === "development") {
        console.debug("parsedRouterResponse", parsedRouterResponse);
        console.debug(
          "parsedRouterResponse.intent",
          parsedRouterResponse.intent,
        );
        console.debug("pendingClarification", pendingClarification);
      }

      return parsedRouterResponse;
    } catch {
      return null;
    }
  }

  // Best-effort plain-English explanation. Failures never block or undo a
  // generated progression.
  async function requestExplanation(requestBody: ExplanationRequest) {
    setIsExplaining(true);

    try {
      const response = await fetch("/api/explain-progression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        setAiExplainError(
          "Plain-English explanation is unavailable right now. The progression above is still ready to play.",
        );
        return;
      }

      const data = (await response.json()) as AiProgressionExplanation;
      setAiExplanation(data);
    } catch {
      setAiExplainError(
        "Plain-English explanation is unavailable right now. The progression above is still ready to play.",
      );
    } finally {
      setIsExplaining(false);
    }
  }

  function buildExplanationRequest(
    finalProgression: ScoredChord[],
    keyLabel: string,
    styleRequest: string,
    styleSummary: string,
  ): ExplanationRequest | null {
    if (finalProgression.length === 0) return null;

    return {
      key: keyLabel,
      styleRequest,
      styleSummary,
      progression: finalProgression.map((scoredChord, index) => ({
        measure: index + 1,
        symbol: scoredChord.chord.name,
        romanNumeral: scoredChord.chord.name,
        score: scoredChord.score,
        reasons: scoredChord.reasons,
      })),
    };
  }

  function renderProgression(
    finalProgression: ScoredChord[],
    keyLabel: string,
    effectiveStyle: StyleOption,
    label: "Generated" | "Updated",
  ) {
    lastProgressionRef.current = finalProgression;
    setChordMeasures(
      voiceProgression(
        finalProgression,
        measures,
        getRenderedPitch,
        effectiveStyle,
      ),
    );
    setProgressionInfo(
      `${label} in ${keyLabel}: ${finalProgression
        .map((scoredChord) => scoredChord.chord.name)
        .join(" - ")}`,
    );
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
  ): ExplanationRequest | null {
    const effectiveStyle = data?.primaryStyle ?? BLANK_PROMPT_STYLE;
    const preferences = data ? toGenerationPreferences(data) : undefined;
    const styleSummary = data?.summary ?? "";
    const requestedActions = data?.actions ?? [];

    if (data) {
      setAiInterpretation(data);
    } else {
      setAiInterpretation(null);
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
    );
    setPendingClarification(null);
    setHarmonyAssistantMessage(null);

    return buildExplanationRequest(
      finalProgression,
      generatedKey.label,
      normalizedPrompt,
      styleSummary,
    );
  }

  function handleReviseExistingProgression(
    normalizedPrompt: string,
    data: HarmonyRouterResponse,
  ): ExplanationRequest | null {
    const previousProgression = lastProgressionRef.current;
    if (!previousProgression || previousProgression.length === 0) {
      setHarmonyAssistantMessage(
        "There is no existing progression to edit. Would you like me to generate one first?",
      );
      return null;
    }

    const generatedKey = getGenerationKey(
      keySignature,
      generationMode,
      measures,
      getRenderedPitch,
    );
    const requestedActions = data.actions ?? [];

    if (requestedActions.length > 0) {
      const effectiveStyle =
        aiInterpretation?.primaryStyle ?? BLANK_PROMPT_STYLE;
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
      );
      setPendingClarification(null);
      setHarmonyAssistantMessage(null);

      return buildExplanationRequest(
        finalProgression,
        generatedKey.label,
        normalizedPrompt,
        aiInterpretation?.summary ?? "",
      );
    }

    const baseInterpretation = aiInterpretation ?? DEFAULT_INTERPRETED_STYLE;
    const revisionIntent: RevisionIntent = data.revision ?? {
      preserveOverallProgression: true,
      preserveChordPositions: [],
      changeAmount: 0.3,
      requestedChanges: {},
    };
    const applied = applyRevisionDeltas(
      toGenerationPreferences(baseInterpretation),
      revisionIntent.requestedChanges,
    );
    const effectiveStyle = baseInterpretation.primaryStyle;
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
      descendingBassWeight: applied.descendingBassWeight,
      complexity: applied.complexity,
      dissonanceTolerance: applied.dissonanceTolerance,
      cadenceStrength: applied.cadenceStrength,
      preferSevenths: applied.preferSevenths,
      preferSuspensions: applied.preferSuspensions,
      summary: data.summary || baseInterpretation.summary,
    };
    setAiInterpretation(appliedInterpretation);

    const baseProgression = chooseProgression(
      generatedKey,
      measures,
      getRenderedPitch,
      effectiveStyle,
      applied,
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
    );
    setPendingClarification(null);
    setHarmonyAssistantMessage(null);

    return buildExplanationRequest(
      finalProgression,
      generatedKey.label,
      normalizedPrompt,
      appliedInterpretation.summary,
    );
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
    setHarmonyAssistantMessage(question);
  }

  function handleAnswerQuestion(data: HarmonyRouterResponse) {
    setPendingClarification(null);
    const currentProgression = lastProgressionRef.current;
    if (currentProgression && currentProgression.length > 0) {
      setProgressionInfo(
        `Current progression unchanged: ${currentProgression
          .map((scoredChord) => scoredChord.chord.name)
          .join(" - ")}`,
      );
    }
    setHarmonyAssistantMessage(
      data.assistantMessage ??
        "I could not determine an answer from the current progression.",
    );
  }

  // Route first, then generate, revise, clarify, or answer.
  async function handleGenerateProgression() {
    setIsGenerating(true);
    setAiError(null);
    setHarmonyAssistantMessage(null);
    setAiExplanation(null);
    setAiExplainError(null);

    let explanationContext: ExplanationRequest | null = null;

    try {
      const normalizedPrompt = stylePrompt.trim();

      if (normalizedPrompt === "") {
        explanationContext = handleGenerateNewProgression(normalizedPrompt);
        return;
      }

      const previousProgression = lastProgressionRef.current;
      const currentProgressionSummary = previousProgression
        ? previousProgression.map((scoredChord, index) => ({
            measure: index + 1,
            romanNumeral: scoredChord.chord.name,
          }))
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
        setAiInterpretation(null);
        setAiError(
          data?.warning ??
            "AI interpretation was unavailable. A default progression was generated instead.",
        );
        explanationContext = handleGenerateNewProgression(normalizedPrompt);
        return;
      }

      switch (data.intent) {
        case "generate_new":
          if (process.env.NODE_ENV === "development") {
            console.debug("harmonyRouterBranch", "generate_new");
          }
          explanationContext = handleGenerateNewProgression(
            normalizedPrompt,
            data,
          );
          break;
        case "revise_existing":
          if (process.env.NODE_ENV === "development") {
            console.debug("harmonyRouterBranch", "revise_existing");
          }
          explanationContext = handleReviseExistingProgression(
            normalizedPrompt,
            data,
          );
          break;
        case "clarify":
          if (process.env.NODE_ENV === "development") {
            console.debug("harmonyRouterBranch", "clarify");
          }
          handleClarification(data, normalizedPrompt);
          break;
        case "answer_question":
          if (process.env.NODE_ENV === "development") {
            console.debug("harmonyRouterBranch", "answer_question");
          }
          handleAnswerQuestion(data);
          break;
      }
    } catch (error) {
      console.error("generateProgression failed:", error);
      setAiError("Something went wrong while generating. Please try again.");
    } finally {
      setIsGenerating(false);
      if (explanationContext) {
        await requestExplanation(explanationContext);
      }
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
    setChordMeasures(voiceProgression(next, measures, getRenderedPitch, style));
    setProgressionInfo(
      `Edited in ${editedKey.label}: ${next
        .map((scoredChord) => scoredChord.chord.name)
        .join(" - ")}`,
    );

    // The prior explanation described the pre-edit chords; clear it. We do NOT
    // auto-request a new explanation: copied chords carry stale positional
    // score/reasons, so the grounded explanation payload would be misleading.
    setAiExplanation(null);
    setAiExplainError(null);
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
    setProgressionInfo("Chord progression cleared.");
    // Clear all progression metadata + explanation so nothing is stale.
    setAiExplanation(null);
    setAiExplainError(null);
    setAiInterpretation(null);
    setPendingClarification(null);
    setHarmonyAssistantMessage(null);
    lastProgressionRef.current = null;
  }

  function durationButtonClass(duration: DurationName, kind: "note" | "rest") {
    const isSelected = selectedDuration === duration && selectedKind === kind;

    return isSelected
      ? "bg-gray-800 text-white"
      : "bg-white text-gray-700 hover:bg-gray-100";
  }

  function clearChordsButtonClass() {
    const hasChords = chordMeasures.some((measure) => measure.length > 0);
    return hasChords
      ? "bg-red-700 text-white border border-red-900 rounded px-4 h-10 hover:bg-red-600"
      : "bg-gray-200 text-gray-500 border border-gray-300 rounded px-4 h-10 cursor-not-allowed";
  }
  function clearAllButtonClass() {
    const hasNotes = measures.some((measure) => measure.length > 0);
    return hasNotes
      ? "border border-gray-300 rounded px-3 h-10 text-sm text-gray-400"
      : "border border-gray-300 rounded px-3 h-10 text-sm text-gray-400 cursor-not-allowed";
  }
  function deleteLastButtonClass() {
    const hasNotes = measures.some((measure) => measure.length > 0);
    return hasNotes
      ? "border border-gray-300 rounded px-3 h-10 text-sm text-gray-400"
      : "border border-gray-300 rounded px-3 h-10 text-sm text-gray-400 cursor-not-allowed";
  }

  const hasProgression = chordMeasures.some((measure) => measure.length > 0);
  const visibleExplanationMeasures =
    aiExplanation?.measures.filter((measure) => measure.explanation) ?? [];

  return (
    <div className="bg-white border rounded-lg p-4 shadow space-y-6">
      {/* Section 1: melody + chord staves and all note-entry controls */}
      <section className="space-y-4">
        {/* Controls row */}
        <div
          className="flex items-start justify-between gap-4 flex-wrap"
          style={{ maxWidth: rendererWidth }}
        >
          {/* Left controls */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Note + Rest duration buttons */}
            <div>
              <div className="text-xs text-gray-500 mb-1">
                Select to add note or rest
              </div>
              <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden shadow-sm divide-x divide-gray-300">
                {NOTE_DURATION_OPTIONS.map((option) => (
                  <button
                    key={`note-${option.duration}`}
                    title={option.title}
                    onClick={() => {
                      setSelectedKind("note");
                      setSelectedDuration(option.duration);
                    }}
                    className={`${durationButtonClass(option.duration, "note")} text-2xl w-10 h-10 flex items-center justify-center transition-colors`}
                  >
                    {option.label}
                  </button>
                ))}
                <div className="w-px bg-gray-400" />
                {REST_DURATION_OPTIONS.map((option) => (
                  <button
                    key={`rest-${option.duration}`}
                    title={option.title}
                    onClick={() => {
                      setSelectedKind("rest");
                      setSelectedDuration(option.duration);
                      setSelectedAccidental(null);
                    }}
                    className={`${durationButtonClass(option.duration, "rest")} text-2xl w-10 h-10 flex items-center justify-center transition-colors`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Accidental buttons */}
            <div>
              <div className="text-xs  text-gray-500 mb-1">Add accidentals</div>
              <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden shadow-sm divide-x divide-gray-300">
                {(["#", "b", "n"] as const).map((accidental) => (
                  <button
                    key={accidental}
                    onClick={() => handleAccidentalClick(accidental)}
                    className={`${
                      selectedAccidental === accidental
                        ? "bg-gray-800 text-white"
                        : "bg-white text-gray-700 hover:bg-gray-100"
                    } text-xl w-10 h-10 flex items-center justify-center transition-colors`}
                  >
                    {accidental === "#" ? "♯" : accidental === "b" ? "♭" : "♮"}
                  </button>
                ))}
              </div>
            </div>

            {/* Key signature dropdown */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Key signature</div>
              <select
                value={keySignature}
                onChange={(e) => handleKeySignatureChange(e.target.value)}
                className="bg-gray-200 text-black border border-gray-500 rounded px-3 h-10"
              >
                <option value="C">C</option>
                <option value="G">G / Em</option>
                <option value="D">D / Bm</option>
                <option value="A">A / F#m</option>
                <option value="E">E / C#m</option>
                <option value="B">B / G#m</option>
                <option value="F">F / Dm</option>
                <option value="Bb">Bb / Gm</option>
                <option value="Eb">Eb / Cm</option>
                <option value="Ab">Ab / Fm</option>
              </select>
            </div>

            {/* Mode */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Mode</div>
              <select
                value={generationMode}
                onChange={(e) =>
                  handleGenerationModeChange(e.target.value as GenerationMode)
                }
                className="bg-gray-200 text-black border border-gray-500 rounded px-3 h-10"
              >
                <option value="automatic">Automatic</option>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
              </select>
            </div>

            {/* Edit buttons */}
            <div>
              <div className="text-xs text-gray-500 mb-1 invisible">Edit</div>
              <div className="flex gap-2">
                <button
                  onClick={deleteLastNote}
                  className={deleteLastButtonClass()}
                >
                  Delete Last
                </button>

                <button
                  onClick={clearAllMeasures}
                  className={clearAllButtonClass()}
                >
                  Clear Melody Staff
                </button>
              </div>
            </div>
          </div>

          {/* BPM + Play + Clear Chords */}
          <div className="flex items-start justify-end gap-2 flex-wrap">
            <div>
              <div className="text-xs text-gray-500 mb-1">BPM</div>
              <input
                type="number"
                min="40"
                max="240"
                value={bpm}
                onChange={(e) => {
                  const nextBpm = Number(e.target.value);
                  if (!Number.isNaN(nextBpm)) setBpm(nextBpm);
                }}
                className="w-20 bg-gray-200 text-black border border-gray-500 rounded px-2 h-10"
              />
            </div>
            <div className="flex flex-col items-end gap-2">
              <div>
                <div className="text-xs invisible mb-1">x</div>
                <button
                  onClick={playMeasures}
                  className="bg-green-700 text-white border border-green-900 rounded px-4 h-10 hover:bg-green-600"
                >
                  Play
                </button>
              </div>
              <button
                onClick={clearChords}
                disabled={chordMeasures.every(
                  (measure) => measure.length === 0,
                )}
                className={clearChordsButtonClass()}
              >
                Clear Chords
              </button>
            </div>
          </div>
        </div>

        {/* Staff */}
        <div className="overflow-x-auto">
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

      {/* Section 2: harmony prompt, generate/update, progression summary, explanation */}
      <section className="space-y-3 border-t border-gray-200 pt-4 w-full max-w-3xl">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-800">
            Describe the harmony you want
          </span>
          <span className="text-xs text-gray-500">{PROMPT_HELPER_TEXT}</span>
          <textarea
            value={stylePrompt}
            onChange={(event) => setStylePrompt(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder={
              hasProgression ? REVISION_PLACEHOLDER : FRESH_PLACEHOLDER
            }
            className="mt-1 rounded-md border border-gray-400 bg-white text-black px-3 py-2 text-sm"
          />
        </label>

        <button
          onClick={handleGenerateProgression}
          disabled={isGenerating}
          className={
            isGenerating
              ? "bg-gray-200 text-gray-500 border border-gray-300 rounded px-4 h-10 cursor-not-allowed"
              : "bg-indigo-700 text-white border border-indigo-900 rounded px-4 h-10 hover:bg-indigo-600"
          }
        >
          {isGenerating
            ? hasProgression
              ? "Updating…"
              : "Generating…"
            : hasProgression
              ? "Update progression"
              : "Generate progression"}
        </button>

        {aiError && <p className="text-xs text-amber-700">{aiError}</p>}

        {harmonyAssistantMessage && (
          <p className="text-sm text-gray-700">{harmonyAssistantMessage}</p>
        )}

        {hasProgression && (
          <p className="text-sm text-gray-700">{progressionInfo}</p>
        )}

        {(isExplaining || aiExplanation || aiExplainError) && (
          <div className="border border-gray-200 bg-gray-50 rounded p-3 text-sm space-y-2">
            <div className="font-semibold text-gray-900">In plain English</div>

            {isExplaining && (
              <p className="text-gray-500">
                Writing a plain-English explanation…
              </p>
            )}

            {aiExplainError && (
              <p className="text-xs text-amber-700">{aiExplainError}</p>
            )}

            {aiExplanation?.overview && (
              <p className="text-gray-700">{aiExplanation.overview}</p>
            )}

            {visibleExplanationMeasures.length > 0 && (
              <ul className="space-y-1 text-gray-700">
                {visibleExplanationMeasures.map((measure) => (
                  <li key={`ai-explanation-${measure.measure}`}>
                    <span className="font-medium">
                      Measure {measure.measure} ({measure.chord}):
                    </span>{" "}
                    {measure.explanation}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
