import type { StyleOption } from "@/src/music/types";
import type { ChordEditAction } from "@/src/harmony/actions";
import {
  DEFAULT_HARMONY_PROFILE,
  DEFAULT_HARMONY_SUMMARY,
} from "@/src/harmony/preferences";

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
  mood: string[];
  summary: string;
};

export const DEFAULT_INTERPRETED_STYLE: InterpretedStyle = {
  primaryStyle: DEFAULT_HARMONY_PROFILE.style,
  melodyFitPriority: DEFAULT_HARMONY_PROFILE.melodyFitPriority,
  consonancePriority: DEFAULT_HARMONY_PROFILE.consonancePriority,
  descendingBassWeight: DEFAULT_HARMONY_PROFILE.descendingBassWeight,
  complexity: DEFAULT_HARMONY_PROFILE.complexity,
  dissonanceTolerance: DEFAULT_HARMONY_PROFILE.dissonanceTolerance,
  cadenceStrength: DEFAULT_HARMONY_PROFILE.cadenceStrength,
  preferSevenths: DEFAULT_HARMONY_PROFILE.preferSevenths,
  preferSuspensions: DEFAULT_HARMONY_PROFILE.preferSuspensions,
  voiceLeadingPriority: DEFAULT_HARMONY_PROFILE.voiceLeadingPriority,
  playabilityRequired: DEFAULT_HARMONY_PROFILE.playabilityRequired,
  mood: [],
  summary: DEFAULT_HARMONY_SUMMARY,
};

// Mirrors the StyleOption union so the server route can validate the model's
// chosen style without weakening primaryStyle to a broad string.
export const ALLOWED_STYLES: StyleOption[] = ["simple", "jazzy"];

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
