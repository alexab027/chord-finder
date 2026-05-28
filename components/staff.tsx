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

type DurationName = "w" | "h" | "q" | "8";
type AccidentalName = "#" | "b" | "n" | null;

type PlacedNote = {
  slot: number;
  duration: DurationName;
  durationSlots: number;
  pitch: string;
  kind: "note" | "rest";
  accidental: AccidentalName;
};
type PlacedChord = {
  slot: number;
  duration: DurationName;
  durationSlots: number;
  pitches: string[];
};
const DURATION_TO_SLOTS: Record<DurationName, number> = {
  w: 8,
  h: 4,
  q: 2,
  "8": 1,
};

// simple treble-clef pitch map, top to bottom
const PITCHES_TOP_TO_BOTTOM = [
  "c/6",
  "b/5",
  "a/5",
  "g/5",
  "f/5",
  "e/5",
  "d/5",
  "c/5",
  "b/4",
  "a/4",
  "g/4",
  "f/4",
  "e/4",
  "d/4",
  "c/4",
  "b/3",
  "a/3",
  "g/3",
];
const KEY_SIGNATURE_ACCIDENTALS: Record<string, Record<string, "#" | "b">> = {
  C: {},

  G: { f: "#" },
  D: { f: "#", c: "#" },
  A: { f: "#", c: "#", g: "#" },
  E: { f: "#", c: "#", g: "#", d: "#" },
  B: { f: "#", c: "#", g: "#", d: "#", a: "#" },

  F: { b: "b" },
  Bb: { b: "b", e: "b" },
  Eb: { b: "b", e: "b", a: "b" },
  Ab: { b: "b", e: "b", a: "b", d: "b" },
};
const NOTE_TO_PC: Record<string, number> = {
  c: 0,
  "c#": 1,
  db: 1,
  d: 2,
  "d#": 3,
  eb: 3,
  e: 4,
  fb: 4,
  "e#": 5,
  f: 5,
  "f#": 6,
  gb: 6,
  g: 7,
  "g#": 8,
  ab: 8,
  a: 9,
  "a#": 10,
  bb: 10,
  b: 11,
  cb: 11,
  "b#": 0,
};

const PC_TO_NOTE_SHARP = [
  "c",
  "c#",
  "d",
  "d#",
  "e",
  "f",
  "f#",
  "g",
  "g#",
  "a",
  "a#",
  "b",
];

const MAJOR_KEY_ROOTS: Record<string, string> = {
  C: "c",
  G: "g",
  D: "d",
  A: "a",
  E: "e",
  B: "b",
  F: "f",
  Bb: "bb",
  Eb: "eb",
  Ab: "ab",
};
function getKeySignatureExtraWidth(keySignature: string) {
  const accidentalCounts: Record<string, number> = {
    C: 0,
    G: 1,
    D: 2,
    A: 3,
    E: 4,
    B: 5,
    F: 1,
    Bb: 2,
    Eb: 3,
    Ab: 4,
  };

  return (accidentalCounts[keySignature] ?? 0) * 12;
}
type ChordCandidate = {
  name: string;
  rootPc: number;
  pcs: number[];
  pitches: string[];
};

function mod12(n: number) {
  return ((n % 12) + 12) % 12;
}

function pitchToPc(pitch: string) {
  // examples:
  // "c/4" -> c
  // "f#/4" -> f#
  // "bb/4" -> bb
  const [name] = pitch.split("/");
  return NOTE_TO_PC[name.toLowerCase()];
}

function pcToPitch(pc: number, octave: number) {
  const noteName = PC_TO_NOTE_SHARP[mod12(pc)];
  return `${noteName}/${octave}`;
}

