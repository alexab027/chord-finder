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
export type StyleOption = "simple" | "jazzy";
export type StyleIntensity = 0 | 1 | 2 | 3;

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
  /** Compatibility alias; always equal to romanNumeral. */
  name: string;
  romanNumeral: string;
  absoluteSymbol: string;
  rootName: string;
  rootPc: number;
  bassPc: number;
  bassName?: string;
  inversion?: number;
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
  bassMidi?: number;
};

export type GenerationPreferences = {
  style: StyleOption;
  melodyFitPriority: number;
  consonancePriority: number;
  descendingBassWeight: number;
  complexity: number;
  dissonanceTolerance: number;
  cadenceStrength: number;
  preferSevenths: boolean;
  preferSuspensions: boolean;
  voiceLeadingPriority: number;
  playabilityRequired: boolean;
  simplicityLevel?: StyleIntensity;
  jazzLevel?: StyleIntensity;
  styleTransform?: StyleOption;
};

export type HarmonyPreferences = GenerationPreferences;

// Identity of one chord in the progression being revised. Used to reward the
// engine for staying close to the user's current progression.
export type RevisionChordTarget = {
  degree: number;
  rootPc: number;
  quality: ChordQuality;
  bassPc: number;
  inversion?: number;
};

export type RevisionContext = {
  // Previous progression's chord identities, indexed by measure.
  targets: (RevisionChordTarget | undefined)[];
  preserveOverallProgression: boolean;
  // 1-based measure numbers to keep fixed.
  preserveChordPositions: number[];
  // 0 = keep almost everything, 1 = free to change a lot.
  changeAmount: number;
};

export type ChordScoreContext = {
  key: KeyContext;
  style: StyleOption;
  measureNotes: PlacedNote[];
  measureIndex: number;
  measureCount: number;
  getRenderedPitchFn: (note: PlacedNote) => string;
  previousChord?: ChordCandidate;
  // Present only on the AI-interpreted path. When undefined, scoring behaves
  // exactly as the dropdown-only engine always has.
  preferences?: GenerationPreferences;
  // Revision similarity scoring. All undefined on a fresh (non-revision)
  // generation, leaving scoring unchanged.
  revision?: {
    preserveOverallProgression: boolean;
    changeAmount: number;
  };
  revisionTarget?: RevisionChordTarget;
  revisionLocked?: boolean;
};

export type TimeSignature = {
  beatsPerMeasure: number;
  beatValue: number;
};
