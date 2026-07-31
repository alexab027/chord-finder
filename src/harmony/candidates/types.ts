import type { InterpretedStyle } from "../../ai/types";
import type {
  GenerationPreferences,
  KeyContext,
  PlacedChord,
  PlacedNote,
  RevisionContext,
  ScoredChord,
  StyleOption,
} from "../../music/types";

export type CandidateRole = "closest" | "moderate" | "distinct";
export type CandidateMode = "generate_new" | "revise_existing";
export type CandidatePoolSource =
  | "ranked_engine"
  | "base_rescored"
  | "base_quality_alternative"
  | "style_transform";

export type CandidatePoolEntry = {
  symbolicHash: string;
  progression: ScoredChord[];
  totalScore: number;
  source: CandidatePoolSource;
};

export type CandidateGenerationContext = {
  key: KeyContext;
  measures: PlacedNote[][];
  getRenderedPitchFn: (note: PlacedNote) => string;
  style: StyleOption;
  preferences?: GenerationPreferences;
  revision?: RevisionContext;
};

export type CandidatePoolOptions = {
  maxCandidates: number;
  maxRankedCandidates: number;
  maxBaseCandidates: number;
  maxStyleCandidates: number;
};

export type RoleSelectedCandidate = CandidatePoolEntry & {
  role: CandidateRole;
  distanceFromBase?: number;
  distanceFromBestFit?: number;
  exactPositionMatches: number;
};

export type ProgressionCandidate = {
  id: string;
  symbolicHash: string;
  role: CandidateRole;
  progression: ScoredChord[];
  voicedProgression: PlacedChord[][];
  totalScore: number;
  distanceFromBase?: number;
};

export type CandidateSet = {
  id: string;
  sessionId: string;
  requestId: string;
  mode: CandidateMode;
  keyLabel: string;
  commitLabel: "Generated" | "Updated";
  baseProgression: ScoredChord[] | null;
  baseVoicedProgression: PlacedChord[][];
  baseInterpretation: InterpretedStyle | null;
  resultInterpretation: InterpretedStyle;
  candidates: ProgressionCandidate[];
  previewedCandidateId: string;
  status: "previewing" | "selected" | "cancelled";
};
