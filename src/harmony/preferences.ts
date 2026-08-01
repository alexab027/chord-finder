import type {
  HarmonyPreferences,
  StyleIntensity,
  StyleOption,
} from "../music/types";

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
  simplicityLevel: 1,
  jazzLevel: 0,
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
export function resolveCreativeRevisionPreferences(
  active: HarmonyPreferences,
  interpreted: HarmonyPreferences,
  patch: HarmonyPreferencePatch = {},
  relativeStyleChange?: "simpler" | "jazzier",
): HarmonyPreferences {
  const styleChanged = interpreted.style !== active.style;

  const resolved = styleChanged
    ? resolveHarmonyPreferences(interpreted, {
        patch,
      })
    : resolveHarmonyPreferences(active, {
        patch,
      });

  if (relativeStyleChange === "simpler") {
    const current =
      active.simplicityLevel ?? (active.style === "simple" ? 1 : 0);
    return {
      ...resolved,
      style: "simple",
      simplicityLevel: Math.min(3, current + 1) as StyleIntensity,
      jazzLevel: 0,
      styleTransform: "simple",
    };
  }
  if (relativeStyleChange === "jazzier") {
    const current = active.jazzLevel ?? (active.style === "jazzy" ? 1 : 0);
    return {
      ...resolved,
      style: "jazzy",
      simplicityLevel: 0,
      jazzLevel: Math.min(3, current + 1) as StyleIntensity,
      styleTransform: "jazzy",
    };
  }

  return {
    ...resolved,
    simplicityLevel:
      resolved.simplicityLevel ?? (resolved.style === "simple" ? 1 : 0),
    jazzLevel: resolved.jazzLevel ?? (resolved.style === "jazzy" ? 1 : 0),
    styleTransform: styleChanged ? resolved.style : undefined,
  };
}