function buildMajorKeyChords(keySignature: string): ChordCandidate[] {
  const rootName = MAJOR_KEY_ROOTS[keySignature] ?? "c";
  const rootPc = NOTE_TO_PC[rootName];

  // major scale pattern: 1 2 3 4 5 6 7
  const scaleOffsets = [0, 2, 4, 5, 7, 9, 11];
  const scalePcs = scaleOffsets.map((offset) => mod12(rootPc + offset));

  const romanNumerals = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];

  return scalePcs.map((degreePc, degreeIndex) => {
    const thirdPc = scalePcs[(degreeIndex + 2) % 7];
    const fifthPc = scalePcs[(degreeIndex + 4) % 7];

    return {
      name: romanNumerals[degreeIndex],
      rootPc: degreePc,
      pcs: [degreePc, thirdPc, fifthPc],
      pitches: [
        pcToPitch(degreePc, 3),
        pcToPitch(thirdPc, 3),
        pcToPitch(fifthPc, 4),
      ],
    };
  });
}
function scoreChordForMeasure(
  chord: ChordCandidate,
  measureNotes: PlacedNote[],
  getRenderedPitchFn: (note: PlacedNote) => string
) {
  let score = 0;

  for (const note of measureNotes) {
    if (note.kind === "rest") continue;

    const renderedPitch = getRenderedPitchFn(note);
    const melodyPc = pitchToPc(renderedPitch);

    if (chord.pcs.includes(melodyPc)) {
      score += note.durationSlots;
    } else {
      score -= 1;
    }
  }

  return score;
}
export default function Staff() {
  const containerRef = useRef<HTMLDivElement>(null);
  const staffWrapperRef = useRef<HTMLDivElement>(null);

  const [keySignature, setKeySignature] = useState("C");
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
  const [chordMeasures, setChordMeasures] = useState<PlacedChord[][]>([
    [
      {
        slot: 0,
        duration: "w",
        durationSlots: 8,
        pitches: ["c/4", "e/4", "g/4"],
      },
    ],
    [
      {
        slot: 0,
        duration: "w",
        durationSlots: 8,
        pitches: ["f/3", "a/3", "c/4"],
      },
    ],
    [
      {
        slot: 0,
        duration: "w",
        durationSlots: 8,
        pitches: ["g/3", "b/3", "d/4"],
      },
    ],
    [
      {
        slot: 0,
        duration: "w",
        durationSlots: 8,
        pitches: ["c/4", "e/4", "g/4"],
      },
    ],
  ]);
  const staffX = 20;
  const melodyStaffY = 40;
  const chordStaffY = 150;
  const baseFirstMeasureExtra = 90;
  const firstMeasureExtra =
    baseFirstMeasureExtra + getKeySignatureExtraWidth(keySignature);
  const baseMeasureWidth = 300;
  const rendererWidth =
    staffX * 2 + baseMeasureWidth * 4 + firstMeasureExtra;
  const rendererHeight = 300;
  const staffHeight = 80;

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
        num_beats: 4,
        beat_value: 4,
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
      num_beats: 4,
      beat_value: 4,
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

    const melodyClickableTop = melodyStaffY - 30;
    const melodyClickableBottom = melodyStaffY + 90;

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
    const chordCandidates = buildMajorKeyChords(keySignature);

    const newChordMeasures: PlacedChord[][] = measures.map((measureNotes) => {
      if (measureNotes.length === 0) {
        return [];
      }

      let bestChord = chordCandidates[0];
      let bestScore = -Infinity;

      for (const chord of chordCandidates) {
        const score = scoreChordForMeasure(
          chord,
          measureNotes,
          getRenderedPitch
        );

        if (score > bestScore) {
          bestScore = score;
          bestChord = chord;
        }
      }

      return [
        {
          slot: 0,
          duration: "w",
          durationSlots: 8,
          pitches: bestChord.pitches,
        },
    ];
  });

  setChordMeasures(newChordMeasures);
}


