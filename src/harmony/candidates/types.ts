import type { InterpretedStyle } from "../../ai/types";
import type { PlacedChord, ScoredChord } from "../../music/types";

export type CandidateRole = "closest" | "moderate" | "distinct";

export type ProgressionCandidate = {
  id: string;
  role: CandidateRole;
  progression: ScoredChord[];
  voicedProgression: PlacedChord[][];
};

export type CandidateSet = {
  id: string;
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
