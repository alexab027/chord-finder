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
  symbol: string;
};
const DURATION_TO_SLOTS: Record<DurationName, number> = {
  w: 8,
  h: 4,
  q: 2,
  "8": 1,
};

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

type KeyMode = "major" | "minor";

type KeyContext = {
  signature: string;
  label: string;
  tonicName: string;
  tonicPc: number;
  mode: KeyMode;
};

const KEY_SIGNATURE_CONTEXTS: Record<
  string,
  { major: string; minor: string }
> = {
  C: { major: "c", minor: "a" },
  G: { major: "g", minor: "e" },
  D: { major: "d", minor: "b" },
  A: { major: "a", minor: "f#" },
  E: { major: "e", minor: "c#" },
  B: { major: "b", minor: "g#" },
  F: { major: "f", minor: "d" },
  Bb: { major: "bb", minor: "g" },
  Eb: { major: "eb", minor: "c" },
  Ab: { major: "ab", minor: "f" },
};

const MAJOR_KEY_ROOTS = Object.fromEntries(
  Object.entries(KEY_SIGNATURE_CONTEXTS).map(([signature, keys]) => [
    signature,
    keys.major,
  ])
) as Record<string, string>;

const NOTE_LABELS: Record<string, string> = {
  c: "C",
  "c#": "C#",
  db: "Db",
  d: "D",
  "d#": "D#",
  eb: "Eb",
  e: "E",
  f: "F",
  "f#": "F#",
  gb: "Gb",
  g: "G",
  "g#": "G#",
  ab: "Ab",
  a: "A",
  "a#": "A#",
  bb: "Bb",
  b: "B",
};

const SCALE_OFFSETS: Record<KeyMode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

const TRIAD_QUALITIES: Record<KeyMode, ("major" | "minor" | "dim")[]> = {
  major: ["major", "minor", "minor", "major", "major", "minor", "dim"],
  minor: ["minor", "dim", "major", "minor", "major", "major", "major"],
};

const ROMAN_NUMERALS: Record<KeyMode, string[]> = {
  major: ["I", "ii", "iii", "IV", "V", "vi", "vii dim"],
  minor: ["i", "ii dim", "III", "iv", "V", "VI", "VII"],
};

const PROGRESSION_TEMPLATES: Record<KeyMode, number[][]> = {
  major: [
    [1, 5, 6, 4],
    [1, 4, 5, 1],
    [6, 4, 1, 5],
    [1, 6, 4, 5],
    [4, 5, 3, 6],
  ],
  minor: [
    [1, 6, 3, 7],
    [1, 4, 5, 1],
    [1, 7, 6, 5],
    [6, 7, 1, 5],
    [1, 3, 7, 6],
  ],
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
  degree: number;
  name: string;
  rootPc: number;
  pcs: number[];
  pitches: string[];
};

function mod12(n: number) {
  return ((n % 12) + 12) % 12;
}

function pitchDistanceSemitones(a: number, b: number) {
  const diff = Math.abs(mod12(a - b));
  return Math.min(diff, 12 - diff);
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

function parsePitchToMidi(pitch: string) {
  const [name, octaveString] = pitch.split("/");
  if (!octaveString) return undefined;

  const pc = NOTE_TO_PC[name.toLowerCase()];
  if (pc === undefined) return undefined;

  const octave = Number(octaveString);
  if (Number.isNaN(octave)) return undefined;

  return octave * 12 + pc;
}

function midiToPitch(midi: number) {
  const octave = Math.floor(midi / 12);
  const pc = mod12(midi);
  return `${PC_TO_NOTE_SHARP[pc]}/${octave}`;
}

function getNearestPitchAbove(referenceMidi: number, pc: number) {
  let candidate = Math.floor(referenceMidi / 12) * 12 + mod12(pc);
  while (candidate < referenceMidi) {
    candidate += 12;
  }
  return candidate;
}

function getCloseChordVoicingPitches(
  rootPc: number,
  thirdPc: number,
  fifthPc: number,
  lowestMelodyMidi?: number
) {
  let rootMidi = rootPc + 12 * 2;
  let thirdMidi = getNearestPitchAbove(rootMidi, thirdPc);
  let fifthMidi = getNearestPitchAbove(rootMidi, fifthPc);

  let highestChordMidi = Math.max(rootMidi, thirdMidi, fifthMidi);

  while (
    lowestMelodyMidi !== undefined &&
    highestChordMidi >= lowestMelodyMidi &&
    rootMidi >= 12
  ) {
    rootMidi -= 12;
    thirdMidi = getNearestPitchAbove(rootMidi, thirdPc);
    fifthMidi = getNearestPitchAbove(rootMidi, fifthPc);
    highestChordMidi = Math.max(rootMidi, thirdMidi, fifthMidi);
  }

  return [
    midiToPitch(rootMidi),
    midiToPitch(thirdMidi),
    midiToPitch(fifthMidi),
  ];
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
      degree: degreeIndex + 1,
      name: romanNumerals[degreeIndex],
      rootPc: degreePc,
      pcs: [degreePc, thirdPc, fifthPc],
      pitches: getCloseChordVoicingPitches(degreePc, thirdPc, fifthPc),
    };
  });
}

