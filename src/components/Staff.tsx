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
  getCloseChordVoicingForPcs,
  getKeySignatureExtraWidth,
  getMeasureLowestMelodyMidi,
  KEY_SIGNATURE_ACCIDENTALS,
  parsePitchToMidi,
  PITCHES_TOP_TO_BOTTOM,
} from "../music/noteUtils";
import type {
  DurationName,
  GenerationMode,
  PlacedChord,
  PlacedNote,
  StyleOption,
} from "../music/types";

const NOTE_DURATION_OPTIONS: {
  duration: DurationName;
  label: string;
  title: string;
}[] = [
  { duration: "w", label: "𝅝", title: "Whole note" },
  { duration: "h", label: "𝅗𝅥", title: "Half note" },
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
  const [chordStyle, setChordStyle] = useState<StyleOption>("simple");
  const [selectedAccidental, setSelectedAccidental] =
  useState<"#" | "b" | "n" | null>(null);

  // Stores the real top and bottom staff line y-values from VexFlow
  const topStaffLineYRef = useRef<number>(40);
  const bottomStaffLineYRef = useRef<number>(80);

  const [selectedDuration, setSelectedDuration] =
    useState<DurationName>("q");
  const [selectedKind, setSelectedKind] =
    useState<"note" | "rest">("note");
  const [bpm, setBpm] = useState(90);
  const [measures, setMeasures] = useState<PlacedNote[][]>([
    [],
    [],
    [],
    [],
  ]);
  const currentSamplerRef = useRef<Tone.Sampler | null>(null);
  const currentPartRef = useRef<Tone.Part | null>(null);
  const [chordMeasures, setChordMeasures] = useState<PlacedChord[][]>([
    [],
    [],
    [],
    [],
  ]);
  const [progressionInfo, setProgressionInfo] = useState(
    "Chord staff is empty. Generate chords to fill it."
  );
  const staffX = 20;
  const melodyStaffY = 40;
  const chordStaffY = 190;
  const baseFirstMeasureExtra = 90;
  const firstMeasureExtra =
    baseFirstMeasureExtra + getKeySignatureExtraWidth(keySignature);
  const baseMeasureWidth = 300;
  const rendererWidth =
    staffX * 2 + baseMeasureWidth * 4 + firstMeasureExtra;
  const rendererHeight = 380;

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = "";

    const renderer = new Renderer(
      containerRef.current,
      Renderer.Backends.SVG
    );

    renderer.resize(rendererWidth, rendererHeight);

    const context = renderer.getContext();

    let currentX = staffX;

    const melodyStave1 = new Stave(
      currentX,
      melodyStaffY,
      baseMeasureWidth + firstMeasureExtra
    );

    const chordStave1 = new Stave(
      currentX,
      chordStaffY,
      baseMeasureWidth + firstMeasureExtra
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

    const chordStaves = [
      chordStave1,
      chordStave2,
      chordStave3,
      chordStave4,
    ];

    [...melodyStaves, ...chordStaves].forEach((stave) => {
      stave.setContext(context).draw();
    });

    function drawMeasure(
      measureNotes: PlacedNote[],
      stave: Stave
    ) {
      const tickables = buildTickables(measureNotes);

      const voice = new Voice({
        numBeats: 4,
        beatValue: 4,
      });

      voice.addTickables(tickables);

      const noteStartX = stave.getNoteStartX();
      const noteEndX = stave.getNoteEndX();
      const formattingWidth = noteEndX - noteStartX - 10;

      new Formatter()
        .joinVoices([voice])
        .format([voice], formattingWidth);

      const realNotes = tickables.filter(
        (tickable) => tickable instanceof StaveNote
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
        })
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

    new Formatter()
      .joinVoices([voice])
      .format([voice], formattingWidth);

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
        pitch:selectedKind === "note" ? pitch : "b/4",
        kind: selectedKind,
        accidental: selectedKind === "note" ? selectedAccidental : null,
      };

      newMeasures[measureInfo.measureIndex] = [
        ...measureNotes,
        newNote,
      ];
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
      Math.min(PITCHES_TOP_TO_BOTTOM.length - 1, index)
    );

    return PITCHES_TOP_TO_BOTTOM[clampedIndex];
  }

  function generateChords() {
    const generatedKey = getGenerationKey(
      keySignature,
      generationMode,
      measures,
      getRenderedPitch
    );
    const progression = chooseProgression(
      generatedKey,
      measures,
      getRenderedPitch,
      chordStyle
    );

    let previousBassMidi: number | undefined;
    const newChordMeasures: PlacedChord[][] = progression.map(
      (scoredChord, measureIndex) => {
        const chord = scoredChord.chord;
        const lowestMelodyMidi = getMeasureLowestMelodyMidi(
          measures[measureIndex],
          getRenderedPitch
        );
        const pitches = getCloseChordVoicingForPcs(
          chord.pcs,
          chord.noteNames,
          lowestMelodyMidi,
          chordStyle === "descendingBass" ? previousBassMidi : undefined
        );

        previousBassMidi = parsePitchToMidi(pitches[0]) ?? previousBassMidi;

        return [
          {
            slot: 0,
            duration: "w",
            durationSlots: 8,
            pitches,
            symbol: chord.name,
            score: scoredChord.score,
            reasons: scoredChord.reasons,
          },
        ];
      }
    );

    setChordMeasures(newChordMeasures);
    setProgressionInfo(
      `Generated in ${generatedKey.label}: ${progression
        .map((scoredChord) => scoredChord.chord.name)
        .join(" - ")}`
    );
}


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
  setSelectedAccidental((prev) =>
    prev === accidental ? null : accidental
  );
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
  }

  function durationButtonClass(duration: DurationName, kind: "note" | "rest") {
    const isSelected =
      selectedDuration === duration && selectedKind === kind;

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

  const chordExplanations = chordMeasures.flatMap((measureChords, measureIndex) =>
    measureChords.flatMap((chord) => {
      if (!chord.reasons || chord.reasons.length === 0) return [];

      return [
        {
          measureNumber: measureIndex + 1,
          symbol: chord.symbol,
          score: chord.score,
          reasons: chord.reasons,
        },
      ];
    })
  );

return (
  <div className="bg-white border rounded-lg p-4 shadow space-y-4">
    {/* Top controls row */}
    <div
      className="flex items-start justify-between gap-4"
      style={{ width: rendererWidth }}
    >
      {/* Left controls */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Note + Rest duration buttons */}
        <div>
          <div className="text-xs text-gray-500 mb-1">Select to add note or rest</div>
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

      {/* BPM + Play */}
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
        <div>
          <div className="text-xs text-gray-500 mb-1">New progression</div>
          <button
            onClick={generateChords}
            className="bg-indigo-700 text-white border border-indigo-900 rounded px-4 h-10 hover:bg-indigo-600"
          >
            Generate
          </button>
        </div>
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
        <div>
          <div className="text-xs text-gray-500 mb-1">Style</div>
          <select
            value={chordStyle}
            onChange={(e) => setChordStyle(e.target.value as StyleOption)}
            className="bg-gray-200 text-black border border-gray-500 rounded px-3 h-10"
          >
            <option value="simple">Simple</option>
            <option value="jazzy">Jazzy</option>
            <option value="bluesy">Bluesy</option>
            <option value="descendingBass">Descending bass</option>
          </select>
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
            disabled={chordMeasures.every((measure) => measure.length === 0)}
            className={clearChordsButtonClass()}
          >
            Clear Chords
          </button>
        </div>
      </div>
    </div>

<p className="text-sm text-gray-700">{progressionInfo}</p>

    {chordExplanations.length > 0 && (
      <div
        className="border border-gray-300 bg-gray-50 rounded p-3 text-sm text-gray-800 space-y-3"
        style={{ width: rendererWidth }}
      >
        <div className="font-semibold text-gray-900">Why these chords?</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {chordExplanations.map((explanation) => (
            <div
              key={`${explanation.measureNumber}-${explanation.symbol}`}
              className="bg-white border border-gray-200 rounded p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold">
                  Measure {explanation.measureNumber}: {explanation.symbol}
                </div>
                {explanation.score !== undefined && (
                  <div className="text-xs text-gray-500">
                    Score {explanation.score}
                  </div>
                )}
              </div>
              <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-700">
                {explanation.reasons.map((reason, reasonIndex) => (
                  <li key={`${reason}-${reasonIndex}`}>{reason}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Staff */}
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
);
}