//playback
async function playMeasures() {
  await Tone.start();

  const piano = new Tone.Sampler({
    urls: {
      C4: "C4.mp3",
      "D#4": "Ds4.mp3",
      "F#4": "Fs4.mp3",
      A4: "A4.mp3",
    },
    release: 1,
    baseUrl: "https://tonejs.github.io/audio/salamander/",
    }).toDestination();

  await Tone.loaded();

  const now = Tone.now();

  const safeBpm = Math.min(240, Math.max(40, bpm));
  const secondsPerBeat = 60 / safeBpm;
  const secondsPerEighth = secondsPerBeat / 2;
  

  measures.forEach((measureNotes, measureIndex) => {
    measureNotes.forEach((note) => {
      if (note.kind === "rest") return;

      const tonePitch = vexPitchToTonePitch(getRenderedPitch(note));
      const toneDuration = durationToToneDuration(note.duration);

      const totalEighthSlot = measureIndex * 8 + note.slot;
      const startTime = now + totalEighthSlot * secondsPerEighth;

      piano.triggerAttackRelease(
        tonePitch,
        toneDuration,
        startTime
      );
    });
  });
  chordMeasures.forEach((measureChords, measureIndex) => {
  measureChords.forEach((chord) => {
    const totalEighthSlot = measureIndex * 8 + chord.slot;
    const startTime = now + totalEighthSlot * secondsPerEighth;

    const tonePitches = chord.pitches.map(vexPitchToTonePitch);
    const toneDuration = durationToToneDuration(chord.duration);

    piano.triggerAttackRelease(
      tonePitches,
      toneDuration,
      startTime
    );
  });
});
}

  function vexPitchToTonePitch(pitch: string) {
  // "c/4" -> "C4"
  const [name, octave] = pitch.split("/");

  const firstLetter = name[0].toUpperCase();
  const accidental = name.slice(1); // could be "", "#", or "b"

  return firstLetter + accidental + octave;
}

function durationToToneDuration(duration: DurationName) {
  if (duration === "w") return "1n";
  if (duration === "h") return "2n";
  if (duration === "q") return "4n";
  return "8n";
}

