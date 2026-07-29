import type { HarmonyPreferences, StyleOption } from "../music/types";

export const DEFAULT_HARMONY_SUMMARY =
  "Use a clear, consonant progression with a strong resolution.";

export const DEFAULT_HARMONY_PROFILE: HarmonyPreferences = {
  style: "simple",
  melodyFitPriority: 1,
  consonancePriority: 0.9,
  descendingBassWeight: 0,
  complexity: 0.25,
  dissonanceTolerance: 0.1,
  cadenceStrength: 0.7,
  preferSevenths: false,
  preferSuspensions: false,
  voiceLeadingPriority: 0.75,
  playabilityRequired: true,
};

export type HarmonyPreferencePatch = {
  complexityDelta?: number;
  dissonanceDelta?: number;
  descendingBassDelta?: number;
  cadenceDelta?: number;
};

function clampPreference(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function applyHarmonyPreferencePatch(
  base: HarmonyPreferences,
  patch: HarmonyPreferencePatch,
): HarmonyPreferences {
  return {
    ...base,
    descendingBassWeight: clampPreference(
      base.descendingBassWeight + (patch.descendingBassDelta ?? 0),
    ),
    complexity: clampPreference(base.complexity + (patch.complexityDelta ?? 0)),
    dissonanceTolerance: clampPreference(
      base.dissonanceTolerance + (patch.dissonanceDelta ?? 0),
    ),
    cadenceStrength: clampPreference(
      base.cadenceStrength + (patch.cadenceDelta ?? 0),
    ),
  };
}

export type ResolveHarmonyPreferencesOptions = {
  style?: StyleOption;
  patch?: HarmonyPreferencePatch;
};

export function resolveHarmonyPreferences(
  base: HarmonyPreferences,
  options: ResolveHarmonyPreferencesOptions = {},
): HarmonyPreferences {
  return {
    ...applyHarmonyPreferencePatch(base, options.patch ?? {}),
    style: options.style ?? base.style,
  };
}
