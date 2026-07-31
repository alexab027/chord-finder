import type { InterpretedStyle } from "./types";
import type { GenerationPreferences } from "@/src/music/types";

export function toGenerationPreferences(
  interpretation: InterpretedStyle,
): GenerationPreferences {
  return {
    style: interpretation.primaryStyle,
    melodyFitPriority: interpretation.melodyFitPriority,
    consonancePriority: interpretation.consonancePriority,
    descendingBassWeight: interpretation.descendingBassWeight,
    complexity: interpretation.complexity,
    dissonanceTolerance: interpretation.dissonanceTolerance,
    cadenceStrength: interpretation.cadenceStrength,
    preferSevenths: interpretation.preferSevenths,
    preferSuspensions: interpretation.preferSuspensions,
    voiceLeadingPriority: interpretation.voiceLeadingPriority,
    playabilityRequired: interpretation.playabilityRequired,
    simplicityLevel:
      interpretation.simplicityLevel ??
      (interpretation.primaryStyle === "simple" ? 1 : 0),
    jazzLevel:
      interpretation.jazzLevel ??
      (interpretation.primaryStyle === "jazzy" ? 1 : 0),
  };
}