//measure-level actions
function handleAccidentalClick(accidental: "#" | "b" | "n") {
  setSelectedAccidental((prev) =>
    prev === accidental ? null : accidental
  );
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

  function clearMeasure(index: number) {
    setMeasures((prevMeasures) => {
      const newMeasures = prevMeasures.map((measure) => [...measure]);
      newMeasures[index] = [];
      return newMeasures;
    });
  }
  function durationButtonClass(duration: DurationName) {
  return selectedDuration === duration
    ? "bg-gray-600 text-white border border-gray-900 rounded px-3 py-1"
    : "bg-gray-200 text-black border border-gray-500 rounded px-3 py-1 hover:bg-gray-300";
  }
  function clearMeasureButtonClass(measureIndex: number) {
    return measures[measureIndex].length > 0
      ? "border border-gray-300 rounded px-3 py-1 text-sm text-gray-400"
      : "border border-gray-300 rounded px-3 py-1 text-sm text-gray-400 cursor-not-allowed";
  }
  function clearAllButtonClass() {
    const hasNotes = measures.some((measure) => measure.length > 0);
    return hasNotes
      ? "border border-gray-300 rounded px-3 py-1 text-sm text-gray-400"
      : "border border-gray-300 rounded px-3 py-1 text-sm text-gray-400 cursor-not-allowed";
  }
  function deleteLastButtonClass() {    const hasNotes = measures.some((measure) => measure.length > 0);
    return hasNotes
      ? "border border-gray-300 rounded px-3 py-1 text-sm text-gray-400"
      : "border border-gray-300 rounded px-3 py-1 text-sm text-gray-400 cursor-not-allowed";
  }

return (
  <div className="bg-white border rounded-lg p-4 shadow space-y-4">
    {/* Top controls row */}
    <div
      className="flex items-center justify-between"
      style={{ width: rendererWidth }}
    >
      {/* Left controls */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Note/Rest toggle */}
        <button
          title="Toggle note/rest"
          onClick={() =>
            setSelectedKind((prev) => (prev === "note" ? "rest" : "note"))
          }
          className={
            selectedKind === "note"
              ? "bg-blue-800 text-white border border-blue-900 rounded px-3 py-1"
              : "bg-purple-700 text-white border border-purple-900 rounded px-3 py-1"
          }
        >
          {selectedKind === "note" ? "Note" : "Rest"}
        </button>

        {/* Duration buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedDuration("w")}
            className={durationButtonClass("w")}
          >
            Whole
          </button>

          <button
            onClick={() => setSelectedDuration("h")}
            className={durationButtonClass("h")}
          >
            Half
          </button>

          <button
            onClick={() => setSelectedDuration("q")}
            className={durationButtonClass("q")}
          >
            Quarter
          </button>

          <button
            onClick={() => setSelectedDuration("8")}
            className={durationButtonClass("8")}
          >
            Eighth
          </button>
        </div>

        {/* Accidental buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => handleAccidentalClick("#")}
            className={
              selectedAccidental === "#"
                ? "bg-blue-800 text-white border border-blue-900 rounded px-3 py-1"
                : "bg-gray-200 text-black border border-gray-500 rounded px-3 py-1 hover:bg-gray-300"
            }
          >
            ♯
          </button>

          <button
            onClick={() => handleAccidentalClick("b")}
            className={
              selectedAccidental === "b"
                ? "bg-blue-800 text-white border border-blue-900 rounded px-3 py-1"
                : "bg-gray-200 text-black border border-gray-500 rounded px-3 py-1 hover:bg-gray-300"
            }
          >
            ♭
          </button>

          <button
            onClick={() => handleAccidentalClick("n")}
            className={
              selectedAccidental === "n"
                ? "bg-blue-800 text-white border border-blue-900 rounded px-3 py-1"
                : "bg-gray-200 text-black border border-gray-500 rounded px-3 py-1 hover:bg-gray-300"
            }
          >
            ♮
          </button>
        </div>

        {/* Key signature dropdown */}
        <select
          value={keySignature}
          onChange={(e) => setKeySignature(e.target.value)}
          className="bg-gray-200 text-black border border-gray-500 rounded px-3 py-1"
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

        {/* Edit buttons */}
        <div className="flex gap-2 ml-3">
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
            Clear All
          </button>
        </div>
      </div>

      {/* BPM + Play */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-700">BPM</label>

        <input
          type="number"
          min="40"
          max="240"
          value={bpm}
          onChange={(e) => {
            const nextBpm = Number(e.target.value);

            if (!Number.isNaN(nextBpm)) {
              setBpm(nextBpm);
            }
          }}
          className="w-20 bg-gray-200 text-black border border-gray-500 rounded px-2 py-1"
        />
        <button
          onClick={generateChords}
          className="bg-indigo-700 text-white border border-indigo-900 rounded px-4 py-1 hover:bg-indigo-600"
        >
          Generate Chords
        </button>
        <button
          onClick={playMeasures}
          className="bg-green-700 text-white border border-green-900 rounded px-4 py-1 hover:bg-green-600"
        >
          Play
        </button>
      </div>
    </div>

    {/* Measure clear buttons */}
    <div className="flex gap-2">
      <button
        onClick={() => clearMeasure(0)}
        className={clearMeasureButtonClass(0)}
      >
        Clear M1
      </button>

      <button
        onClick={() => clearMeasure(1)}
        className={clearMeasureButtonClass(1)}
      >
        Clear M2
      </button>

      <button
        onClick={() => clearMeasure(2)}
        className={clearMeasureButtonClass(2)}
      >
        Clear M3
      </button>

      <button
        onClick={() => clearMeasure(3)}
        className={clearMeasureButtonClass(3)}
      >
        Clear M4
      </button>
    </div>

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