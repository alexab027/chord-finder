import type { StyleOption } from "@/src/music/types";
import type { ChordEditAction } from "@/src/harmony/actions";

export type HarmonyIntent =
  | "generate_new"
  | "revise_existing"
  | "clarify"
  | "answer_question";

export type PendingClarification = {
  originalMessage: string;
  question: string;
  possibleIntents?: string[];
};

export type InterpretedStyle = {
  primaryStyle: StyleOption;
  descendingBassWeight: number;
  complexity: number;
  dissonanceTolerance: number;
  cadenceStrength: number;
  preferSevenths: boolean;
  preferSuspensions: boolean;
  mood: string[];
  summary: string;
};

export const DEFAULT_INTERPRETED_STYLE: InterpretedStyle = {
  primaryStyle: "simple",
  descendingBassWeight: 0,
  complexity: 0.25,
  dissonanceTolerance: 0.2,
  cadenceStrength: 0.7,
  preferSevenths: false,
  preferSuspensions: false,
  mood: [],
  summary: "Use a clear, consonant progression with a strong resolution.",
};

// Mirrors the StyleOption union so the server route can validate the model's
// chosen style without weakening primaryStyle to a broad string.
export const ALLOWED_STYLES: StyleOption[] = [
  "simple",
  "jazzy",
  "bluesy",
  "descendingBass",
];

// Returned by the interpretation route only when the request says a progression
// already exists. It tells the deterministic engine HOW MUCH to keep, never
// which chords to use — the model does not choose chords.
export type RevisionIntent = {
  // Keep the same general progression vs. allow broad replacement.
  preserveOverallProgression: boolean;
  // 1-based measure numbers the user explicitly asked to keep unchanged.
  preserveChordPositions: number[];
  // 0 = tiny tweak, 1 = large change. Scales how strongly similarity is rewarded.
  changeAmount: number;
  // Relative nudges (in [-1, 1]) applied on top of the current preferences.
  requestedChanges: {
    complexityDelta?: number;
    dissonanceDelta?: number;
    descendingBassDelta?: number;
    cadenceDelta?: number;
  };
};

export const DEFAULT_REVISION_INTENT: RevisionIntent = {
  preserveOverallProgression: true,
  preserveChordPositions: [],
  changeAmount: 0.3,
  requestedChanges: {},
};

export type HarmonyRouterResponse = InterpretedStyle & {
  intent: HarmonyIntent;
  confidence: number;
  warning?: string;
  revision?: RevisionIntent;
  actions?: ChordEditAction[];
  clarificationQuestion?: string;
  assistantMessage?: string;
};
