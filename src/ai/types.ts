import type { StyleOption } from "@/src/music/types";

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