function getTriadPcs(rootPc: number, quality: "major" | "minor" | "dim") {
  if (quality === "major") {
    return [rootPc, mod12(rootPc + 4), mod12(rootPc + 7)];
  }

  if (quality === "minor") {
    return [rootPc, mod12(rootPc + 3), mod12(rootPc + 7)];
  }

  return [rootPc, mod12(rootPc + 3), mod12(rootPc + 6)];
}

function getKeyContexts(keySignature: string): KeyContext[] {
  const signatureKeys = KEY_SIGNATURE_CONTEXTS[keySignature] ?? {
    major: "c",
    minor: "a",
  };

  return [
    {
      signature: keySignature,
      label: `${NOTE_LABELS[signatureKeys.major]} major`,
      tonicName: signatureKeys.major,
      tonicPc: NOTE_TO_PC[signatureKeys.major],
      mode: "major",
    },
    {
      signature: keySignature,
      label: `${NOTE_LABELS[signatureKeys.minor]} minor`,
      tonicName: signatureKeys.minor,
      tonicPc: NOTE_TO_PC[signatureKeys.minor],
      mode: "minor",
    },
  ];
}

function buildKeyChords(key: KeyContext): ChordCandidate[] {
  if (key.mode === "major") {
    return buildMajorKeyChords(key.signature);
  }

  const scalePcs = SCALE_OFFSETS[key.mode].map((offset) =>
    mod12(key.tonicPc + offset)
  );

  return scalePcs.map((degreePc, degreeIndex) => {
    const quality = TRIAD_QUALITIES[key.mode][degreeIndex];
    const pcs = getTriadPcs(degreePc, quality);

    return {
      degree: degreeIndex + 1,
      name: ROMAN_NUMERALS[key.mode][degreeIndex],
      rootPc: degreePc,
      pcs,
      pitches: getCloseChordVoicingPitches(pcs[0], pcs[1], pcs[2]),
    };
  });
}

function getMelodyPcs(
  measures: PlacedNote[][],
  getRenderedPitchFn: (note: PlacedNote) => string
) {
  return measures.flatMap((measureNotes) =>
    measureNotes.flatMap((note) => {
      if (note.kind === "rest") return [];

      const pc = pitchToPc(getRenderedPitchFn(note));
      return pc === undefined ? [] : [{ pc, durationSlots: note.durationSlots }];
    })
  );
}

function getMeasureLowestMelodyMidi(
  measureNotes: PlacedNote[],
  getRenderedPitchFn: (note: PlacedNote) => string
) {
  const melodyPitches = measureNotes
    .filter((note) => note.kind === "note")
    .map((note) => parsePitchToMidi(getRenderedPitchFn(note)))
    .filter((midi): midi is number => midi !== undefined);

  return melodyPitches.length > 0 ? Math.min(...melodyPitches) : undefined;
}

function inferKeyFromMelody(
  keySignature: string,
  measures: PlacedNote[][],
  getRenderedPitchFn: (note: PlacedNote) => string
) {
  const melodyPcs = getMelodyPcs(measures, getRenderedPitchFn);
  const candidateKeys = getKeyContexts(keySignature);

  if (melodyPcs.length === 0) {
    return candidateKeys[0];
  }

  let bestKey = candidateKeys[0];
  let bestScore = -Infinity;

  for (const key of candidateKeys) {
    const scalePcs = SCALE_OFFSETS[key.mode].map((offset) =>
      mod12(key.tonicPc + offset)
    );
    const dominantPc = mod12(key.tonicPc + 7);
    let score = 0;

    melodyPcs.forEach(({ pc, durationSlots }, index) => {
      if (scalePcs.includes(pc)) score += durationSlots;
      else score -= durationSlots * 2;

      if (pc === key.tonicPc) score += durationSlots * 0.8;
      if (pc === dominantPc) score += durationSlots * 0.35;
      if (index === melodyPcs.length - 1 && pc === key.tonicPc) score += 3;
    });

    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  return bestKey;
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
    if (melodyPc === undefined) continue;

    if (chord.pcs.includes(melodyPc)) {
      score += note.durationSlots;
    } else {
      const hasNearbyChordTone = chord.pcs.some((pc) => {
        const distance = pitchDistanceSemitones(pc, melodyPc);
        return distance > 0 && distance <= 3;
      });

      if (hasNearbyChordTone) {
        score -= note.durationSlots * 2;
      } else {
        score -= 1;
      }
    }
  }

  return score;
}

