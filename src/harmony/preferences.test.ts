import { describe, expect, it } from "vitest";
import { DEFAULT_INTERPRETED_STYLE } from "../ai/types";
import { toGenerationPreferences } from "../ai/toGenerationPreferences";
import {
  applyHarmonyPreferencePatch,
  DEFAULT_HARMONY_PROFILE,
  resolveCreativeRevisionPreferences,
  resolveHarmonyPreferences,
} from "./preferences";

describe("default harmony profile", () => {
  //style-switching tests
  it("applies the revision patch when switching from jazzy to simple", () => {
    const active = {
      ...DEFAULT_HARMONY_PROFILE,
      style: "jazzy" as const,
      complexity: 0.8,
      dissonanceTolerance: 0.5,
      preferSevenths: true,
      preferSuspensions: true,
    };

    const interpreted = {
      ...DEFAULT_HARMONY_PROFILE,
      style: "simple" as const,
      complexity: 0.4,
      dissonanceTolerance: 0.3,
      preferSevenths: false,
      preferSuspensions: false,
    };

    const resolved = resolveCreativeRevisionPreferences(active, interpreted, {
      complexityDelta: -0.5,
      dissonanceDelta: -0.3,
    });

    expect(resolved).toEqual({
      ...interpreted,
      complexity: 0,
      dissonanceTolerance: 0,
      styleTransform: "simple",
    });
  });
  it("applies a relative patch when the style is unchanged", () => {
    const active = {
      ...DEFAULT_HARMONY_PROFILE,
      style: "simple" as const,
      complexity: 0.6,
      cadenceStrength: 0.7,
    };

    const interpreted = {
      ...DEFAULT_HARMONY_PROFILE,
      style: "simple" as const,
      complexity: 0,
      cadenceStrength: 0,
    };

    const resolved = resolveCreativeRevisionPreferences(active, interpreted, {
      complexityDelta: -0.2,
    });

    expect(resolved.complexity).toBeCloseTo(0.4);
    expect(resolved.cadenceStrength).toBe(0.7);
  });
  it("blank interpretation defaults to the centralized high-consonance profile", () => {
    expect(toGenerationPreferences(DEFAULT_INTERPRETED_STYLE)).toEqual(
      DEFAULT_HARMONY_PROFILE,
    );
    expect(DEFAULT_HARMONY_PROFILE.melodyFitPriority).toBe(1);
    expect(DEFAULT_HARMONY_PROFILE.consonancePriority).toBe(0.9);
    expect(DEFAULT_HARMONY_PROFILE.dissonanceTolerance).toBe(0.1);
    expect(DEFAULT_HARMONY_PROFILE.playabilityRequired).toBe(true);
  });

  it("explicit style fields override blank defaults", () => {
    const explicit = toGenerationPreferences({
      ...DEFAULT_INTERPRETED_STYLE,
      primaryStyle: "jazzy",
      complexity: 0.8,
      dissonanceTolerance: 0.45,
      preferSevenths: true,
    });

    expect(explicit.style).toBe("jazzy");
    expect(explicit.complexity).toBe(0.8);
    expect(explicit.dissonanceTolerance).toBe(0.45);
    expect(explicit.preferSevenths).toBe(true);
    expect(explicit.melodyFitPriority).toBe(
      DEFAULT_HARMONY_PROFILE.melodyFitPriority,
    );
  });

  it("patching one field does not reset unrelated profile fields", () => {
    const patched = applyHarmonyPreferencePatch(DEFAULT_HARMONY_PROFILE, {
      complexityDelta: 0.2,
    });

    expect(patched.complexity).toBeCloseTo(0.45);
    expect(patched.dissonanceTolerance).toBe(
      DEFAULT_HARMONY_PROFILE.dissonanceTolerance,
    );
    expect(patched.preferSevenths).toBe(DEFAULT_HARMONY_PROFILE.preferSevenths);
    expect(patched.descendingBassWeight).toBe(
      DEFAULT_HARMONY_PROFILE.descendingBassWeight,
    );
  });

  // Mirrors the requestedActions branch of handleReviseExistingProgression:
  // a combined "replace chord 3 with Dm7 and make it jazzier" request applies
  // ONLY the returned preference patch to the current active preferences.
  it("combined chord-action + preference request applies only the returned patch", () => {
    const activePreferences = toGenerationPreferences({
      ...DEFAULT_INTERPRETED_STYLE,
      primaryStyle: "jazzy",
      complexity: 0.4,
      voiceLeadingPriority: 0.6,
      preferSevenths: true,
    });

    const patched = applyHarmonyPreferencePatch(activePreferences, {
      complexityDelta: 0.2,
    });

    expect(patched.complexity).toBeCloseTo(0.6);
    // Every unrelated preference is preserved.
    expect(patched.style).toBe("jazzy");
    expect(patched.voiceLeadingPriority).toBe(0.6);
    expect(patched.preferSevenths).toBe(true);
    expect(patched.dissonanceTolerance).toBe(
      activePreferences.dissonanceTolerance,
    );
  });
  it("applies an interpreted jazzy style to a creative revision", () => {
    const resolved = resolveHarmonyPreferences(DEFAULT_HARMONY_PROFILE, {
      style: "jazzy",
    });

    expect(resolved.style).toBe("jazzy");
  });

  it("switches a jazzy progression back to simple", () => {
    const resolved = resolveHarmonyPreferences(
      { ...DEFAULT_HARMONY_PROFILE, style: "jazzy" },
      { style: "simple" },
    );

    expect(resolved.style).toBe("simple");
  });

  it("preserves the active style when no style change is supplied", () => {
    const resolved = resolveHarmonyPreferences(
      { ...DEFAULT_HARMONY_PROFILE, style: "jazzy" },
      {
        patch: { complexityDelta: 0.2 },
      },
    );

    expect(resolved.style).toBe("jazzy");
  });
  // Mirrors the "replace chord 3 with Dm7 and use descending bass" case: the
  // style is handled separately, so the returned preference patch is empty and
  // must leave the active numeric preferences untouched.
  it("a style-only revision (empty patch) leaves active preferences untouched", () => {
    const activePreferences = toGenerationPreferences({
      ...DEFAULT_INTERPRETED_STYLE,
      complexity: 0.4,
      descendingBassWeight: 0.3,
    });

    expect(applyHarmonyPreferencePatch(activePreferences, {})).toEqual(
      activePreferences,
    );
  });

  it("advances repeated simpler requests through discrete levels after complexity clamps", () => {
    const active = {
      ...DEFAULT_HARMONY_PROFILE,
      complexity: 0,
      simplicityLevel: 1 as const,
    };
    const first = resolveCreativeRevisionPreferences(
      active,
      active,
      { complexityDelta: -1 },
      "simpler",
    );
    const second = resolveCreativeRevisionPreferences(
      first,
      first,
      { complexityDelta: -1 },
      "simpler",
    );

    expect(first.complexity).toBe(0);
    expect(first.simplicityLevel).toBe(2);
    expect(second.complexity).toBe(0);
    expect(second.simplicityLevel).toBe(3);
  });

  it("advances repeated jazzier requests independently", () => {
    const active = {
      ...DEFAULT_HARMONY_PROFILE,
      style: "jazzy" as const,
      simplicityLevel: 0 as const,
      jazzLevel: 1 as const,
    };
    const next = resolveCreativeRevisionPreferences(
      active,
      active,
      {},
      "jazzier",
    );

    expect(next.style).toBe("jazzy");
    expect(next.jazzLevel).toBe(2);
    expect(next.simplicityLevel).toBe(0);
  });
});
