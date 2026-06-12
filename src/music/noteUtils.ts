import type { DurationName, KeyMode, PlacedNote, TimeSignature } from "./types";

export const DURATION_TO_SLOTS: Record<DurationName, number> = {
  w: 8,
  h: 4,
  q: 2,
  "8": 1,
};

// simple treble-clef pitch map, top to bottom
export const PITCHES_TOP_TO_BOTTOM = [
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

export const KEY_SIGNATURE_ACCIDENTALS: Record<
  string,
  Record<string, "#" | "b">
> = {
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

export const NOTE_TO_PC: Record<string, number> = {
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

export const PC_TO_NOTE_SHARP = [
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

export const NOTE_LETTERS = ["c", "d", "e", "f", "g", "a", "b"];
export const LETTER_TO_NATURAL_PC: Record<string, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
};

export const ACCIDENTAL_BY_DELTA: Record<number, string> = {
  0: "",
  1: "#",
  2: "##",
  10: "bb",
  11: "b",
};

export const NOTE_LABELS: Record<string, string> = {
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

export const SCALE_OFFSETS: Record<KeyMode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

const DOWNBEAT_METRIC_WEIGHT = 3.0;
const SECONDARY_STRONG_BEAT_METRIC_WEIGHT = 2.2;
const EVEN_BEAT_METRIC_WEIGHT = 1.6;
const ODD_BEAT_METRIC_WEIGHT = 1.3;
const OFFBEAT_METRIC_WEIGHT = 0.6;
const DOWNBEAT_MELODY_WEIGHT = 2.5;
const SECONDARY_STRONG_BEAT_MELODY_WEIGHT = 1.8;
const WEAK_BEAT_MELODY_WEIGHT = 0.8;

export const DEFAULT_TIME_SIGNATURE: TimeSignature = {
  beatsPerMeasure: 4,
  beatValue: 4,
};

const SLOTS_PER_WHOLE_NOTE = 8;
const DEFAULT_CHORD_ROOT_OCTAVE = 3;
const MIN_CHORD_MELODY_GAP_SEMITONES = 5;

export function mod12(n: number) {
  return ((n % 12) + 12) % 12;
}

export function getSlotsPerBeat(timeSignature: TimeSignature) {
  return SLOTS_PER_WHOLE_NOTE / timeSignature.beatValue;
}

export function getBeatSlots(timeSignature: TimeSignature) {
  const slotsPerBeat = getSlotsPerBeat(timeSignature);

  return Array.from(
    { length: timeSignature.beatsPerMeasure },
    (_, beatIndex) => beatIndex * slotsPerBeat
  );
}

export function getStrongBeatWeight(
  slot: number,
  timeSignature: TimeSignature
) {
  const slotsPerBeat = getSlotsPerBeat(timeSignature);

  if (slot === 0) return DOWNBEAT_MELODY_WEIGHT;

  if (
    timeSignature.beatsPerMeasure === 4 &&
    timeSignature.beatValue === 4 &&
    slot === 2 * slotsPerBeat
  ) {
    return SECONDARY_STRONG_BEAT_MELODY_WEIGHT;
  }

  return WEAK_BEAT_MELODY_WEIGHT;
}

// metric weight based on strong beats dependent on time signature
export function getMetricWeight(
  slot: number,
  timeSignature = DEFAULT_TIME_SIGNATURE
) {
  const slotsPerBeat = getSlotsPerBeat(timeSignature);
  const beatIndex = Math.floor(slot / slotsPerBeat);
  const isOnBeat = slot % slotsPerBeat === 0;

  if (slot === 0) return DOWNBEAT_METRIC_WEIGHT;

  if (
    timeSignature.beatsPerMeasure === 4 &&
    timeSignature.beatValue === 4 &&
    slot === 2 * slotsPerBeat
  ) {
    return SECONDARY_STRONG_BEAT_METRIC_WEIGHT;
  }

  if (isOnBeat) {
    return beatIndex % 2 === 0
      ? EVEN_BEAT_METRIC_WEIGHT
      : ODD_BEAT_METRIC_WEIGHT;
  }

  return OFFBEAT_METRIC_WEIGHT;
}

export function noteCoversSlot(note: PlacedNote, slot: number) {
  return note.slot <= slot && slot < note.slot + note.durationSlots;
}

export function getKeySignatureExtraWidth(keySignature: string) {
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

export function noteNameToPc(name: string) {
  const lowerName = name.toLowerCase();
  const naturalPc = LETTER_TO_NATURAL_PC[lowerName[0]];

  if (naturalPc === undefined) return undefined;

  const accidentalOffset = [...lowerName.slice(1)].reduce((sum, accidental) => {
    if (accidental === "#") return sum + 1;
    if (accidental === "b") return sum - 1;
    return sum;
  }, 0);

  return mod12(naturalPc + accidentalOffset);
}

export function pitchToPc(pitch: string) {
  const [name] = pitch.split("/");
  return noteNameToPc(name);
}

export function parsePitchToMidi(pitch: string) {
  const [name, octaveString] = pitch.split("/");
  if (!octaveString) return undefined;

  const pc = noteNameToPc(name);
  if (pc === undefined) return undefined;

  const octave = Number(octaveString);
  if (Number.isNaN(octave)) return undefined;

  return octave * 12 + pc;
}

export function midiToPitch(midi: number) {
  const octave = Math.floor(midi / 12);
  const pc = mod12(midi);
  return `${PC_TO_NOTE_SHARP[pc]}/${octave}`;
}

export function midiToSpelledPitch(midi: number, noteName: string) {
  const octave = Math.floor(midi / 12);
  return `${noteName}/${octave}`;
}

export function spellPitchClassForLetter(pc: number, letter: string) {
  const naturalPc = LETTER_TO_NATURAL_PC[letter];
  if (naturalPc === undefined) return PC_TO_NOTE_SHARP[pc];

  const accidental = ACCIDENTAL_BY_DELTA[mod12(pc - naturalPc)];
  return accidental === undefined ? PC_TO_NOTE_SHARP[pc] : `${letter}${accidental}`;
}

function getNearestPitchAbove(referenceMidi: number, pc: number) {
  let candidate = Math.floor(referenceMidi / 12) * 12 + mod12(pc);
  while (candidate < referenceMidi) {
    candidate += 12;
  }
  return candidate;
}

export function getCloseChordVoicingPitches(
  rootPc: number,
  thirdPc: number,
  fifthPc: number,
  noteNames?: string[],
  lowestMelodyMidi?: number
) {
  let rootMidi = rootPc + 12 * DEFAULT_CHORD_ROOT_OCTAVE;
  let thirdMidi = getNearestPitchAbove(rootMidi, thirdPc);
  let fifthMidi = getNearestPitchAbove(rootMidi, fifthPc);

  let highestChordMidi = Math.max(rootMidi, thirdMidi, fifthMidi);

  while (
    lowestMelodyMidi !== undefined &&
    highestChordMidi > lowestMelodyMidi - MIN_CHORD_MELODY_GAP_SEMITONES &&
    rootMidi >= 12
  ) {
    rootMidi -= 12;
    thirdMidi = getNearestPitchAbove(rootMidi, thirdPc);
    fifthMidi = getNearestPitchAbove(rootMidi, fifthPc);
    highestChordMidi = Math.max(rootMidi, thirdMidi, fifthMidi);
  }

  return [
    noteNames
      ? midiToSpelledPitch(rootMidi, noteNames[0])
      : midiToPitch(rootMidi),
    noteNames
      ? midiToSpelledPitch(thirdMidi, noteNames[1])
      : midiToPitch(thirdMidi),
    noteNames
      ? midiToSpelledPitch(fifthMidi, noteNames[2])
      : midiToPitch(fifthMidi),
  ];
}

export function getMeasureLowestMelodyMidi(
  measureNotes: PlacedNote[],
  getRenderedPitchFn: (note: PlacedNote) => string
) {
  const melodyPitches = measureNotes
    .filter((note) => note.kind === "note")
    .map((note) => parsePitchToMidi(getRenderedPitchFn(note)))
    .filter((midi): midi is number => midi !== undefined);

  return melodyPitches.length > 0 ? Math.min(...melodyPitches) : undefined;
}