function chooseProgression(
  key: KeyContext,
  measures: PlacedNote[][],
  getRenderedPitchFn: (note: PlacedNote) => string
) {
  const chords = buildKeyChords(key);
  const templates = PROGRESSION_TEMPLATES[key.mode];
  const hasMelody = measures.some((measureNotes) =>
    measureNotes.some((note) => note.kind === "note")
  );

  const rankedTemplates = templates
    .map((template) => {
      const score = template.reduce((total, degree, measureIndex) => {
        const chord = chords[degree - 1];
        const measureNotes = measures[measureIndex] ?? [];
        return (
          total + scoreChordForMeasure(chord, measureNotes, getRenderedPitchFn)
        );
      }, 0);

      const cadenceBonus = template[3] === 1 || template[3] === 5 ? 2 : 0;

      return {
        template,
        score: hasMelody ? score + cadenceBonus : Math.random(),
      };
    })
    .sort((a, b) => b.score - a.score);

  const topChoices = rankedTemplates.slice(0, hasMelody ? 3 : templates.length);
  const chosen =
    topChoices[Math.floor(Math.random() * topChoices.length)] ??
    rankedTemplates[0];

  return chosen.template.map((degree) => chords[degree - 1]);
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
    const inferredKey = inferKeyFromMelody(
      keySignature,
      measures,
      getRenderedPitch
    );
    const progression = chooseProgression(
      inferredKey,
      measures,
      getRenderedPitch
    );

    const newChordMeasures: PlacedChord[][] = progression.map(
      (chord, measureIndex) => {
        const lowestMelodyMidi = getMeasureLowestMelodyMidi(
          measures[measureIndex],
          getRenderedPitch
        );

        return [
          {
            slot: 0,
            duration: "w",
            durationSlots: 8,
            pitches: getCloseChordVoicingPitches(
              chord.pcs[0],
              chord.pcs[1],
              chord.pcs[2],
              lowestMelodyMidi
            ),
            symbol: chord.name,
          },
        ];
      }
    );

    setChordMeasures(newChordMeasures);
    setProgressionInfo(
      `Generated in ${inferredKey.label}: ${progression
        .map((chord) => chord.name)
        .join(" - ")}`
    );
}


//playback
async function playMeasures() {
  await Tone.start();

  if (currentPartRef.current) {
    currentPartRef.current.dispose();
    currentPartRef.current = null;
  }

  if (currentSamplerRef.current) {
    currentSamplerRef.current.dispose();
    currentSamplerRef.current = null;
  }

  Tone.Transport.stop();
  Tone.Transport.cancel();

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

  currentSamplerRef.current = piano;

  await Tone.loaded();

  const safeBpm = Math.min(240, Math.max(40, bpm));
  Tone.Transport.bpm.value = safeBpm;

  const events: Array<{
    time: number;
    pitches: string[];
    duration: string;
  }> = [];

  const secondsPerBeat = 60 / safeBpm;
  const secondsPerEighth = secondsPerBeat / 2;

  measures.forEach((measureNotes, measureIndex) => {
    measureNotes.forEach((note) => {
      if (note.kind === "rest") return;

      const tonePitch = vexPitchToTonePitch(getRenderedPitch(note));
      const toneDuration = durationToToneDuration(note.duration);
      const totalEighthSlot = measureIndex * 8 + note.slot;
      const startTime = totalEighthSlot * secondsPerEighth;

      events.push({
        time: startTime,
        pitches: [tonePitch],
        duration: toneDuration,
      });
    });
  });

  chordMeasures.forEach((measureChords, measureIndex) => {
    measureChords.forEach((chord) => {
      const tonePitches = chord.pitches.map(vexPitchToTonePitch);
      const toneDuration = durationToToneDuration(chord.duration);
      const totalEighthSlot = measureIndex * 8 + chord.slot;
      const startTime = totalEighthSlot * secondsPerEighth;

      events.push({
        time: startTime,
        pitches: tonePitches,
        duration: toneDuration,
      });
    });
  });

  if (events.length === 0) {
    // Still reset playback state and ensure Transport is stopped.
    Tone.Transport.stop();
    return;
  }

  const part = new Tone.Part(
    (time, value: { pitches: string[]; duration: string }) => {
      piano.triggerAttackRelease(value.pitches, value.duration, time);
    },
    events
  );

  part.start(0);
  part.loop = false;
  currentPartRef.current = part;

  Tone.Transport.position = 0;
  Tone.Transport.start(undefined, 0);
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

return (
  <div className="bg-white border rounded-lg p-4 shadow space-y-4">
    {/* Top controls row */}
    <div
      className="flex items-end justify-between"
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
            onChange={(e) => setKeySignature(e.target.value)}
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
      <div className="flex items-end gap-2">
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
          <div className="text-xs invisible mb-1">x</div>
          <button
            onClick={clearChords}
            disabled={chordMeasures.every((measure) => measure.length === 0)}
            className={clearChordsButtonClass()}
          >
            Clear Chords
          </button>
        </div>
        <div>
          <div className="text-xs invisible mb-1">x</div>
          <button
            onClick={playMeasures}
            className="bg-green-700 text-white border border-green-900 rounded px-4 h-10 hover:bg-green-600"
          >
            Play
          </button>
        </div>
      </div>
    </div>

<p className="text-sm text-gray-700">{progressionInfo}</p>

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
