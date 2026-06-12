export type DurationName = "w" | "h" | "q" | "8";
export type AccidentalName = "#" | "b" | "n" | null;

export type PlacedNote = {
  slot: number;
  duration: DurationName;
  durationSlots: number;
  pitch: string;
  kind: "note" | "rest";
  accidental: AccidentalName;
};

export type PlacedChord = {
  slot: number;
  duration: DurationName;
  durationSlots: number;
  pitches: string[];
  symbol: string;
  score?: number;
  reasons?: string[];
};

export type KeyMode = "major" | "minor";
export type GenerationMode = "automatic" | KeyMode;
export type StyleOption = "simple" | "jazzy" | "bluesy" | "descendingBass";

export type KeyContext = {
  signature: string;
  label: string;
  tonicName: string;
  tonicPc: number;
  mode: KeyMode;
};

export type SuspendedChordQuality = "sus" | "sus2" | "sus4";
export type ChordQuality =
  | "triad"
  | SuspendedChordQuality
  | "add9"
  | "maj7"
  | "min7"
  | "dom7";

export type ChordCandidate = {
  degree: number;
  name: string;
  rootPc: number;
  bassPc: number;
  pcs: number[];
  noteNames: string[];
  pitches: string[];
  quality: ChordQuality;
  keyFit: "diatonic" | "borrowed" | "unrelated";
};

export type ScoreResult = {
  points: number;
  reasons: string[];
};

export type ScoredChord = {
  chord: ChordCandidate;
  score: number;
  reasons: string[];
};

export type ChordScoreContext = {
  key: KeyContext;
  style: StyleOption;
  measureNotes: PlacedNote[];
  getRenderedPitchFn: (note: PlacedNote) => string;
  previousChord?: ChordCandidate;
};

export type TimeSignature = {
  beatsPerMeasure: number;
  beatValue: number;
};
